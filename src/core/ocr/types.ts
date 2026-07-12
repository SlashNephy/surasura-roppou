import type { BoundingBox } from "@/core/domain";

// 取り込み元。プレビュー表示の区別や、後続 OCR の前処理分岐に使う。
export type CaptureSource = "camera" | "upload";

// 端末内メモリに保持する取り込み結果。保存・送信はしない。
export interface CapturedImage {
  // 撮影は canvas.toBlob、アップロードは File（Blob のサブタイプ）。
  blob: Blob;
  // <img src> 用。差し替え・破棄時に revokeObjectURL する。
  objectUrl: string;
  source: CaptureSource;
  // アップロード時のみ設定。撮影は未設定。
  fileName?: string;
}

// getUserMedia の失敗を UI 文言へ写像するための分類。
export type CameraErrorKind = "permission-denied" | "not-found" | "not-supported" | "unknown";

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

// UI 層が OcrErrorKind ごとに誘導文言を出し分けられるよう、失敗種別を保持するエラークラス（spec §6）。
// 生の Error を catch してフォールバック文言だけ表示するより、分類した情報を伝播させる。
export class OcrError extends Error {
  constructor(
    readonly kind: OcrErrorKind,
    options?: ErrorOptions,
  ) {
    // Error message in English per project convention.
    super(`ocr failed: ${kind}`, options);
    this.name = "OcrError";
  }
}
