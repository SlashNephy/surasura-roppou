import type { CapturedImage } from "./types";

export const isImageFile = (file: File): boolean => file.type.startsWith("image/");

// 画像ファイルを端末内メモリの CapturedImage へ変換する。画像でなければ undefined。
export const createCapturedImageFromFile = (file: File): CapturedImage | undefined => {
  if (!isImageFile(file)) {
    return undefined;
  }

  return {
    // File は Blob のサブタイプなので、そのまま blob として扱える。
    blob: file,
    objectUrl: URL.createObjectURL(file),
    source: "upload",
    fileName: file.name,
  };
};

// object URL を解放する。プレビュー差し替え・アンマウント時に呼び、リークを防ぐ。
export const releaseCapturedImage = (image: CapturedImage): void => {
  URL.revokeObjectURL(image.objectUrl);
};
