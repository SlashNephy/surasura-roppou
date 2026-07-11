# OCR 処理（画像 → テキスト）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** scanner 画面で取り込んだ画像を Tesseract.js でブラウザ内 OCR し、生テキストを取得できるようにする（進捗表示とキャンセル付き）。

**Architecture:** OCR ドメイン（前処理・認識・型・モデル定数）を `src/core/ocr` に追加し、tesseract.js への依存は `recognizer.ts` 内部と `OcrWorkerFactory` インターフェースの背後に隠す。React/DOM 依存の状態遷移は `src/app/use-ocr.ts` と `scanner-page.tsx` に閉じる。日本語モデルは `tessdata_fast/jpn`（横書き）を自オリジンから配り、opt-in + lazy load、IndexedDB 自動キャッシュでオフライン化する。

**Tech Stack:** React 19 / Vite 8 / TypeScript 6 / tesseract.js v7 / tesseract.js-core / vite-plugin-static-copy / Vitest + Testing Library。

## Global Constraints

- 設計元: [docs/superpowers/specs/2026-07-11-ocr-recognition-design.md](../specs/2026-07-11-ocr-recognition-design.md)。対応 Issue: #36。
- 画像は端末内メモリでのみ処理し、保存・送信しない。モデル取得も含め第三者オリジンへのリクエストを作らない（自オリジン配信）。
- OCR エンジンは **Tesseract.js v7**。手書き Web Worker は作らない（tesseract.js が内部生成）。
- 日本語モデルは **`tessdata_fast/jpn`（2.4MB, 横書きのみ）**。縦書き `jpn_vert`・fast/best 切替設定は本 Issue のスコープ外。
- 依存注入の流儀に合わせる: 本番実装をデフォルト引数で注入し、テストで fake に差し替える（既存 `CameraStreamProvider` / `storageRepository` に倣う）。
- コミットは Conventional Commits（日本語）。Co-Authored-By: `Claude Fable 5 <noreply@anthropic.com>`。
- 品質ゲート（コミット前に必ず実行）: `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `pnpm test`。
- lint/format 設定ファイルは変更しない。lint 抑制コメントで回避しない。
- 座標は既存ドメイン型 `BoundingBox {x, y, width, height}`（`@/core/domain`）を再利用する。
- ブランチ: `feat/issue-36-ocr-recognition`（作成済み）。

---

## ファイル構成

| ファイル                           | 区分 | 責務                                                                |
| ---------------------------------- | ---- | ------------------------------------------------------------------- |
| `src/core/ocr/types.ts`            | 変更 | `OcrWord` / `OcrResult` / `OcrProgress` / `OcrErrorKind` を追記     |
| `src/core/ocr/model.ts`            | 新規 | モデル言語・サイズ定数・self-host パス・`formatModelSizeLabel`      |
| `src/core/ocr/preprocess.ts`       | 新規 | `computeResizeDimensions`（純関数）/ `prepareImageForOcr`（canvas） |
| `src/core/ocr/recognizer.ts`       | 新規 | `OcrWorkerFactory` / `createOcrRecognizer`                          |
| `src/core/ocr/index.ts`            | 変更 | 追加分の re-export                                                  |
| `src/core/settings/ocr-consent.ts` | 新規 | モデル DL 同意フラグ（localStorage）                                |
| `src/core/settings/index.ts`       | 変更 | 同意フラグの re-export                                              |
| `public/tessdata/jpn.traineddata`  | 新規 | 日本語モデル本体（非圧縮・コミット）                                |
| `public/tessdata/README.md`        | 新規 | モデルの由来・バージョン・更新手順                                  |
| `vite.config.ts`                   | 変更 | tesseract core/worker を自オリジンへコピー                          |
| `src/app/use-ocr.ts`               | 新規 | OCR 状態遷移フック                                                  |
| `src/app/scanner-page.tsx`         | 変更 | プレビューの「準備中」を実 OCR 導線へ置換                           |

---

## Task 1: OCR 型とモデル定数

**Files:**

- Modify: `src/core/ocr/types.ts`
- Create: `src/core/ocr/model.ts`
- Modify: `src/core/ocr/index.ts`
- Test: `src/core/ocr/model.test.ts`

**Interfaces:**

- Consumes: `BoundingBox` from `@/core/domain`。
- Produces:
  - `OcrWord { text: string; confidence: number; bbox: BoundingBox }`
  - `OcrResult { text: string; confidence: number; words: OcrWord[] }`
  - `OcrProgress { status: "loading-model" | "recognizing"; progress: number }`（progress は 0..1）
  - `OcrErrorKind = "model-download-failed" | "engine-load-failed" | "recognize-failed" | "unknown"`
  - `MODEL_LANG = "jpn"`, `MODEL_SIZE_BYTES: number`, `OCR_LANG_PATH`, `OCR_CORE_PATH`, `OCR_WORKER_PATH`（いずれも自オリジン相対）
  - `formatModelSizeLabel(bytes: number): string`（例: `"約2.4MB"`）

- [ ] **Step 1: `types.ts` に型を追記する失敗テストを書く（model の label 経由で確認するため、まず model のテストを書く）**

`src/core/ocr/model.test.ts` を作成:

```ts
import { describe, expect, it } from "vitest";

import { formatModelSizeLabel, MODEL_LANG, MODEL_SIZE_BYTES } from "./model";

