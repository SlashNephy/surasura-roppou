import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OcrRecognizer, OcrResult } from "@/core/ocr";

import { useOcr } from "./use-ocr";

// jsdom は createImageBitmap / canvas.toBlob を実装していないため、
// prepareImageForOcr を恒等変換でスタブ化してフックの状態遷移を検証する。
vi.mock("@/core/ocr", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/core/ocr")>();
  return {
    ...original,
    prepareImageForOcr: (blob: Blob) => Promise.resolve(blob),
  };
});

const ocrResult: OcrResult = { text: "第一条", confidence: 88, words: [] };

const fakeRecognizer = (
  impl: (
    blob: Blob,
    opts: { signal?: AbortSignal; onProgress?: (p: never) => void },
  ) => Promise<OcrResult>,
  terminate?: () => Promise<void>,
): OcrRecognizer => ({
  recognize: impl,
  terminate: terminate ?? (() => Promise.resolve()),
});

afterEach(() => {
  localStorage.clear();
});

describe("useOcr", () => {
  it("未同意なら consent フェーズで待つ", async () => {
    const { result: hook } = renderHook(() =>
      useOcr(fakeRecognizer(() => Promise.resolve(ocrResult))),
    );
    await act(async () => {
      await hook.current.requestRecognize(new Blob(["x"]));
    });
    expect(hook.current.phase).toBe("consent");
  });

  it("同意して認識すると done で結果を持つ", async () => {
    const { result: hook } = renderHook(() =>
      useOcr(fakeRecognizer(() => Promise.resolve(ocrResult))),
    );
    await act(async () => {
      await hook.current.grantConsentAndRecognize(new Blob(["x"]));
    });
    await waitFor(() => {
      expect(hook.current.phase).toBe("done");
    });
    expect(hook.current.result?.text).toBe("第一条");
  });

  it("同意済みなら consent を飛ばして認識する", async () => {
    localStorage.setItem("surasura:ocr-model-consent", "granted");
    const { result: hook } = renderHook(() =>
      useOcr(fakeRecognizer(() => Promise.resolve(ocrResult))),
    );
    await act(async () => {
      await hook.current.requestRecognize(new Blob(["x"]));
    });
    await waitFor(() => {
      expect(hook.current.phase).toBe("done");
    });
  });

  it("認識失敗で error フェーズになる", async () => {
    const { result: hook } = renderHook(() =>
      useOcr(fakeRecognizer(() => Promise.reject(new Error("boom")))),
    );
    await act(async () => {
      await hook.current.grantConsentAndRecognize(new Blob(["x"]));
    });
    await waitFor(() => {
      expect(hook.current.phase).toBe("error");
    });
    expect(hook.current.errorKind).toBe("recognize-failed");
  });

  // Finding 1 & 2: cancel() → idle 遷移と AbortError catch パスの検証。
  // signal の abort イベントで DOMException("AbortError") を reject することで、
  // use-ocr.ts の catch ブランチ（AbortError → setPhase("idle")）を実際に通す。
  it("cancel を呼ぶと idle へ戻り errorKind は設定されない", async () => {
    // recognize が呼ばれたときに resolve され、signal の abort で reject する。
    // これにより、「recognize が呼ばれた後に cancel する」順序を保証できる。
    let signalReady: (() => void) | undefined;
    const recognizeStarted = new Promise<void>((res) => {
      signalReady = res;
    });

    const recognize = (_blob: Blob, opts: { signal?: AbortSignal }): Promise<OcrResult> => {
      // recognizeStarted を resolve して、呼び出し元が recognize の開始を検知できるようにする。
      signalReady?.();
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    };

    const { result: hook } = renderHook(() => useOcr(fakeRecognizer(recognize)));

    // grantConsentAndRecognize を fire-and-forget で開始する。
    // recognizePromise は後で消費して unhandled rejection を防ぐ。
    // 初期値は never-resolving promise。act 内で grantConsentAndRecognize の promise に上書きされる。
    let recognizePromise = new Promise<void>(() => {
      // mock implementation
    });
    act(() => {
      recognizePromise = hook.current.grantConsentAndRecognize(new Blob(["x"]));
    });

    // recognize が実際に呼ばれるまでマイクロタスクを進める。
    // これにより、signal の "abort" リスナーが登録された後に cancel() を呼べる。
    await act(async () => {
      await recognizeStarted;
    });

    // cancel を発行する。
    // AbortController.abort() → signal "abort" イベント → recognize の reject →
    // catch ブランチ（AbortError 判定） → setPhase("idle") のパスを通る。
    await act(async () => {
      hook.current.cancel();
      // grantConsentAndRecognize の promise が settle するまで待つ。
      // AbortError は期待どおりの挙動なので catch で吸収する。
      await recognizePromise.catch(() => {
        // mock implementation
      });
    });

    // キャンセル後は idle に戻っている。
    expect(hook.current.phase).toBe("idle");
    // errorKind は設定されない（キャンセルはエラー扱いしない）。
    expect(hook.current.errorKind).toBeUndefined();
  });

  // Finding 3: アンマウント時に recognizer.terminate が呼ばれることを確認する。
  it("アンマウント時に recognizer.terminate が呼ばれる", async () => {
    const terminate = vi.fn((): Promise<void> => Promise.resolve());
    const { unmount } = renderHook(() =>
      useOcr(fakeRecognizer(() => Promise.resolve(ocrResult), terminate)),
    );

    // unmount を act 内で実行し、useEffect クリーンアップを flush する。
    // await Promise.resolve() でマイクロタスクキューを消費してから終了する。
    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    // terminate は useEffect クリーンアップ内で void 呼び出しされる。
    expect(terminate).toHaveBeenCalledOnce();
  });
});
