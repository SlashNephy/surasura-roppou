import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OcrError, type OcrRecognizer, type OcrResult } from "@/core/ocr";

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
    // 本番の recognizer は常に OcrError で包んで投げる。
    // fake でも同じ契約を守り OcrError("recognize-failed") を使う。
    const { result: hook } = renderHook(() =>
      useOcr(fakeRecognizer(() => Promise.reject(new OcrError("recognize-failed")))),
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

  it("OcrError(model-download-failed) が投げられると errorKind が model-download-failed になる", async () => {
    const { result: hook } = renderHook(() =>
      useOcr(fakeRecognizer(() => Promise.reject(new OcrError("model-download-failed")))),
    );
    await act(async () => {
      await hook.current.grantConsentAndRecognize(new Blob(["x"]));
    });
    await waitFor(() => {
      expect(hook.current.phase).toBe("error");
    });
    expect(hook.current.errorKind).toBe("model-download-failed");
  });

  it("未分類の Error が投げられると errorKind が unknown になる", async () => {
    // 分類されていない例外（OcrError でない）は "unknown" に写像される。
    const { result: hook } = renderHook(() =>
      useOcr(fakeRecognizer(() => Promise.reject(new Error("boom")))),
    );
    await act(async () => {
      await hook.current.grantConsentAndRecognize(new Blob(["x"]));
    });
    await waitFor(() => {
      expect(hook.current.phase).toBe("error");
    });
    expect(hook.current.errorKind).toBe("unknown");
  });

  it("onProgress が伝播し recognizing フェーズを経由する", async () => {
    // deferred promise で recognize 完了を外部から制御し、
    // onProgress 呼び出しの中間状態を waitFor で観測する。
    let resolveRecognize!: (r: OcrResult) => void;
    const recognizePromise = new Promise<OcrResult>((res) => {
      resolveRecognize = res;
    });

    // fakeRecognizer の onProgress 型は never のため、OcrRecognizer を直接組み立てる。
    const recognizer: OcrRecognizer = {
      recognize: (_blob, opts) => {
        // 2 回進捗を通知してから resolveRecognize が呼ばれるまで待つ。
        opts.onProgress?.({ status: "loading-model", progress: 0.3 });
        opts.onProgress?.({ status: "recognizing", progress: 0.7 });
        return recognizePromise;
      },
      terminate: () => Promise.resolve(),
    };

    const { result: hook } = renderHook(() => useOcr(recognizer));

    // grantConsentAndRecognize は認識完了を待つため fire-and-forget で開始する。
    let mainPromise: Promise<void>;
    act(() => {
      mainPromise = hook.current.grantConsentAndRecognize(new Blob(["x"]));
    });

    // onProgress({ status: "recognizing", progress: 0.7 }) が反映されるまで待つ。
    await waitFor(() => {
      expect(hook.current.progress).toBe(0.7);
    });
    expect(hook.current.phase).toBe("recognizing");

    // resolve して完了を確認する。
    await act(async () => {
      resolveRecognize(ocrResult);
      await mainPromise;
    });

    await waitFor(() => {
      expect(hook.current.phase).toBe("done");
    });
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
