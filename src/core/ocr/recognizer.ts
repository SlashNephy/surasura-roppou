import type { BoundingBox } from "@/core/domain";

import { MODEL_LANG, OCR_CORE_PATH, OCR_LANG_PATH, OCR_WORKER_PATH } from "./model";
export type { OcrProgress, OcrResult } from "./types";
import type { OcrProgress, OcrResult, OcrWord } from "./types";

export interface OcrWorkerHandle {
  recognize(blob: Blob): Promise<OcrResult>;
  terminate(): Promise<void>;
}

export interface OcrWorkerFactory {
  create(onProgress: (progress: OcrProgress) => void): Promise<OcrWorkerHandle>;
}

export interface OcrRecognizer {
  recognize(
    blob: Blob,
    options: { signal?: AbortSignal; onProgress?: (progress: OcrProgress) => void },
  ): Promise<OcrResult>;
  terminate(): Promise<void>;
}

// tesseract の x0/y0/x1/y1 を、アプリ共通の BoundingBox {x,y,width,height} へ変換する。
const toBoundingBox = (bbox: { x0: number; y0: number; x1: number; y1: number }): BoundingBox => ({
  x: bbox.x0,
  y: bbox.y0,
  width: bbox.x1 - bbox.x0,
  height: bbox.y1 - bbox.y0,
});

// tesseract の logger メッセージ status を OcrProgress の status に写像する。
// "loading language traineddata" 等はモデル取得、"recognizing text" は認識フェーズ。
const mapLoggerStatus = (status: string): OcrProgress["status"] =>
  status.includes("recognizing") ? "recognizing" : "loading-model";

// 本番 factory: tesseract.js を動的 import して worker を生成する（初回のみ読み込む）。
export const createOcrWorkerFactory = (): OcrWorkerFactory => ({
  create: async (onProgress) => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(MODEL_LANG, 1, {
      langPath: OCR_LANG_PATH,
      corePath: OCR_CORE_PATH,
      workerPath: OCR_WORKER_PATH,
      // 配信する traineddata は非圧縮（Task 5 参照）。既定 gzip:true だと
      // 非圧縮ファイルを pako 解凍しようとして失敗するため false を明示する。
      gzip: false,
      logger: (message: { status: string; progress: number }) => {
        onProgress({ status: mapLoggerStatus(message.status), progress: message.progress });
      },
    });

    return {
      recognize: async (blob) => {
        const { data } = await worker.recognize(blob, {}, { blocks: true });
        const words: OcrWord[] = (data.blocks ?? []).flatMap((block) =>
          block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.flatMap((line) =>
              line.words.map((word) => ({
                text: word.text,
                confidence: word.confidence,
                bbox: toBoundingBox(word.bbox),
              })),
            ),
          ),
        );
        return { text: data.text, confidence: data.confidence, words };
      },
      terminate: async () => {
        await worker.terminate();
      },
    };
  },
});

export const createOcrRecognizer = (
  options: { workerFactory?: OcrWorkerFactory } = {},
): OcrRecognizer => {
  const workerFactory = options.workerFactory ?? createOcrWorkerFactory();
  let handle: OcrWorkerHandle | undefined;

  // 進捗コールバック未指定時に OcrWorkerFactory.create へ渡す no-op。
  // void 式でパラメータを参照し、lint の unused-vars を満たす。
  const discardProgress = (progress: OcrProgress): void => {
    void progress;
  };

  // onProgress は worker 生成フェーズでのモデル読み込み進捗に使う。
  // 未指定時は discardProgress を渡して OcrWorkerFactory の型制約を満たす。
  const ensureHandle = async (
    onProgress: ((progress: OcrProgress) => void) | undefined,
  ): Promise<OcrWorkerHandle> => {
    // 初回 recognize まで worker を生成しない（lazy load）。
    handle ??= await workerFactory.create(onProgress ?? discardProgress);
    return handle;
  };

  const terminate = async (): Promise<void> => {
    if (handle !== undefined) {
      const current = handle;
      handle = undefined;
      await current.terminate();
    }
  };

  return {
    recognize: async (blob, { signal, onProgress }) => {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const current = await ensureHandle(onProgress);

      // ensureHandle 完了後に abort 済みなら即座にキャンセルする。
      // controller.abort() が ensureHandle 完了前に呼ばれた場合を吸収する。
      if (signal?.aborted) {
        await terminate();
        throw new DOMException("Aborted", "AbortError");
      }

      return await new Promise<OcrResult>((resolve, reject) => {
        const onAbort = () => {
          // キャンセル時は worker を破棄して認識を止める。
          void terminate();
          reject(new DOMException("Aborted", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        current
          .recognize(blob)
          .then((result) => {
            signal?.removeEventListener("abort", onAbort);
            // 認識完了を 100% 進捗として通知する。
            onProgress?.({ status: "recognizing", progress: 1 });
            resolve(result);
          })
          .catch((error: unknown) => {
            signal?.removeEventListener("abort", onAbort);
            reject(error instanceof Error ? error : new Error(String(error)));
          });
      });
    },
    terminate,
  };
};
