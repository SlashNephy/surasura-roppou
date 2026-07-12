import { formatModelSizeLabel, MODEL_SIZE_BYTES, type OcrErrorKind } from "@/core/ocr";
import { Button } from "@/shared/ui/button";

import type { UseOcr } from "./use-ocr";

// OcrErrorKind を日本語エラー文言へ写像する。手入力 fallback への誘導を必ず含める。
const ocrErrorMessage = (kind: OcrErrorKind): string => {
  switch (kind) {
    case "model-download-failed":
      return "日本語モデルのダウンロードに失敗しました。通信環境を確認して再試行するか、別の画像を選んでください。";
    case "engine-load-failed":
      return "OCR エンジンの読み込みに失敗しました。再試行するか、別の画像を選んでください。";
    case "recognize-failed":
      return "文字の読み取りに失敗しました。別の画像を選ぶか、手入力してください。";
    default:
      return "読み取りできませんでした。別の画像を選んでください。";
  }
};

interface OcrPanelProps {
  // プレビュー中の画像 Blob。consent 同意後の再実行に必要。
  blob: Blob;
  // 親 (ScannerPage) から注入される OCR フック戻り値。
  ocr: UseOcr;
  // 選び直しボタン押下時のコールバック。ocr.reset() と同時に呼ぶ。
  onDiscard?: () => void;
}

/**
 * プレビュー画面の OCR 操作 UI。ocr.phase に応じて表示を切り替える。
 * - idle: 読み取るボタン
 * - consent: ダウンロード同意ダイアログ
 * - loading-model / recognizing: 進捗 + キャンセル
 * - done: 認識テキスト表示
 * - error: エラー文言 + 再試行
 */
export const OcrPanel = ({ blob, ocr, onDiscard }: OcrPanelProps) => {
  const { phase, progress, result, errorKind } = ocr;

  if (phase === "idle") {
    return (
      <Button
        className="w-full"
        onClick={() => {
          void ocr.requestRecognize(blob);
        }}
        type="button"
      >
        この画像から条文を読み取る
      </Button>
    );
  }

  if (phase === "consent") {
    return (
      <div className="grid gap-3 rounded-md border p-4 text-left text-sm">
        <p className="text-foreground">
          日本語モデル（{formatModelSizeLabel(MODEL_SIZE_BYTES)}）をダウンロードします。
          以降はオフラインで使えます。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => {
              void ocr.grantConsentAndRecognize(blob);
            }}
            type="button"
          >
            実行
          </Button>
          <Button onClick={ocr.reset} type="button" variant="outline">
            やめる
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "loading-model" || phase === "recognizing") {
    const percent = Math.round(progress * 100);
    return (
      <div className="grid gap-3">
        {/* aria-live で進捗更新を支援技術に通知する */}
        <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
          {phase === "recognizing" ? "読み取り中..." : "モデル読み込み中..."}
          <span className="ml-1 tabular-nums">{percent} %</span>
        </p>
        <Button onClick={ocr.cancel} type="button" variant="outline">
          キャンセル
        </Button>
      </div>
    );
  }

  if (phase === "done" && result !== undefined) {
    return (
      <div className="grid gap-3">
        {/* whitespace-pre-wrap + break-words で長文が max-w-md 内に収まる */}
        <pre className="max-h-48 overflow-y-auto rounded-md border bg-muted p-3 text-left text-sm whitespace-pre-wrap break-words">
          {result.text}
        </pre>
        {/* 「選び直す」は ScannerPage が常時表示するプレビュー外ボタンで担うため、
            ここに同じラベルを置くと二重になる。再認識専用ボタンのみ残す。 */}
        <Button
          className="w-full"
          onClick={() => {
            ocr.reset();
            void ocr.requestRecognize(blob);
          }}
          type="button"
          variant="outline"
        >
          もう一度読み取る
        </Button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="grid gap-3">
        <p
          className="rounded-md border border-destructive/50 px-4 py-3 text-sm leading-6 text-destructive"
          role="alert"
        >
          {ocrErrorMessage(errorKind ?? "unknown")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => {
              void ocr.requestRecognize(blob);
            }}
            type="button"
            variant="outline"
          >
            再試行
          </Button>
          <Button
            onClick={() => {
              ocr.reset();
              onDiscard?.();
            }}
            type="button"
            variant="outline"
          >
            別の画像を選ぶ
          </Button>
        </div>
      </div>
    );
  }

  // done フェーズで result が undefined の場合（通常到達しない）は何も表示しない。
  return null;
};
