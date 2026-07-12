import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CameraError, isCameraSupported } from "@/core/ocr";
import type { CameraStreamProvider } from "@/core/ocr";

import type { UseOcr } from "./use-ocr";

import { ScannerPage } from "./scanner-page";

// jsdom は navigator.mediaDevices を持たないため、テストごとに制御できるよう
// isCameraSupported をモックに差し替える。デフォルトは true にして
// 既存カメラテストが getUserMedia 経路を通るようにする。
vi.mock("@/core/ocr", async (importActual) => {
  const actual = await importActual<typeof import("@/core/ocr")>();
  return {
    ...actual,
    isCameraSupported: vi.fn(() => true),
  };
});

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
    // mock implementation
  });
  // jsdom は canvas 2d と再生を実装しないため撮影経路をモックする。
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
    callback(new Blob(["x"], { type: "image/jpeg" }));
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScannerPage アップロード", () => {
  it("shows the privacy note on the idle screen", () => {
    render(<ScannerPage />);
    expect(screen.getByText(/保存・送信されません/)).toBeInTheDocument();
  });

  it("previews a selected image file", () => {
    render(<ScannerPage />);

    const input = screen.getByLabelText("画像を選ぶ", { selector: "input" });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    const preview = screen.getByRole("img", { name: /プレビュー/ });
    expect(preview).toHaveAttribute("src", "blob:mock");
  });

  it("returns to idle when retaking", () => {
    render(<ScannerPage />);

    const input = screen.getByLabelText("画像を選ぶ", { selector: "input" });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: "選び直す" }));

    expect(screen.queryByRole("img", { name: /プレビュー/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /画像を選ぶ/ })).toBeInTheDocument();
  });
});

const fakeStream = (): MediaStream => ({ getTracks: () => [] }) as unknown as MediaStream;

const providerReturning = (stream: MediaStream): CameraStreamProvider => ({
  requestStream: () => Promise.resolve(stream),
});

const providerRejecting = (error: CameraError): CameraStreamProvider => ({
  requestStream: () => Promise.reject(error),
});

describe("ScannerPage カメラ", () => {
  beforeEach(() => {
    // restoreAllMocks() が vi.fn() の実装を消すことがあるため、
    // カメラテストごとにデフォルト値（true）を明示的に復元する。
    vi.mocked(isCameraSupported).mockReturnValue(true);
  });

  it("shows a permission error and fallback when the stream is denied", async () => {
    render(
      <ScannerPage
        cameraStreamProvider={providerRejecting(new CameraError("permission-denied"))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /撮る/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/カメラ/);
    // フォールバックとして画像選択が残る。
    expect(screen.getByRole("button", { name: /画像を選ぶ/ })).toBeInTheDocument();
  });

  it("shows the live camera and returns to idle on cancel", async () => {
    render(<ScannerPage cameraStreamProvider={providerReturning(fakeStream())} />);

    fireEvent.click(screen.getByRole("button", { name: /撮る/ }));

    const cancel = await screen.findByRole("button", { name: "キャンセル" });
    fireEvent.click(cancel);

    expect(screen.getByRole("button", { name: /撮る/ })).toBeInTheDocument();
  });

  it("captures a frame into a preview", async () => {
    render(<ScannerPage cameraStreamProvider={providerReturning(fakeStream())} />);

    fireEvent.click(screen.getByRole("button", { name: /撮る/ }));
    const shutter = await screen.findByRole("button", { name: "シャッター" });
    fireEvent.click(shutter);

    const preview = await screen.findByRole("img", { name: /プレビュー/ });
    expect(preview).toHaveAttribute("src", "blob:mock");
  });

  it("routes to OS-camera input instead of getUserMedia when camera is unsupported", () => {
    const requestStream = vi.fn();
    vi.mocked(isCameraSupported).mockReturnValue(false);

    render(<ScannerPage cameraStreamProvider={{ requestStream }} />);

    fireEvent.click(screen.getByRole("button", { name: /撮る/ }));

    // getUserMedia 非対応時は requestStream を呼ばずに OS カメラ入力を起動する。
    expect(requestStream).not.toHaveBeenCalled();
  });

  it("shows OS-camera fallback button in the permission-error state", async () => {
    render(
      <ScannerPage
        cameraStreamProvider={providerRejecting(new CameraError("permission-denied"))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /撮る/ }));

    await screen.findByRole("alert");
    // 権限拒否時は OS カメラボタンとライブラリ選択の両方が提示される。
    expect(screen.getByLabelText("端末のカメラで撮影")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /画像を選ぶ/ })).toBeInTheDocument();
  });
});

// OcrPanel.test.tsx の makeOcrStub をローカルで複製する。
// 共有テストユーティリティは作らず、各テストファイル内で完結させる。
const makeOcrStub = (overrides: Partial<UseOcr>): UseOcr => ({
  phase: "idle",
  progress: 0,
  requestRecognize: () => Promise.resolve(),
  grantConsentAndRecognize: () => Promise.resolve(),
  cancel: () => {
    // mock implementation
  },
  reset: () => {
    // mock implementation
  },
  ...overrides,
});

// ファイル選択でプレビュー状態へ遷移する共通手順。
const enterPreviewWithFile = () => {
  const input = screen.getByLabelText("画像を選ぶ", { selector: "input" });
  const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
};

describe("ScannerPage OCR 配線", () => {
  it("注入した ocr スタブの phase が OcrPanel に反映される", () => {
    // done フェーズのスタブを注入し、認識テキストがプレビュー画面に出ることを確認する。
    // これにより ocr prop が useOcr() デフォルトより優先されていることを保証する。
    const result = { text: "第一条 テスト", confidence: 90, words: [] };
    render(<ScannerPage ocr={makeOcrStub({ phase: "done", result })} />);

    enterPreviewWithFile();

    expect(screen.getByText(/第一条 テスト/)).toBeInTheDocument();
  });

  it("選び直すボタンで ocr.reset() が呼ばれる", () => {
    // reset に vi.fn() スパイを仕込み、handleDiscard 経路が reset を呼ぶことを確認する。
    const resetSpy = vi.fn();
    render(<ScannerPage ocr={makeOcrStub({ reset: resetSpy })} />);

    enterPreviewWithFile();
    fireEvent.click(screen.getByRole("button", { name: "選び直す" }));

    expect(resetSpy).toHaveBeenCalledOnce();
  });
});
