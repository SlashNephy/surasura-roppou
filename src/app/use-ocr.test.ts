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
): OcrRecognizer => ({
  recognize: impl,
  terminate: () => Promise.resolve(),
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
});