describe("formatModelSizeLabel", () => {
  it("バイト数を約N.NMB表記にする", () => {
    expect(formatModelSizeLabel(2_411_724)).toBe("約2.3MB");
  });

  it("MODEL_SIZE_BYTES は fast/jpn の実サイズで約2.4MBになる", () => {
    // tessdata_fast/jpn.traineddata の実測（2.4MB）を単一の出所として持つ。
    expect(formatModelSizeLabel(MODEL_SIZE_BYTES)).toBe("約2.4MB");
    expect(MODEL_LANG).toBe("jpn");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test -- src/core/ocr/model.test.ts`
Expected: FAIL（`./model` が存在しない）

- [ ] **Step 3: `types.ts` に型を追記する**

`src/core/ocr/types.ts` の末尾に追記:

```ts
import type { BoundingBox } from "@/core/domain";

// 語単位の認識結果。bbox は前処理後画像の座標系（#37 のハイライト・並び復元に使う）。
export interface OcrWord {
  text: string;
  confidence: number; // 0..100（tesseract の word confidence）
  bbox: BoundingBox;
}

// #36 の出力契約。#37 がテキスト正規化・参照抽出の入力に使う。
export interface OcrResult {
  text: string;
  confidence: number; // 0..100（ページ全体）
  words: OcrWord[];
}

// 進捗。progress は 0..1。
export interface OcrProgress {
  status: "loading-model" | "recognizing";
  progress: number;
}

// 失敗の UI 文言への写像。手入力 fallback へ必ず逃がすため種別化する。
export type OcrErrorKind =
  "model-download-failed" | "engine-load-failed" | "recognize-failed" | "unknown";
```

- [ ] **Step 4: `model.ts` を実装する**

`src/core/ocr/model.ts` を作成:

```ts
// 使用する日本語モデル言語コード（Tesseract 言語名）。横書き jpn のみ。
export const MODEL_LANG = "jpn";

// tessdata_fast/jpn.traineddata の実測サイズ（bytes）。同意文言「約N MB」の単一の出所。
export const MODEL_SIZE_BYTES = 2_411_724;

// 自オリジン配信パス。第三者オリジンへリクエストを出さないため相対（同一オリジン）にする。
// 末尾スラッシュを付けない（tesseract.js の langPath 仕様）。
export const OCR_LANG_PATH = "/tessdata";
export const OCR_CORE_PATH = "/tesseract";
export const OCR_WORKER_PATH = "/tesseract/worker.min.js";

// バイト数を「約N.NMB」表記へ。同意ダイアログのダウンロード量表示に使う。
export const formatModelSizeLabel = (bytes: number): string => {
  const mib = bytes / (1024 * 1024);
  return `約${mib.toFixed(1)}MB`;
};
```

- [ ] **Step 5: `index.ts` に re-export を追加する**

`src/core/ocr/index.ts` の末尾へ追記:

```ts
export { MODEL_LANG, MODEL_SIZE_BYTES, formatModelSizeLabel } from "./model";
export { OCR_LANG_PATH, OCR_CORE_PATH, OCR_WORKER_PATH } from "./model";
export type { OcrWord, OcrResult, OcrProgress, OcrErrorKind } from "./types";
```

- [ ] **Step 6: テストを実行して成功を確認する**

Run: `pnpm test -- src/core/ocr/model.test.ts`
Expected: PASS

- [ ] **Step 7: 品質ゲートとコミット**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add src/core/ocr/types.ts src/core/ocr/model.ts src/core/ocr/index.ts src/core/ocr/model.test.ts
git commit -m "feat(core/ocr): OCR結果の型とモデル定数を追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: 画像前処理（リサイズ）

**Files:**

- Create: `src/core/ocr/preprocess.ts`
- Modify: `src/core/ocr/index.ts`
- Test: `src/core/ocr/preprocess.test.ts`

**Interfaces:**

- Produces:
  - `computeResizeDimensions(width: number, height: number, maxEdge?: number): { width: number; height: number }`（既定 `maxEdge = 2000`。長辺が上限以下なら原寸、超えたら縦横比を保った整数寸法）
  - `prepareImageForOcr(blob: Blob, options?: { maxEdge?: number }): Promise<Blob>`（canvas 縮小して PNG Blob）

- [ ] **Step 1: 失敗テストを書く**

`src/core/ocr/preprocess.test.ts` を作成:

```ts
import { describe, expect, it } from "vitest";

import { computeResizeDimensions } from "./preprocess";

describe("computeResizeDimensions", () => {
  it("長辺が上限以下なら原寸を返す", () => {
    expect(computeResizeDimensions(1600, 1200, 2000)).toEqual({ width: 1600, height: 1200 });
  });

  it("横長は幅を上限に合わせて縦横比を保つ", () => {
    expect(computeResizeDimensions(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
  });

  it("縦長は高さを上限に合わせて縦横比を保つ", () => {
    expect(computeResizeDimensions(1000, 5000, 2000)).toEqual({ width: 400, height: 2000 });
  });

  it("端数は整数へ丸める", () => {
    expect(computeResizeDimensions(3000, 1999, 2000)).toEqual({ width: 2000, height: 1333 });
  });

  it("上限ちょうどは原寸のまま", () => {
    expect(computeResizeDimensions(2000, 800, 2000)).toEqual({ width: 2000, height: 800 });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test -- src/core/ocr/preprocess.test.ts`
Expected: FAIL（`computeResizeDimensions` 未定義）

- [ ] **Step 3: `preprocess.ts` を実装する**

`src/core/ocr/preprocess.ts` を作成:

```ts
// 大きな写真を等倍で OCR に流すと WASM のメモリと処理時間が跳ねるため、
// 長辺 2000px を既定上限として縮小する（モバイル撮影の実用解像度をおおむね保つ閾値）。
const DEFAULT_MAX_EDGE = 2000;

export const computeResizeDimensions = (
  width: number,
  height: number,
  maxEdge: number = DEFAULT_MAX_EDGE,
): { width: number; height: number } => {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
};

// canvas で縮小し PNG Blob を返す。DOM 依存のため純粋関数化せず実ブラウザ検証で担保する。
export const prepareImageForOcr = async (
  blob: Blob,
  options: { maxEdge?: number } = {},
): Promise<Blob> => {
  const bitmap = await createImageBitmap(blob);
  try {
    const { width, height } = computeResizeDimensions(
      bitmap.width,
      bitmap.height,
      options.maxEdge ?? DEFAULT_MAX_EDGE,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) {
      // 2D コンテキストが取れない環境では前処理を諦め、元画像をそのまま返す。
      return blob;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result === null) {
          reject(new Error("Failed to encode preprocessed image"));
          return;
        }
        resolve(result);
      }, "image/png");
    });
  } finally {
    bitmap.close();
  }
};
```

- [ ] **Step 4: `index.ts` に re-export を追加する**

`src/core/ocr/index.ts` の末尾へ追記:

```ts
export { computeResizeDimensions, prepareImageForOcr } from "./preprocess";
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `pnpm test -- src/core/ocr/preprocess.test.ts`
Expected: PASS（5 ケース）

- [ ] **Step 6: 品質ゲートとコミット**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add src/core/ocr/preprocess.ts src/core/ocr/preprocess.test.ts src/core/ocr/index.ts
git commit -m "feat(core/ocr): 画像リサイズ前処理を追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: OCR 認識器（recognizer）

**Files:**

- Create: `src/core/ocr/recognizer.ts`
- Modify: `src/core/ocr/index.ts`
- Test: `src/core/ocr/recognizer.test.ts`

**Interfaces:**

- Consumes: `OcrResult` / `OcrProgress` / `OcrWord`（Task 1）、`prepareImageForOcr`（Task 2）、`BoundingBox`（domain）。
- Produces:
  - `interface OcrWorkerHandle { recognize(blob: Blob): Promise<OcrResult>; terminate(): Promise<void> }`
  - `interface OcrWorkerFactory { create(onProgress: (p: OcrProgress) => void): Promise<OcrWorkerHandle> }`
  - `createOcrWorkerFactory(): OcrWorkerFactory`（tesseract.js を動的 import する本番実装）
  - `interface OcrRecognizer { recognize(blob: Blob, opts: { signal?: AbortSignal; onProgress?: (p: OcrProgress) => void }): Promise<OcrResult>; terminate(): Promise<void> }`
  - `createOcrRecognizer(options?: { workerFactory?: OcrWorkerFactory }): OcrRecognizer`

**Note:** `OcrWorkerHandle` は tesseract.js の生 worker をラップした最小形（`recognize` は前処理後 Blob を受け取り整形済み `OcrResult` を返す）。tesseract.js 依存は `createOcrWorkerFactory` の内部だけに置く。

- [ ] **Step 1: 失敗テストを書く（fake factory を注入）**

`src/core/ocr/recognizer.test.ts` を作成:

```ts
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
  const terminate = vi.fn(async () => {});
  const progresses: OcrProgress[] = [];
  const factory: OcrWorkerFactory = {
    create: async (onProgress) => {
      const handle: OcrWorkerHandle = {
        recognize: recognizeImpl,
        terminate,
      };
      // 生成時に進捗を通知できるよう onProgress を保持する。
      (factory as unknown as { emit: (p: OcrProgress) => void }).emit = (p) => {
        progresses.push(p);
        onProgress(p);
      };
      return handle;
    },
  };
  return { factory, terminate, progresses };
};

describe("createOcrRecognizer", () => {
  it("認識結果をそのまま返す", async () => {
    const { factory } = createFakeFactory(async () => sampleResult);
    const recognizer = createOcrRecognizer({ workerFactory: factory });
    const result = await recognizer.recognize(new Blob(["x"]), {});
    expect(result).toEqual(sampleResult);
  });

  it("進捗コールバックへ写像される", async () => {
    const received: OcrProgress[] = [];
    const { factory } = createFakeFactory(async () => sampleResult);
    const recognizer = createOcrRecognizer({ workerFactory: factory });
    await recognizer.recognize(new Blob(["x"]), { onProgress: (p) => received.push(p) });
    // recognize 完了時に少なくとも recognizing:1 が届く（実装で末尾に通知）。
    expect(received.at(-1)).toEqual({ status: "recognizing", progress: 1 });
  });

  it("AbortSignal で terminate が呼ばれ AbortError を投げる", async () => {
    const controller = new AbortController();
    let resolveRecognize: (r: OcrResult) => void = () => {};
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test -- src/core/ocr/recognizer.test.ts`
Expected: FAIL（`./recognizer` 未定義）

- [ ] **Step 3: `recognizer.ts` を実装する**

`src/core/ocr/recognizer.ts` を作成:

```ts
import type { BoundingBox } from "@/core/domain";

import { MODEL_LANG, OCR_CORE_PATH, OCR_LANG_PATH, OCR_WORKER_PATH } from "./model";
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
          (block.paragraphs ?? []).flatMap((paragraph) =>
            (paragraph.lines ?? []).flatMap((line) =>
              (line.words ?? []).map((word) => ({
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

  const ensureHandle = async (
    onProgress: (progress: OcrProgress) => void,
  ): Promise<OcrWorkerHandle> => {
    // 初回 recognize まで worker を生成しない（lazy load）。
    if (handle === undefined) {
      handle = await workerFactory.create(onProgress);
    }
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
      const emit = onProgress ?? (() => {});
      if (signal?.aborted === true) {
        throw new DOMException("Aborted", "AbortError");
      }

      const current = await ensureHandle(emit);

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
            emit({ status: "recognizing", progress: 1 });
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
```

- [ ] **Step 4: `index.ts` に re-export を追加する**

`src/core/ocr/index.ts` の末尾へ追記:

```ts
export { createOcrRecognizer, createOcrWorkerFactory } from "./recognizer";
export type { OcrRecognizer, OcrWorkerFactory, OcrWorkerHandle } from "./recognizer";
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `pnpm test -- src/core/ocr/recognizer.test.ts`
Expected: PASS（3 ケース）

- [ ] **Step 6: 品質ゲートとコミット**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add src/core/ocr/recognizer.ts src/core/ocr/recognizer.test.ts src/core/ocr/index.ts
git commit -m "feat(core/ocr): Tesseract.js認識器と依存注入を追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**注意:** この時点では tesseract.js は未インストールでよい。`createOcrWorkerFactory` 内の `import("tesseract.js")` は動的 import なので型エラーにならないが、typecheck で解決できない場合は Task 5 で依存を入れるまで一時的に `// @ts-expect-error` ではなく、Task 5 を先に実施して依存を入れてから本 Task の typecheck を通す順序も可（実行者判断）。推奨は本 Task → Task 5 の順で、Step 6 の typecheck が動的 import 先未解決で落ちるなら Task 5 を先行させる。

---

## Task 4: モデル DL 同意フラグ（localStorage）

**Files:**

- Create: `src/core/settings/ocr-consent.ts`
- Modify: `src/core/settings/index.ts`
- Test: `src/core/settings/ocr-consent.test.ts`

**Interfaces:**

- Produces:
  - `getOcrModelConsent(): boolean`（未同意なら false）
  - `setOcrModelConsent(granted: boolean): void`

**Note:** base-date と同じ localStorage 名前空間パターン。spec §5.1 の「idb 保存」は、既存の設定永続化（base-date が localStorage）に合わせて localStorage に寄せる（UI 設定であり localStorage が適切）。

- [ ] **Step 1: 失敗テストを書く**

`src/core/settings/ocr-consent.test.ts` を作成:

```ts
import { afterEach, describe, expect, it } from "vitest";

import { getOcrModelConsent, setOcrModelConsent } from "./ocr-consent";

afterEach(() => {
  localStorage.clear();
});

describe("ocr model consent", () => {
  it("初期状態は未同意", () => {
    expect(getOcrModelConsent()).toBe(false);
  });

  it("同意を保存すると true を返す", () => {
    setOcrModelConsent(true);
    expect(getOcrModelConsent()).toBe(true);
  });

  it("同意を取り消すと false を返す", () => {
    setOcrModelConsent(true);
    setOcrModelConsent(false);
    expect(getOcrModelConsent()).toBe(false);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test -- src/core/settings/ocr-consent.test.ts`
Expected: FAIL（`./ocr-consent` 未定義）

- [ ] **Step 3: `ocr-consent.ts` を実装する**

`src/core/settings/ocr-consent.ts` を作成:

```ts
// localStorage のキー。名前空間を付けて他アプリと衝突しないようにする。
const storageKey = "surasura:ocr-model-consent";

// 日本語モデルのダウンロード同意フラグ。一度 granted なら以降ダイアログを出さない。
export const getOcrModelConsent = (): boolean => {
  if (typeof localStorage === "undefined") {
    return false;
  }
  return localStorage.getItem(storageKey) === "granted";
};

export const setOcrModelConsent = (granted: boolean): void => {
  if (typeof localStorage === "undefined") {
    return;
  }
  if (granted) {
    localStorage.setItem(storageKey, "granted");
  } else {
    localStorage.removeItem(storageKey);
  }
};
```

- [ ] **Step 4: `index.ts` に re-export を追加する**

`src/core/settings/index.ts` の末尾へ追記:

```ts
export { getOcrModelConsent, setOcrModelConsent } from "./ocr-consent";
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `pnpm test -- src/core/settings/ocr-consent.test.ts`
Expected: PASS（3 ケース）

- [ ] **Step 6: 品質ゲートとコミット**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add src/core/settings/ocr-consent.ts src/core/settings/ocr-consent.test.ts src/core/settings/index.ts
git commit -m "feat(core/settings): OCRモデルDL同意フラグを追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: 依存とモデル・アセットの自オリジン配信

**Files:**

- Modify: `package.json`（`tesseract.js`, `tesseract.js-core`, `vite-plugin-static-copy`）
- Create: `public/tessdata/jpn.traineddata`（非圧縮）
- Create: `public/tessdata/README.md`
- Modify: `vite.config.ts`

**Interfaces:**

- Produces: 実行時に `/tessdata/jpn.traineddata`（非圧縮）, `/tesseract/worker.min.js`, `/tesseract/*`（core wasm）が自オリジンから配信される状態。

**Note:** WASM/worker/モデルは jsdom で実行できないため、本 Task の検証は「`pnpm build` 成功」と「dist にアセットが出力される」ことまで。実 OCR の疎通は Task 8 の実ブラウザ検証で行う。

**gzip 方針（重要・落とし穴回避）:** tessdata_fast の GitHub には `.gz` は無く（非圧縮 `jpn.traineddata` のみ）、`.gz` は projectnaptha CDN 側にしかない。さらに `.gz` を静的配信すると Cloudflare Pages 等が `Content-Encoding: gzip` を付与し、ブラウザが自動解凍→tesseract.js(pako) が二重解凍で失敗する既知の罠がある。よって**非圧縮 `jpn.traineddata` をコミットし、`createWorker` に `gzip: false` を渡して配信する**（Task 3 の createWorker で `gzip: false` を指定済みにする）。転送効率は HTTP 層の圧縮が自動で効くため実害はない。この方針により `MODEL_SIZE_BYTES=2_471_260` が配信ファイル実サイズと一致する。

- [ ] **Step 1: 依存を追加する**

```bash
pnpm add tesseract.js tesseract.js-core
pnpm add -D vite-plugin-static-copy
```

`go mod tidy` に相当する追加処理は不要。`pnpm-lock.yaml` に版が固定され Renovate が追跡する。

- [ ] **Step 2: 日本語モデルを取得してコミット対象へ置く**

```bash
mkdir -p public/tessdata
# tessdata_fast の非圧縮 jpn.traineddata を取得する（gzip:false で配信するため .gz にはしない）
curl -fsSL -o public/tessdata/jpn.traineddata \
  https://github.com/tesseract-ocr/tessdata_fast/raw/main/jpn.traineddata
ls -l public/tessdata/jpn.traineddata
wc -c public/tessdata/jpn.traineddata
```

Expected: `2471260` bytes（約2.4MB）の非圧縮ファイル。実測が `MODEL_SIZE_BYTES` と大きくずれる場合は `src/core/ocr/model.ts` の定数を実測へ更新する。

- [ ] **Step 3: モデルの由来を文書化する**

`public/tessdata/README.md` を作成（取得日は実行時の日付、SHA は取得元コミットに置換する）:

```markdown
# tessdata（OCR 日本語モデル）

- ファイル: `jpn.traineddata`（非圧縮）
- 由来: https://github.com/tesseract-ocr/tessdata_fast （fast モデル）
- 対象言語: 日本語（横書き `jpn`）
- 取得元パス: `jpn.traineddata`
- 取得日: 2026-07-12
- サイズ: 2,471,260 bytes（`src/core/ocr/model.ts` の `MODEL_SIZE_BYTES` と一致させる）
- 用途: Tesseract.js の `langPath` として自オリジン配信する（第三者オリジンへリクエストを出さないため）。
- gzip: 配信は非圧縮（`createWorker` で `gzip: false`）。`.gz` を静的配信すると Content-Encoding による二重解凍で失敗し得るため避ける。

## 更新手順

1. 上流 `tessdata_fast` から非圧縮 `jpn.traineddata` を再取得する。
2. `wc -c` の実測値で `src/core/ocr/model.ts` の `MODEL_SIZE_BYTES` を更新する。
3. 実ブラウザで OCR 疎通を確認する。
```

- [ ] **Step 4: Vite で core/worker を自オリジンへコピーする**

`vite.config.ts` を編集。import 追加:

```ts
import { viteStaticCopy } from "vite-plugin-static-copy";
```

`plugins` 配列へ追加（tesseract core と worker を `/tesseract` 配下へ、モデルは public/ がそのまま配信されるため対象外）:

```ts
    viteStaticCopy({
      targets: [
        // tesseract.js-core の wasm 一式を自オリジンへ配置し corePath="/tesseract" から解決させる。
        { src: "node_modules/tesseract.js-core/*", dest: "tesseract" },
        // worker スクリプトを自オリジンへ配置し workerPath="/tesseract/worker.min.js" から解決させる。
        { src: "node_modules/tesseract.js/dist/worker.min.js", dest: "tesseract" },
      ],
    }),
```

- [ ] **Step 5: ビルドしてアセット出力を確認する**

```bash
pnpm run build
ls dist/tessdata/jpn.traineddata
ls dist/tesseract/worker.min.js
ls dist/tesseract/ | grep -i wasm
```

Expected: 3 つとも存在する（モデル・worker・core wasm）。

- [ ] **Step 6: 品質ゲートとコミット**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add package.json pnpm-lock.yaml vite.config.ts public/tessdata/jpn.traineddata public/tessdata/README.md
git commit -m "feat(core/ocr): 日本語モデルとtesseractアセットを自オリジン配信する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: OCR 状態遷移フック（use-ocr）

**Files:**

- Create: `src/app/use-ocr.ts`
- Test: `src/app/use-ocr.test.ts`

**Interfaces:**

- Consumes: `createOcrRecognizer` / `OcrRecognizer` / `OcrResult` / `OcrProgress` / `OcrErrorKind`（core/ocr）、`prepareImageForOcr`（core/ocr）、`getOcrModelConsent` / `setOcrModelConsent`（core/settings）。
- Produces:
  - `type OcrPhase = "idle" | "consent" | "loading-model" | "recognizing" | "done" | "error"`
  - `useOcr(recognizer?: OcrRecognizer): { phase; progress; result?; errorKind?; requestRecognize(blob); grantConsentAndRecognize(blob); cancel(); reset() }`

**Note:** `requestRecognize` は未同意なら `phase="consent"` にして待つ。`grantConsentAndRecognize` は同意を保存してから認識を開始。進捗 status → phase 反映。`cancel` は AbortController で中断し idle へ。テストは fake recognizer を注入。

- [ ] **Step 1: 失敗テストを書く**

`src/app/use-ocr.test.ts` を作成:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { OcrRecognizer, OcrResult } from "@/core/ocr";

import { useOcr } from "./use-ocr";

const result: OcrResult = { text: "第一条", confidence: 88, words: [] };

const fakeRecognizer = (
  impl: (
    blob: Blob,
    opts: { signal?: AbortSignal; onProgress?: (p: never) => void },
  ) => Promise<OcrResult>,
): OcrRecognizer => ({
  recognize: impl as OcrRecognizer["recognize"],
  terminate: async () => {},
});

afterEach(() => {
  localStorage.clear();
});

describe("useOcr", () => {
  it("未同意なら consent フェーズで待つ", async () => {
    const { result: hook } = renderHook(() => useOcr(fakeRecognizer(async () => result)));
    await act(async () => {
      await hook.current.requestRecognize(new Blob(["x"]));
    });
    expect(hook.current.phase).toBe("consent");
  });

  it("同意して認識すると done で結果を持つ", async () => {
    const { result: hook } = renderHook(() => useOcr(fakeRecognizer(async () => result)));
    await act(async () => {
      await hook.current.grantConsentAndRecognize(new Blob(["x"]));
    });
    await waitFor(() => expect(hook.current.phase).toBe("done"));
    expect(hook.current.result?.text).toBe("第一条");
  });

  it("同意済みなら consent を飛ばして認識する", async () => {
    localStorage.setItem("surasura:ocr-model-consent", "granted");
    const { result: hook } = renderHook(() => useOcr(fakeRecognizer(async () => result)));
    await act(async () => {
      await hook.current.requestRecognize(new Blob(["x"]));
    });
    await waitFor(() => expect(hook.current.phase).toBe("done"));
  });

  it("認識失敗で error フェーズになる", async () => {
    const { result: hook } = renderHook(() =>
      useOcr(
        fakeRecognizer(async () => {
          throw new Error("boom");
        }),
      ),
    );
    await act(async () => {
      await hook.current.grantConsentAndRecognize(new Blob(["x"]));
    });
    await waitFor(() => expect(hook.current.phase).toBe("error"));
    expect(hook.current.errorKind).toBe("recognize-failed");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test -- src/app/use-ocr.test.ts`
Expected: FAIL（`./use-ocr` 未定義）

- [ ] **Step 3: `use-ocr.ts` を実装する**

`src/app/use-ocr.ts` を作成:

```ts
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createOcrRecognizer,
  prepareImageForOcr,
  type OcrErrorKind,
  type OcrRecognizer,
  type OcrResult,
} from "@/core/ocr";
import { getOcrModelConsent, setOcrModelConsent } from "@/core/settings";

export type OcrPhase = "idle" | "consent" | "loading-model" | "recognizing" | "done" | "error";

export interface UseOcr {
  phase: OcrPhase;
  progress: number;
  result?: OcrResult;
  errorKind?: OcrErrorKind;
  requestRecognize: (blob: Blob) => Promise<void>;
  grantConsentAndRecognize: (blob: Blob) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

const defaultRecognizer = createOcrRecognizer();

export const useOcr = (recognizer: OcrRecognizer = defaultRecognizer): UseOcr => {
  const [phase, setPhase] = useState<OcrPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OcrResult | undefined>();
  const [errorKind, setErrorKind] = useState<OcrErrorKind | undefined>();
  const abortRef = useRef<AbortController | undefined>(undefined);

  // アンマウント時に進行中の認識を中断し worker を破棄する。
  useEffect(
    () => () => {
      abortRef.current?.abort();
      void recognizer.terminate();
    },
    [recognizer],
  );

  const runRecognize = useCallback(
    async (blob: Blob) => {
      setResult(undefined);
      setErrorKind(undefined);
      setProgress(0);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const prepared = await prepareImageForOcr(blob);
        setPhase("loading-model");
        const ocrResult = await recognizer.recognize(prepared, {
          signal: controller.signal,
          onProgress: (p) => {
            setPhase(p.status === "recognizing" ? "recognizing" : "loading-model");
            setProgress(p.progress);
          },
        });
        setResult(ocrResult);
        setPhase("done");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // キャンセルは失敗表示にせず idle へ戻す。
          setPhase("idle");
          return;
        }
        setErrorKind("recognize-failed");
        setPhase("error");
      } finally {
        abortRef.current = undefined;
      }
    },
    [recognizer],
  );

  const requestRecognize = useCallback(
    async (blob: Blob) => {
      if (!getOcrModelConsent()) {
        // 未同意ならダイアログ表示のため consent フェーズで待機する。
        setPhase("consent");
        return;
      }
      await runRecognize(blob);
    },
    [runRecognize],
  );

  const grantConsentAndRecognize = useCallback(
    async (blob: Blob) => {
      setOcrModelConsent(true);
      await runRecognize(blob);
    },
    [runRecognize],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
  }, []);

  const reset = useCallback(() => {
    setResult(undefined);
    setErrorKind(undefined);
    setProgress(0);
    setPhase("idle");
  }, []);

  return {
    phase,
    progress,
    result,
    errorKind,
    requestRecognize,
    grantConsentAndRecognize,
    cancel,
    reset,
  };
};
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm test -- src/app/use-ocr.test.ts`
Expected: PASS（4 ケース）

- [ ] **Step 5: 品質ゲートとコミット**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add src/app/use-ocr.ts src/app/use-ocr.test.ts
git commit -m "feat(app): OCR状態遷移フックを追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: scanner 画面への配線

**Files:**

- Modify: `src/app/scanner-page.tsx`
- Modify: `src/app/scanner-page.test.tsx`

**Interfaces:**

- Consumes: `useOcr`（Task 6）、`formatModelSizeLabel` / `MODEL_SIZE_BYTES`（core/ocr）。
- Produces: プレビュー画面の「条文の読み取りは準備中です。」を、読み取り導線（読み取る → 同意 → 進捗＋キャンセル → 生テキスト表示 / エラー時 fallback）へ置換する。

**Note:** テスト差し替えのため `ScannerPage` の props に `ocr?: UseOcr`（または recognizer 注入）を追加する。既存 props（`cameraStreamProvider`）の DI 流儀に合わせ、`useOcr` の戻り値を注入可能にする。

- [ ] **Step 1: 失敗するコンポーネントテストを追記する**

`src/app/scanner-page.test.tsx` に追加（既存 import・describe に合流させる。`renderScanner` 相当のヘルパがあれば流用）:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";

import type { OcrResult } from "@/core/ocr";

import { ScannerPage } from "./scanner-page";
import type { UseOcr } from "./use-ocr";

// 決定的な OCR スタブ。phase を段階的に返す簡易 fake。
const makeOcrStub = (overrides: Partial<UseOcr>): UseOcr => ({
  phase: "idle",
  progress: 0,
  requestRecognize: async () => {},
  grantConsentAndRecognize: async () => {},
  cancel: () => {},
  reset: () => {},
  ...overrides,
});

it("done フェーズで認識テキストを表示する", () => {
  const result: OcrResult = { text: "第一条 テスト", confidence: 90, words: [] };
  render(<ScannerPage ocr={makeOcrStub({ phase: "done", result })} />);
  expect(screen.getByText(/第一条 テスト/)).toBeInTheDocument();
});

it("recognizing フェーズでキャンセルボタンを出す", () => {
  let cancelled = false;
  render(
    <ScannerPage
      ocr={makeOcrStub({ phase: "recognizing", progress: 0.5, cancel: () => (cancelled = true) })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /キャンセル/ }));
  expect(cancelled).toBe(true);
});

it("error フェーズで再試行導線を出す", async () => {
  render(<ScannerPage ocr={makeOcrStub({ phase: "error", errorKind: "recognize-failed" })} />);
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
});
```

**注意:** 上記テストは、プレビュー状態（`image !== undefined`）を前提に OCR UI を出す。既存テストが idle 画面（撮る/画像を選ぶ）を検証しているため、OCR UI 部分は「画像が選択済み」の分岐に限定して表示する。テストで画像状態を作りにくい場合は、`ScannerPage` を「プレビュー中の OCR パネル」を担う小コンポーネント（例: `OcrPanel`）に分割し、そちらを直接テストしてよい（ファイル分割は実装者判断で spec のモジュール境界を保つ）。

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `pnpm test -- src/app/scanner-page.test.tsx`
Expected: FAIL（`ocr` prop 未対応 / OCR UI 未実装）

- [ ] **Step 3: `scanner-page.tsx` を編集する**

`useOcr` を注入可能にし、プレビュー分岐（`image !== undefined`）の「条文の読み取りは準備中です。」を OCR 導線へ置換する。要点:

```tsx
import { useOcr } from "./use-ocr";
import type { UseOcr } from "./use-ocr";
import { formatModelSizeLabel, MODEL_SIZE_BYTES } from "@/core/ocr";
```

- `ScannerPage` の props に `ocr?: UseOcr` を追加し、既定は `useOcr()`。ただし Hook はコンポーネント直下で呼ぶ必要があるため、`const ocrDefault = useOcr(); const ocr = ocrProp ?? ocrDefault;` の形にする（Hook 呼び出しは無条件）。
- プレビュー分岐の本文を、`ocr.phase` に応じて出し分ける:
  - `idle`: 「この画像から条文を読み取る」ボタン（`onClick={() => void ocr.requestRecognize(image.blob)}`）。
  - `consent`: 「日本語モデル（{formatModelSizeLabel(MODEL_SIZE_BYTES)}）をダウンロードします。以降はオフラインで使えます。」＋`実行`（`grantConsentAndRecognize(image.blob)`）/`やめる`（`reset`）。
  - `loading-model` / `recognizing`: 進捗表示（`role="status"` `aria-live="polite"`）＋パーセント（`Math.round(ocr.progress * 100)`）＋`キャンセル`ボタン（`onClick={ocr.cancel}`）。
  - `done`: 認識テキストを `<pre>`/スクロール領域で表示（コンテナからはみ出さないよう `whitespace-pre-wrap break-words`）。`もう一度読み取る`（`reset` → `requestRecognize`）と`選び直す`。
  - `error`: `role="alert"` で `ocr.errorKind` 別文言＋`再試行`＋「別の画像を選ぶ」fallback。
- 「やり直す（撮り直す/選び直す）」時は `ocr.reset()` も呼び、状態を idle に戻す。

エラー文言の写像（コンポーネント内のヘルパ）:

```tsx
const ocrErrorMessage = (kind: OcrErrorKind): string => {
  switch (kind) {
    case "model-download-failed":
      return "日本語モデルのダウンロードに失敗しました。通信環境を確認して再試行するか、別の画像を選んでください。";
    case "engine-load-failed":
      return "OCR エンジンの読み込みに失敗しました。再試行するか、別の画像を選んでください。";
    case "recognize-failed":
      return "文字の読み取りに失敗しました。別の画像を選ぶか、手入力してください。";
    default:
      return "読み取りできませんでした。別の画像を選んでください。";
  }
};
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `pnpm test -- src/app/scanner-page.test.tsx`
Expected: PASS（既存＋新規）

- [ ] **Step 5: デスクトップ/モバイル幅の崩れとはみ出しを目視前提に整える**

進捗バー・テキスト表示領域が `max-w-md` 内で崩れないこと、長文テキストが `break-words` で折り返ること、`aria-live` が付いていることをコード上で確認する。

- [ ] **Step 6: 品質ゲートとコミット**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
git add src/app/scanner-page.tsx src/app/scanner-page.test.tsx
git commit -m "feat(app): スキャナー画面にOCR読み取りと進捗・キャンセルを実装する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: 実ブラウザ検証・レビュー・PR

**Files:**

- Create: 合成 fixture 画像（実装完了後に用意。`docs/` 用アセットまたは検証時オンザフライ生成）

**Note:** fixture 画像は実装完了後に用意する（ユーザー方針）。この Task は実装コードが揃ってから実施する。

- [ ] **Step 1: 開発サーバを起動する**

```bash
pnpm dev
```

- [ ] **Step 2: 合成 fixture 画像を用意する**

日本語の条文テキスト（例: 「第一条 この法律は、…」）を白背景・横書きで描画した PNG を用意する（画像編集または HTML→スクショ）。手書き・縦書きは対象外。

- [ ] **Step 3: `playwright-cli` で実 OCR を確認する**

`playwright-cli open --headed` で `/scanner` を開き、fixture 画像を「画像を選ぶ」で読み込み → 「読み取る」→ 同意 → 進捗表示 → 生テキスト表示までを操作する。モデル DL は初回のみ発生し、2 回目はキャッシュから即時になることを確認する。

- [ ] **Step 4: スクリーンショットを撮影する**

進捗表示中と結果テキスト表示のスクリーンショットを撮る（`playwright-cli-quirks` メモに従い full-page は避ける）。

- [ ] **Step 5: Antigravity レビュー**

```bash
pnpm run review:antigravity
```

`agy` 非対応環境では skip。クォータ/使用量/残量が出力に含まれれば最終報告へ記録する。指摘は鵜呑みにせず妥当性を検証する。

- [ ] **Step 6: Draft PR を作成し証跡を添付する**

`github-image-upload` スキル（`gh image upload`）でスクリーンショットを PR 本文へ添付。本文に `Close #36`、「動物界における比擬」セクション、実施項目の番号付き自己申告を含める。作成後に自分を Assign する。

```bash
gh pr create --draft --assignee "@me" --title "feat(core/ocr): 画像からのOCRテキスト取得を実装する" --body "<本文>"
```

---

## Self-Review（計画作成者による確認）

- **Spec coverage:**
  - §1 エンジン=Tesseract.js → Task 3/5。モデル=fast/jpn 自オリジン → Task 5。opt-in+lazy load → Task 3(lazy)/4(consent)/6。
  - §2 前処理 → Task 2。認識 → Task 3。`OcrResult` → Task 1/3。scanner 配線 → Task 7。テスト → 各 Task + Task 8。スコープ外（縦書き・fast/best 切替）は着手しない。
  - §4 型/前処理/認識/モデル配置 → Task 1/2/3/5。§5 状態遷移/画面 → Task 6/7。§6 エラー処理 → Task 3(分類)/6(写像)/7(表示)。§7 テスト方針 → 各 Task の TDD + Task 8。§8 リスク → fast/lazy/自オリジン/純関数分離/横書き明示で対応済み。
- **Placeholder scan:** コード・コマンド・期待値を各 Step に明記。Task 8 の fixture のみ「実装後に用意」だがこれはユーザー方針による意図的な後回し。
- **Type consistency:** `OcrResult`/`OcrProgress`/`OcrErrorKind`/`OcrRecognizer`/`OcrWorkerFactory` を Task 1/3 で定義し Task 6/7 で同名参照。`BoundingBox` は domain 既存型を再利用。同意 API 名 `getOcrModelConsent`/`setOcrModelConsent` を Task 4/6 で一致。
