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
      // 前回の認識が残っていれば中断する。前のランが後から setResult/setPhase を
      // 呼び出してこのランの状態を上書きする「古いランの汚染」を防ぐ。
      abortRef.current?.abort();
      setResult(undefined);
      setErrorKind(undefined);
      setProgress(0);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const prepared = await prepareImageForOcr(blob);
        // 画像変換中に abort された場合は即座に抜ける。
        if (controller.signal.aborted) return;
        setPhase("loading-model");
        const ocrResult = await recognizer.recognize(prepared, {
          signal: controller.signal,
          onProgress: (p) => {
            // abort 後の進捗コールバックが新しいランの状態を上書きしないよう guard する。
            if (controller.signal.aborted) return;
            // tesseract の status を OCR フェーズに写像する。
            setPhase(p.status === "recognizing" ? "recognizing" : "loading-model");
            setProgress(p.progress);
          },
        });
        // recognize の resolve 直後〜継続実行前に cancel() や新しいランが割り込んだ場合、
        // idle へ戻した画面へ結果を出さないよう、反映前に自分が現行ランかを確認する。
        // (signal.aborted の再確認は TS の narrowing で常に false と推論されるため参照比較で判定する)
        if (abortRef.current !== controller) return;
        setResult(ocrResult);
        setPhase("done");
      } catch (error) {
        // abort 済みのランは状態を一切書き換えない。
        // cancel() が同期的に setPhase("idle") を呼んでいるため、ここで再セットすると
        // 後から開始した新しいランの状態を踏み荒らす。
        if (controller.signal.aborted) return;
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
        // 古いランの finally が新しいランの controller を消さないよう同一性を確認する。
        // unconditional に undefined を代入すると、新しいランの cancel() が無効になる。
        if (abortRef.current === controller) {
          abortRef.current = undefined;
        }
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
    // 参照も破棄し、resolve 済みで継続待ちだった認識結果が後から反映されるのを防ぐ。
    abortRef.current = undefined;
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
