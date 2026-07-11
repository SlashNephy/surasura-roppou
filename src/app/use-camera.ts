import { useCallback, useRef, useState } from "react";

import { CameraError } from "@/core/ocr";
import type { CameraErrorKind, CameraStreamProvider, CapturedImage } from "@/core/ocr";

export type CameraStatus = "idle" | "active" | "error";

export interface UseCameraResult {
  status: CameraStatus;
  error: CameraErrorKind | undefined;
  // <video> の ref コールバック。ストリーム取得と要素マウントの順序に依存しない。
  attachVideo: (node: HTMLVideoElement | null) => void;
  start: () => Promise<void>;
  capture: () => Promise<CapturedImage | undefined>;
  stop: () => void;
}

export const useCamera = (provider: CameraStreamProvider): UseCameraResult => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraErrorKind | undefined>();

  const stop = useCallback(() => {
    // 全トラックを停止しないとカメラの点灯が残る。
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current !== null) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
    setError(undefined);
  }, []);

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    // ストリーム取得後に <video> がマウントされた場合はここで接続する。
    if (node !== null && streamRef.current !== null) {
      node.srcObject = streamRef.current;
      // 自動再生の拒否は致命的でないため無視する。
      node.play().catch(() => {
        /* 自動再生の拒否は致命的でないため無視する */
      });
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const stream = await provider.requestStream();
      streamRef.current = stream;
      const node = videoRef.current;
      if (node !== null) {
        node.srcObject = stream;
        // 自動再生の拒否は致命的でないため無視する。
        node.play().catch(() => {
          /* 自動再生の拒否は致命的でないため無視する */
        });
      }
      setError(undefined);
      setStatus("active");
    } catch (cause) {
      setError(cause instanceof CameraError ? cause.kind : "unknown");
      setStatus("error");
    }
  }, [provider]);

  const capture = useCallback(async (): Promise<CapturedImage | undefined> => {
    const video = videoRef.current;
    if (video === null) {
      return undefined;
    }
    const canvas = document.createElement("canvas");
    // videoWidth/Height は再生前に 0 のことがあるため 720p を既定にする。
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (context === null) {
      return undefined;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      // JPEG 92% は画質と OCR 前提のサイズのバランス。
      canvas.toBlob(
        (result) => {
          resolve(result);
        },
        "image/jpeg",
        0.92,
      );
    });
    if (blob === null) {
      return undefined;
    }
    stop();
    return { blob, objectUrl: URL.createObjectURL(blob), source: "camera" };
  }, [stop]);

  return { status, error, attachVideo, start, capture, stop };
};
