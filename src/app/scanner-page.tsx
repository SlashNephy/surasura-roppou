import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { Camera, ImageUp, RotateCcw, X } from "lucide-react";

import {
  createCameraStreamProvider,
  createCapturedImageFromFile,
  isCameraSupported,
  releaseCapturedImage,
} from "@/core/ocr";
import type { CameraErrorKind, CameraStreamProvider, CapturedImage, OcrResult } from "@/core/ocr";
import { detectLawReferences } from "@/core/jump";
import type { LawReferenceCandidate, OcrSession } from "@/core/domain";
import type { StorageRepository } from "@/core/storage";
import { generateStorageId } from "@/core/storage";
import { Button } from "@/shared/ui/button";

import { useCamera } from "./use-camera";
import { OcrPanel } from "./ocr-panel";
import { OcrReferenceResults } from "./OcrReferenceResults";
import { useOcr } from "./use-ocr";
import type { UseOcr } from "./use-ocr";

const defaultCameraStreamProvider = createCameraStreamProvider();

// 画像は端末内メモリでのみ保持し、保存・送信しないことを明示する注記。
const PrivacyNote = () => (
  <p className="text-xs text-muted-foreground">
    <span aria-hidden="true">🔒 </span>
    画像は端末内で処理され、保存・送信されません
  </p>
);

// router から遷移写像が注入されない場合（テスト・スタンドアロン埋め込み）の no-op ハンドラ。
// TypeScript の関数パラメータ双対性により LawReferenceCandidate => void に代入可能。
const noopCandidateHandler: (candidate: LawReferenceCandidate) => void = () => {
  // 呼び出し元が遷移を必要としない文脈（テスト・スタンドアロン）のフォールバック。
};

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

interface ScannerPageProps {
  cameraStreamProvider?: CameraStreamProvider;
  // テストから決定的な OCR スタブを注入できるようにする。省略時は useOcr() を使う。
  ocr?: UseOcr;
  // OCR セッション保存に使う。router から注入。省略時は保存しない（Task 5 で実装）。
  storageRepository?: StorageRepository;
  // 候補の遷移写像。core を route 非依存に保つため app/router から注入する。
  onOpenCandidate?: (candidate: LawReferenceCandidate) => void;
  onAddToReview?: (candidate: LawReferenceCandidate) => void;
}

