import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";

import type { OcrResult } from "@/core/ocr";

import { OcrPanel } from "./ocr-panel";
import type { UseOcr } from "./use-ocr";

// 決定的な OCR スタブ。phase を段階的に返す簡易 fake。
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

// テスト用ダミー Blob。実際の画像内容は不要。
const dummyBlob = new Blob(["x"], { type: "image/jpeg" });

it("done フェーズで認識テキストを表示する", () => {
  const result: OcrResult = { text: "第一条 テスト", confidence: 90, words: [] };
  render(<OcrPanel blob={dummyBlob} ocr={makeOcrStub({ phase: "done", result })} />);
  expect(screen.getByText(/第一条 テスト/)).toBeInTheDocument();
});

it("recognizing フェーズでキャンセルボタンを出す", () => {
  let cancelled = false;
  render(
    <OcrPanel
      blob={dummyBlob}
      ocr={makeOcrStub({ phase: "recognizing", progress: 0.5, cancel: () => (cancelled = true) })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /キャンセル/ }));
  expect(cancelled).toBe(true);
});

it("error フェーズで再試行導線を出す", async () => {
  render(
    <OcrPanel
      blob={dummyBlob}
      ocr={makeOcrStub({ phase: "error", errorKind: "recognize-failed" })}
    />,
  );
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
});

it("idle フェーズで読み取るボタンを出す", () => {
  let recognized = false;
  render(
    <OcrPanel
      blob={dummyBlob}
      ocr={makeOcrStub({
        phase: "idle",
        requestRecognize: () => {
          recognized = true;
          return Promise.resolve();
        },
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /条文を読み取る/ }));
  expect(recognized).toBe(true);
});

it("consent フェーズで同意ダイアログと実行・やめるボタンを出す", () => {
  let granted = false;
  let resetCalled = false;
  render(
    <OcrPanel
      blob={dummyBlob}
      ocr={makeOcrStub({
        phase: "consent",
        grantConsentAndRecognize: () => {
          granted = true;
          return Promise.resolve();
        },
        reset: () => {
          resetCalled = true;
        },
      })}
    />,
  );
  expect(screen.getByText(/日本語モデル/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /実行/ }));
  expect(granted).toBe(true);

  // やめるは reset を呼ぶ
  fireEvent.click(screen.getByRole("button", { name: /やめる/ }));
  expect(resetCalled).toBe(true);
});

it("loading-model フェーズで進捗とキャンセルボタンを出す", () => {
  let cancelled = false;
  render(
    <OcrPanel
      blob={dummyBlob}
      ocr={makeOcrStub({
        phase: "loading-model",
        progress: 0.3,
        cancel: () => (cancelled = true),
      })}
    />,
  );
  // 進捗エリアが aria-live で公開されている
  expect(screen.getByRole("status")).toBeInTheDocument();
  // パーセント表示（30%）
  expect(screen.getByText(/30\s*%/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /キャンセル/ }));
  expect(cancelled).toBe(true);
});
