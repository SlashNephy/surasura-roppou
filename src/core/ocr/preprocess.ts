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
