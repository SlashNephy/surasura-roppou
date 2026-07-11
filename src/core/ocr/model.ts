// 使用する日本語モデル言語コード（Tesseract 言語名）。横書き jpn のみ。
export const MODEL_LANG = "jpn";

// tessdata_fast/jpn.traineddata の実測サイズ（bytes）。同意文言「約N MB」の単一の出所。
export const MODEL_SIZE_BYTES = 2_471_260;

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
