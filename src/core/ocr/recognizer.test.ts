import { describe, expect, it, vi } from "vitest";

import { classifyWorkerCreateError, createOcrRecognizer } from "./recognizer";
import type { OcrWorkerFactory, OcrWorkerHandle } from "./recognizer";
import { OcrError } from "./types";
import type { OcrProgress, OcrResult } from "./types";

const sampleResult: OcrResult = {
  text: "第一条",
  confidence: 90,
  words: [{ text: "第一条", confidence: 90, bbox: { x: 0, y: 0, width: 10, height: 10 } }],
};

// 制御可能な fake worker/factory。recognize は解決を外部から操作できる。
const createFakeFactory = (
  recognizeImpl: (blob: Blob) => Promise<OcrResult>,
): {
  factory: OcrWorkerFactory;
  terminate: ReturnType<typeof vi.fn>;
  progresses: OcrProgress[];
} => {
  const terminate = vi.fn(() => Promise.resolve());
  const progresses: OcrProgress[] = [];
  const factory: OcrWorkerFactory = {
    create: (onProgress) => {
      const handle: OcrWorkerHandle = {
        recognize: recognizeImpl,
        terminate,
      };
      // 生成時に進捗を通知できるよう onProgress を保持する。
      (factory as unknown as { emit: (p: OcrProgress) => void }).emit = (p) => {
        progresses.push(p);
        onProgress(p);
      };
      return Promise.resolve(handle);
    },
  };
  return { factory, terminate, progresses };
};

describe("classifyWorkerCreateError", () => {
  it("traineddata を含む status は model-download-failed", () => {
    expect(classifyWorkerCreateError("loading language traineddata")).toBe("model-download-failed");
  });

  it("traineddata を含まない status は engine-load-failed", () => {
    expect(classifyWorkerCreateError("loading tesseract core")).toBe("engine-load-failed");
  });

  it("status が undefined のときは engine-load-failed", () => {
    expect(classifyWorkerCreateError(undefined)).toBe("engine-load-failed");
  });
});

describe("createOcrRecognizer", () => {
  it("認識結果をそのまま返す", async () => {
    const { factory } = createFakeFactory(() => Promise.resolve(sampleResult));
    const recognizer = createOcrRecognizer({ workerFactory: factory });
    const result = await recognizer.recognize(new Blob(["x"]), {});
    expect(result).toEqual(sampleResult);
  });

  it("進捗コールバックへ写像される", async () => {
    const received: OcrProgress[] = [];
    const { factory } = createFakeFactory(() => Promise.resolve(sampleResult));
    const recognizer = createOcrRecognizer({ workerFactory: factory });
    await recognizer.recognize(new Blob(["x"]), { onProgress: (p) => received.push(p) });
    // recognize 完了時に少なくとも recognizing:1 が届く（実装で末尾に通知）。
    expect(received.at(-1)).toEqual({ status: "recognizing", progress: 1 });
  });

  it("AbortSignal で terminate が呼ばれ AbortError を投げる", async () => {
    const controller = new AbortController();
    // resolveRecognize は recognize Promise を外部から解決するためのホルダー。
    // 初期値は no-op（テスト開始前に呼ばれた場合の保護）。
    let resolveRecognize: (r: OcrResult) => void = (r) => {
      void r;
    };
    const { factory, terminate } = createFakeFactory(
      () => new Promise<OcrResult>((resolve) => (resolveRecognize = resolve)),
    );
    const recognizer = createOcrRecognizer({ workerFactory: factory });
    const promise = recognizer.recognize(new Blob(["x"]), { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(terminate).toHaveBeenCalledTimes(1);
    resolveRecognize(sampleResult); // ハングを避けるため解放
  });

  it("handle.recognize の rejection は OcrError(recognize-failed) になる", async () => {
    // handle.recognize が plain Error を投げるとき、recognizer は recognize-failed で包む。
    const { factory } = createFakeFactory(() => Promise.reject(new Error("tesseract internal")));
    const recognizer = createOcrRecognizer({ workerFactory: factory });
    const promise = recognizer.recognize(new Blob(["x"]), {});
    await expect(promise).rejects.toSatisfy(
      (e: unknown) => e instanceof OcrError && e.kind === "recognize-failed",
    );
  });

  it("factory.create が OcrError を投げるとき kind がそのまま伝播する", async () => {
    // factory.create が model-download-failed を既に分類済みで投げる場合、
    // ensureHandle を通じてそのまま呼び出し元へ届く。
    const factory: OcrWorkerFactory = {
      create: () => Promise.reject(new OcrError("model-download-failed")),
    };
    const recognizer = createOcrRecognizer({ workerFactory: factory });
    const promise = recognizer.recognize(new Blob(["x"]), {});
    await expect(promise).rejects.toSatisfy(
      (e: unknown) => e instanceof OcrError && e.kind === "model-download-failed",
    );
  });
});