export const ScannerPage = ({
  cameraStreamProvider = defaultCameraStreamProvider,
  ocr: ocrProp,
  storageRepository,
  onOpenCandidate,
  onAddToReview,
}: ScannerPageProps) => {
  // Hook は無条件で呼ぶ必要があるため、prop が渡されても useOcr() 自体は常に呼ぶ。
  const ocrDefault = useOcr();
  const ocr = ocrProp ?? ocrDefault;

  // OCR 完了テキストから条文参照候補を抽出する。result の同一性で再計算する。
  const detectedReferences = useMemo(
    () =>
      ocr.result === undefined
        ? []
        : detectLawReferences(ocr.result.text, { ocrConfidence: ocr.result.confidence }),
    [ocr.result],
  );

  const [sessionSaveFailed, setSessionSaveFailed] = useState(false);
  // 同一 OCR result を二重保存しないよう、保存済み result を参照で覚える。
  const savedResultRef = useRef<OcrResult | undefined>(undefined);

  useEffect(() => {
    const result = ocr.result;

    // done でない・repository 未注入・保存済みの result はスキップする。
    if (
      ocr.phase !== "done" ||
      result === undefined ||
      storageRepository === undefined ||
      savedResultRef.current === result
    ) {
      return;
    }

    savedResultRef.current = result;
    setSessionSaveFailed(false);
    const now = new Date().toISOString();
    const session: OcrSession = {
      id: generateStorageId(),
      sourceText: result.text,
      detectedReferences,
      createdAt: now,
      updatedAt: now,
    };

    // 保存はベストエフォート。失敗しても候補表示は継続し、警告のみ出す。
    void storageRepository.putOcrSession(session).catch(() => {
      setSessionSaveFailed(true);
    });
  }, [ocr.phase, ocr.result, detectedReferences, storageRepository]);

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
  // OS カメラ起動用の入力を独立した ref で管理する。
  const cameraInputId = useId();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // image が差し替わったとき・アンマウント時に、古い object URL を解放する。
  // 解放を cleanup に一元化することで状態更新関数を純粋に保ち、concurrent /
  // Strict Mode で updater が複数回呼ばれても二重解放や誤解放を起こさない。
  useEffect(
    () => () => {
      if (image !== undefined) {
        releaseCapturedImage(image);
      }
    },
    [image],
  );
  // アンマウント時にカメラを停止する。stopCamera は useCallback([], []) で安定。
  useEffect(() => stopCamera, [stopCamera]);

  // 新しい画像へ差し替える。古い URL の解放は上の effect が担う。
  const replaceImage = (next: CapturedImage | undefined) => {
    setImage(next);
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
    <>
      <input
        accept="image/*"
        className="sr-only"
        id={fileInputId}
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      {/* OS カメラ起動用の入力。getUserMedia 非対応環境や権限拒否時のフォールバック。
          capture="environment" で背面カメラを優先する。 */}
      <label className="sr-only" htmlFor={cameraInputId}>
        端末のカメラで撮影
      </label>
      <input
        accept="image/*"
        capture="environment"
        className="sr-only"
        id={cameraInputId}
        onChange={handleFileChange}
        ref={cameraInputRef}
        type="file"
      />
    </>
  );

  if (image !== undefined) {
    // 撮り直し・選び直し時は OCR 状態もリセットして idle に戻す。
    const handleDiscard = () => {
      ocr.reset();
      replaceImage(undefined);
    };

    return (
      <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-8 text-center">
        <h1 className="font-serif text-2xl font-semibold text-foreground">プレビュー</h1>
        <img
          alt="取り込んだ画像のプレビュー"
          className="w-full rounded-md border bg-card object-contain"
          src={image.objectUrl}
        />
        <OcrPanel blob={image.blob} ocr={ocr} onDiscard={handleDiscard} />
        {sessionSaveFailed && ocr.phase === "done" ? (
          <p
            className="rounded-md border border-destructive/50 px-4 py-2 text-sm text-destructive"
            role="alert"
          >
            セッションを保存できませんでした。候補の利用は続けられます。
          </p>
        ) : null}
        {ocr.phase === "done" && ocr.result !== undefined ? (
          <OcrReferenceResults
            references={detectedReferences}
            sourceText={ocr.result.text}
            onOpenCandidate={onOpenCandidate ?? noopCandidateHandler}
            onAddToReview={onAddToReview ?? noopCandidateHandler}
          />
        ) : null}
        <Button className="w-full" onClick={handleDiscard} type="button" variant="outline">
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
        <>
          <p
            role="alert"
            className="rounded-md border border-destructive/50 px-4 py-3 text-sm leading-6 text-destructive"
          >
            {cameraErrorMessage(cameraError)}
          </p>
          {/* 権限拒否時に OS ネイティブカメラで再試行できるフォールバック。 */}
          <Button
            className="w-full"
            onClick={() => {
              cameraInputRef.current?.click();
            }}
            type="button"
            variant="outline"
          >
            <Camera className="size-4" aria-hidden="true" />
            端末のカメラで撮影
          </Button>
        </>
      ) : null}
      <label htmlFor={fileInputId} className="sr-only">
        画像を選ぶ
      </label>
      {fileInput}
      <Button
        className="h-auto w-full flex-col gap-1 py-8"
        onClick={() => {
          // getUserMedia が使えない環境（非セキュアコンテキスト・古いブラウザ等）では
          // OS カメラ入力にフォールバックし、ネイティブカメラアプリを起動する。
          if (isCameraSupported()) {
            void startCamera();
          } else {
            cameraInputRef.current?.click();
          }
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
