import { describe, expect, it, vi } from "vitest";

import { createOcrRecognizer } from "./recognizer";
import type { OcrProgress, OcrResult, OcrWorkerFactory, OcrWorkerHandle } from "./recognizer";

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
});
