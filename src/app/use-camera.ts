import { useCallback, useEffect, useRef, useState } from "react";

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
  // start() ごとに増える世代番号。await 完了時に自分が最新かを判定し、
  // 追い越された（stop / 別の start / アンマウントが起きた）リクエストの
  // ストリームを破棄してカメラ点灯の残留を防ぐ。
  const requestGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraErrorKind | undefined>();

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const stop = useCallback(() => {
    // 進行中の start() を無効化し、await 完了後のストリームを破棄させる。
    requestGenerationRef.current += 1;
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
    const generation = (requestGenerationRef.current += 1);
    try {
      const stream = await provider.requestStream();
      // await 中に stop() / 別の start() / アンマウントが起きていたら、
      // 取得したストリームは即座に停止して破棄する。
      if (!mountedRef.current || generation !== requestGenerationRef.current) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      // 既存ストリームが残っていれば停止してから差し替える（多重起動時のリーク防止）。
      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });
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
      // 追い越された・アンマウント済みのリクエストは state を触らない。
      if (!mountedRef.current || generation !== requestGenerationRef.current) {
        return;
      }
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
