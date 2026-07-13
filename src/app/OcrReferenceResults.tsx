import { useState } from "react";

import type { DetectedLawReference, LawReferenceCandidate } from "@/core/domain";
import { Button } from "@/shared/ui/button";

interface OcrReferenceResultsProps {
  references: DetectedLawReference[];
  // 検出0件時の fallback 表示に使う OCR 全文。
  sourceText: string;
  onOpenCandidate: (candidate: LawReferenceCandidate) => void;
  onAddToReview: (candidate: LawReferenceCandidate) => void;
}

// 候補の見出し文字列（法令名 + 条項号）。表示と accessible name に共有する。
const candidateLabel = (candidate: LawReferenceCandidate): string => {
  const parts = [candidate.lawTitle];

  if (candidate.article !== undefined) {
    parts.push(`第${candidate.article}条`);
  }

  if (candidate.paragraph != null) {
    parts.push(`第${candidate.paragraph}項`);
  }

  if (candidate.item != null) {
    parts.push(`第${candidate.item}号`);
  }

  return parts.join(" ");
};

// 未解決の理由。detector 経路の未解決はすべて文脈不足（needs-context）。
// 法令名の手掛かりがあるか（例: 民法前条）で文言を分ける。
const unresolvedMessage = (reference: DetectedLawReference): string =>
  reference.lawNameCandidate === undefined && reference.lawAlias === undefined
    ? "周辺の文脈がないと法令を特定できません。"
    : "周辺の条文がないと参照先を特定できません。";

export const OcrReferenceResults = ({
  references,
  sourceText,
  onOpenCandidate,
  onAddToReview,
}: OcrReferenceResultsProps) => {
  // 「無視」した参照 id をローカルに保持する。保存済みセッションは変更しない。
  const [ignoredIds, setIgnoredIds] = useState<ReadonlySet<string>>(new Set());
  const visible = references.filter((reference) => !ignoredIds.has(reference.id));

  if (visible.length === 0) {
    return (
      <div className="grid gap-3 text-left">
        <p className="text-sm text-muted-foreground" role="status">
          条文参照が見つかりませんでした。読み取ったテキストを確認し、必要なら手入力してください。
        </p>
        <pre className="max-h-48 overflow-y-auto rounded-md border bg-muted p-3 text-sm break-words whitespace-pre-wrap">
          {sourceText.trim() !== "" ? sourceText : "テキストが検出されませんでした。"}
        </pre>
      </div>
    );
  }

  const ignore = (id: string) => {
    setIgnoredIds((previous) => new Set(previous).add(id));
  };

  return (
    <ul className="grid gap-3 text-left">
      {visible.map((reference) => (
        <li key={reference.id} className="grid gap-2 rounded-md border p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium break-words text-foreground">{reference.rawText}</span>
            <Button
              aria-label={`${reference.rawText}を無視`}
              className="shrink-0"
              onClick={() => {
                ignore(reference.id);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              無視
            </Button>
          </div>
          {reference.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{unresolvedMessage(reference)}</p>
          ) : (
            <ul className="grid gap-2">
              {reference.candidates.map((candidate, index) => {
                const label = candidateLabel(candidate);

                return (
                  <li
                    key={`${candidate.lawId}-${String(index)}`}
                    className="grid gap-1 rounded-md bg-muted/50 p-2"
                  >
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    {candidate.reason.length > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {candidate.reason.join(" / ")}
                      </span>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        aria-label={`${label}を開く`}
                        onClick={() => {
                          onOpenCandidate(candidate);
                        }}
                        size="sm"
                        type="button"
                      >
                        開く
                      </Button>
                      {candidate.article == null ? null : (
                        <Button
                          aria-label={`${label}を復習に追加`}
                          onClick={() => {
                            onAddToReview(candidate);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          復習に追加
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
};
