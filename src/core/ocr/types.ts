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
