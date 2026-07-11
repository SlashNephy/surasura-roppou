import { type ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { ImageUp, RotateCcw } from "lucide-react";

import { createCapturedImageFromFile, releaseCapturedImage } from "@/core/ocr";
import type { CapturedImage } from "@/core/ocr";
import { Button } from "@/shared/ui/button";

// 画像は端末内メモリでのみ保持し、保存・送信しないことを明示する注記。
const PrivacyNote = () => (
  <p className="text-xs text-muted-foreground">
    <span aria-hidden="true">🔒 </span>
    画像は端末内で処理され、保存・送信されません
  </p>
);

export const ScannerPage = () => {
  const [image, setImage] = useState<CapturedImage | undefined>();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // アンマウント時に未解放の object URL を確実に revoke する。
  // imageRef は render 外（effect）でのみ更新し、react-hooks/refs の制約を満たす。
  const imageRef = useRef(image);
  useEffect(() => {
    imageRef.current = image;
  });
  useEffect(
    () => () => {
      if (imageRef.current !== undefined) {
        releaseCapturedImage(imageRef.current);
      }
    },
    [],
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
          選び直す
        </Button>
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
      <label htmlFor={fileInputId} className="sr-only">
        画像を選ぶ
      </label>
      <input
        accept="image/*"
        className="sr-only"
        id={fileInputId}
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      <Button
        className="h-auto w-full flex-col gap-1 py-8"
        onClick={() => fileInputRef.current?.click()}
        type="button"
      >
        <ImageUp className="size-6" aria-hidden="true" />
        <span className="font-semibold">画像を選ぶ</span>
        <span className="text-xs opacity-75">ライブラリから画像を選択できます</span>
      </Button>
    </section>
  );
};
