export { createCapturedImageFromFile, isImageFile, releaseCapturedImage } from "./capture";
export type { CapturedImage, CaptureSource, CameraErrorKind } from "./types";

export {
  CameraError,
  classifyCameraError,
  createCameraStreamProvider,
  isCameraSupported,
} from "./camera";
export type { CameraStreamProvider } from "./camera";

export { MODEL_LANG, MODEL_SIZE_BYTES, formatModelSizeLabel } from "./model";
export { OCR_LANG_PATH, OCR_CORE_PATH, OCR_WORKER_PATH } from "./model";
export type { OcrWord, OcrResult, OcrProgress, OcrErrorKind } from "./types";

export { computeResizeDimensions, prepareImageForOcr } from "./preprocess";

export { createOcrRecognizer, createOcrWorkerFactory } from "./recognizer";
export type { OcrRecognizer, OcrWorkerFactory, OcrWorkerHandle } from "./recognizer";
