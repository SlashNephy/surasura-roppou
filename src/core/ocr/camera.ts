import type { CameraErrorKind } from "./types";

// getUserMedia の失敗を kind 付きで表す。UI が文言を選ぶ際に参照する。
export class CameraError extends Error {
  constructor(
    readonly kind: CameraErrorKind,
    options?: { cause?: unknown },
  ) {
    super(`camera error: ${kind}`, options);
    this.name = "CameraError";
  }
}

// カメラストリーム取得を抽象化する。既定実装は getUserMedia を包む。
// jsdom は mediaDevices を実装しないため、テストは fake を注入する。
export interface CameraStreamProvider {
  requestStream(): Promise<MediaStream>;
}

// エラーの name を CameraErrorKind へ写像する純粋関数。
// getUserMedia は基本 DOMException で reject するが、OverconstrainedError は
// 一部ブラウザ（Chrome 等）で DOMException ではなく独自型のため、
// instanceof に頼らず name を持つオブジェクトを一律に受ける。
export const classifyCameraError = (error: unknown): CameraErrorKind => {
  const name =
    typeof error === "object" && error !== null && "name" in error ? String(error.name) : undefined;

  switch (name) {
    // ユーザーが許可しなかった / 非セキュアコンテキストで拒否。
    case "NotAllowedError":
    case "SecurityError":
      return "permission-denied";
    // デバイスが無い / 制約を満たすカメラが無い。
    case "NotFoundError":
    case "OverconstrainedError":
      return "not-found";
    case "NotSupportedError":
      return "not-supported";
    default:
      return "unknown";
  }
};

// getUserMedia が利用可能か。SSR や非セキュアコンテキストでは false。
export const isCameraSupported = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }
  // navigator.mediaDevices は型上は常に存在するが、非セキュアコンテキストや
  // 古い環境では実行時に undefined になりうる。undefined 込みで扱う。
  const mediaDevices = navigator.mediaDevices as MediaDevices | undefined;
  return typeof mediaDevices?.getUserMedia === "function";
};

export const createCameraStreamProvider = (): CameraStreamProvider => ({
  async requestStream() {
    if (!isCameraSupported()) {
      throw new CameraError("not-supported");
    }
    try {
      // 学習資料の撮影は背面カメラが自然なため facingMode: environment を優先する。
      return await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch (cause) {
      throw new CameraError(classifyCameraError(cause), { cause });
    }
  },
});
