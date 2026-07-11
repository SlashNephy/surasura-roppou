import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { Camera, ImageUp, RotateCcw, X } from "lucide-react";

import {
  createCameraStreamProvider,
  createCapturedImageFromFile,
  releaseCapturedImage,
} from "@/core/ocr";
import type { CameraErrorKind, CameraStreamProvider, CapturedImage } from "@/core/ocr";
import { Button } from "@/shared/ui/button";

import { useCamera } from "./use-camera";

const defaultCameraStreamProvider = createCameraStreamProvider();

// 画像は端末内メモリでのみ保持し、保存・送信しないことを明示する注記。
const PrivacyNote = () => (
  <p className="text-xs text-muted-foreground">
    <span aria-hidden="true">🔒 </span>
    画像は端末内で処理され、保存・送信されません
  </p>
);

// 権限エラーの種類ごとの説明文。fallback で必ず画像選択に逃がす。
const cameraErrorMessage = (kind: CameraErrorKind): string => {
  switch (kind) {
    case "permission-denied":
      return "カメラの使用が許可されていません。ブラウザの設定で許可するか、画像を選んでください。";
    case "not-found":
      return "使用できるカメラが見つかりません。画像を選んでください。";
    case "not-supported":
      return "この環境ではカメラを利用できません。画像を選んでください。";
    default:
      return "カメラを起動できませんでした。画像を選んでください。";
  }
};

export const ScannerPage = ({
  cameraStreamProvider = defaultCameraStreamProvider,
}: {
  cameraStreamProvider?: CameraStreamProvider;
}) => {
  const [image, setImage] = useState<CapturedImage | undefined>();
  // react-hooks/refs が camera オブジェクト全体をレンダー時 ref アクセスとして誤検知するため
  // 分割代入で個別変数に取り出す。stop は useCallback([], []) で安定している。
  const {
    status: cameraStatus,
    error: cameraError,
    attachVideo,
    start: startCamera,
    capture: captureCamera,
    stop: stopCamera,
  } = useCamera(cameraStreamProvider);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // アンマウント時に未解放の object URL を確実に revoke する。
  // imageRef は render 外（effect）でのみ更新し、react-hooks/refs の制約を満たす。
  const imageRef = useRef(image);
  useEffect(() => {
    imageRef.current = image;
  });
  // アンマウント時に object URL の解放とカメラ停止を確実に行う。
  // stopCamera は useCallback([], []) で安定しているため deps に含めても
  // cleanup は mount/unmount 時にしか走らず、capture 後の余分な cleanup を防ぐ。
  useEffect(
    () => () => {
      if (imageRef.current !== undefined) {
        releaseCapturedImage(imageRef.current);
      }
      stopCamera();
    },
    [stopCamera],
  );

  // 新しい画像へ差し替える。直前の object URL は revoke してリークを防ぐ。
  const replaceImage = (next: CapturedImage | undefined) => {
    setImage((previous) => {
      if (previous !== undefined) {
        releaseCapturedImage(previous);
      }
      return next;
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを連続選択しても change が発火するよう値をリセットする。
    event.target.value = "";
    if (file === undefined) {
      return;
    }
    const captured = createCapturedImageFromFile(file);
    if (captured !== undefined) {
      replaceImage(captured);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleCapture = async () => {
    const captured = await captureCamera();
    if (captured !== undefined) {
      replaceImage(captured);
    }
  };

  // 共通の非表示ファイル入力。idle・error のどちらからも使う。
  const fileInput = (
    <input
      accept="image/*"
      className="sr-only"
      id={fileInputId}
      onChange={handleFileChange}
      ref={fileInputRef}
      type="file"
    />
  );

  if (image !== undefined) {
    return (
      <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-8 text-center">
        <h1 className="font-serif text-2xl font-semibold text-foreground">プレビュー</h1>
        <img
          alt="取り込んだ画像のプレビュー"
          className="w-full rounded-md border bg-card object-contain"
          src={image.objectUrl}
        />
        <p className="text-xs text-muted-foreground">条文の読み取りは準備中です。</p>
        <Button
          className="w-full"
          onClick={() => {
            replaceImage(undefined);
          }}
          type="button"
          variant="outline"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {image.source === "camera" ? "撮り直す" : "選び直す"}
        </Button>
        <PrivacyNote />
      </section>
    );
  }

  if (cameraStatus === "active") {
    return (
      <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-8 text-center">
        <h1 className="font-serif text-2xl font-semibold text-foreground">撮影</h1>
        <video
          aria-label="カメラプレビュー"
          className="w-full rounded-md border bg-black"
          muted
          playsInline
          ref={attachVideo}
        />
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={stopCamera} type="button" variant="outline">
            <X className="size-4" aria-hidden="true" />
            キャンセル
          </Button>
          <Button
            onClick={() => {
              void handleCapture();
            }}
            type="button"
          >
            <Camera className="size-4" aria-hidden="true" />
            シャッター
          </Button>
        </div>
        <PrivacyNote />
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-12 text-center">
      <h1 className="font-serif text-2xl font-semibold text-foreground">
        問題集や資料から条文を開く
      </h1>
      <PrivacyNote />
      {cameraStatus === "error" && cameraError !== undefined ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 px-4 py-3 text-sm leading-6 text-destructive"
        >
          {cameraErrorMessage(cameraError)}
        </p>
      ) : null}
      <label htmlFor={fileInputId} className="sr-only">
        画像を選ぶ
      </label>
      {fileInput}
      <Button
        className="h-auto w-full flex-col gap-1 py-8"
        onClick={() => {
          void startCamera();
        }}
        type="button"
      >
        <Camera className="size-6" aria-hidden="true" />
        <span className="font-semibold">撮る</span>
        <span className="text-xs opacity-75">カメラで撮影します</span>
      </Button>
      <Button className="w-full" onClick={openFilePicker} type="button" variant="outline">
        <ImageUp className="size-4" aria-hidden="true" />
        画像を選ぶ
      </Button>
    </section>
  );
};
