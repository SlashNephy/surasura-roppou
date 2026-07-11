export { createCapturedImageFromFile, isImageFile, releaseCapturedImage } from "./capture";
export type { CapturedImage, CaptureSource, CameraErrorKind } from "./types";

export {
  CameraError,
  classifyCameraError,
  createCameraStreamProvider,
  isCameraSupported,
} from "./camera";
export type { CameraStreamProvider } from "./camera";
