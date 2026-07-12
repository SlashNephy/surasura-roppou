import { useCallback, useEffect, useRef, useState } from "react";

import {
  createOcrRecognizer,
  OcrError,
  prepareImageForOcr,
  type OcrErrorKind,
  type OcrRecognizer,
  type OcrResult,
} from "@/core/ocr";
import { getOcrModelConsent, setOcrModelConsent } from "@/core/settings";

export type OcrPhase = "idle" | "consent" | "loading-model" | "recognizing" | "done" | "error";

export interface UseOcr {
  phase: OcrPhase;
  progress: number;
  result?: OcrResult;
  errorKind?: OcrErrorKind;
  requestRecognize: (blob: Blob) => Promise<void>;
  grantConsentAndRecognize: (blob: Blob) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

// モジュールスコープのデフォルト recognizer（テスト以外はこれを使う）。
const defaultRecognizer = createOcrRecognizer();

export const useOcr = (recognizer: OcrRecognizer = defaultRecognizer): UseOcr => {
  const [phase, setPhase] = useState<OcrPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OcrResult | undefined>();
  const [errorKind, setErrorKind] = useState<OcrErrorKind | undefined>();
  const abortRef = useRef<AbortController | undefined>(undefined);

  // アンマウント時に進行中の認識を中断し worker を破棄する。
  useEffect(
    () => () => {
      abortRef.current?.abort();
      void recognizer.terminate();
    },
    [recognizer],
  );

  const runRecognize = useCallback(
    async (blob: Blob) => {
      setResult(undefined);
      setErrorKind(undefined);
      setProgress(0);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const prepared = await prepareImageForOcr(blob);
        setPhase("loading-model");
        const ocrResult = await recognizer.recognize(prepared, {
          signal: controller.signal,
          onProgress: (p) => {
            // tesseract の status を OCR フェーズに写像する。
            setPhase(p.status === "recognizing" ? "recognizing" : "loading-model");
            setProgress(p.progress);
          },
        });
        setResult(ocrResult);
        setPhase("done");
      } catch (error) {
        if (
          (error instanceof Error || error instanceof DOMException) &&
          error.name === "AbortError"
        ) {
          // キャンセルは失敗表示にせず idle へ戻す。
          // jsdom は DOMException が Error を継承しないため両方を OR で確認する。
          // 実ブラウザ・Node.js では DOMException は Error のサブクラスだが、
          // テスト環境との互換性のため DOMException も独立して確認する。
          setPhase("idle");
          return;
        }
        // OcrError は分類済みの kind をそのまま使い、未分類の例外は "unknown" とする。
        setErrorKind(error instanceof OcrError ? error.kind : "unknown");
        setPhase("error");
      } finally {
        abortRef.current = undefined;
      }
    },
    [recognizer],
  );

  const requestRecognize = useCallback(
    async (blob: Blob) => {
      if (!getOcrModelConsent()) {
        // 未同意ならダイアログ表示のため consent フェーズで待機する。
        setPhase("consent");
        return;
      }
      await runRecognize(blob);
    },
    [runRecognize],
  );

  const grantConsentAndRecognize = useCallback(
    async (blob: Blob) => {
      setOcrModelConsent(true);
      await runRecognize(blob);
    },
    [runRecognize],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
  }, []);

  const reset = useCallback(() => {
    setResult(undefined);
    setErrorKind(undefined);
    setProgress(0);
    setPhase("idle");
  }, []);

  return {
    phase,
    progress,
    result,
    errorKind,
    requestRecognize,
    grantConsentAndRecognize,
    cancel,
    reset,
  };
};
