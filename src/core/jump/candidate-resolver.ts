import type { LawReferenceCandidate } from "@/core/domain";

import { createAliasResolver, type AliasCandidate, type AliasResolver } from "./alias-resolver";
import { parseReference, type ParsedReference } from "./reference-parser";

// 解決結果。候補が得られたか、文脈不足・辞書外で未解決かを判別する。
export type ReferenceResolution =
  | { status: "resolved"; candidates: LawReferenceCandidate[] }
  | { status: "unresolved"; reason: UnresolvedReason; parsed: ParsedReference };

export type UnresolvedReason =
  | "needs-context" // 相対参照。周辺文脈がないと lawId を決められない
  | "law-not-found"; // 絶対参照だが法令名が辞書に無い

export interface ResolveReferenceOptions {
  // 分類・解決に使う resolver。既定は組込辞書のみ。
  resolver?: AliasResolver;
}

// 組込辞書だけの resolver を一度だけ構築して共有する。
const defaultResolver = createAliasResolver();

// 相対シフト（前条/次条/前項/次項）の符号値かどうか。
const isRelativeShift = (value: string | undefined): boolean =>
  value === "previous" || value === "next";

// 一致種別と条番号から確認 UI 向けの根拠文字列を組み立てる。
const buildReason = (candidate: AliasCandidate, parsed: ParsedReference): string[] => {
  const reason =
    candidate.matchKind === "official"
      ? [`正式名称『${candidate.matchedText}』に一致`]
      : [`略称『${candidate.matchedText}』に一致`];

  if (parsed.article !== undefined) {
    reason.push(`第${parsed.article}条`);
  }

  return reason;
};

// AliasCandidate 1 件を LawReferenceCandidate へ。条・項・号は値があるときのみ載せる。
const toCandidate = (
  candidate: AliasCandidate,
  parsed: ParsedReference,
): LawReferenceCandidate => ({
  lawId: candidate.lawId,
  lawTitle: candidate.officialTitle,
  score: parsed.score,
  reason: buildReason(candidate, parsed),
  ...(parsed.article === undefined ? {} : { article: parsed.article }),
  ...(parsed.paragraph === undefined ? {} : { paragraph: parsed.paragraph }),
  ...(parsed.item === undefined ? {} : { item: parsed.item }),
});

export const resolveReferenceCandidates = (
  parsed: ParsedReference,
  options: ResolveReferenceOptions = {},
): ReferenceResolution => {
  // 相対参照（法令名を持たない）は文脈がないと解決できない。
  if (parsed.kind === "relative") {
    return { status: "unresolved", reason: "needs-context", parsed };
  }

  // 法令名があっても、条/項が相対シフト（前条/次条/前項/次項）なら
  // 基準となる現在位置がないと解決できないため未解決とする。
  if (isRelativeShift(parsed.article) || isRelativeShift(parsed.paragraph)) {
    return { status: "unresolved", reason: "needs-context", parsed };
  }

  // absolute なら lawAlias / lawNameCandidate のどちらかが必ずある（parser の契約）。
  const lawText = parsed.lawAlias ?? parsed.lawNameCandidate;

  if (lawText === undefined) {
    return { status: "unresolved", reason: "needs-context", parsed };
  }

  const resolver = options.resolver ?? defaultResolver;
  const aliasCandidates = resolver.resolve(lawText);

  if (aliasCandidates.length === 0) {
    return { status: "unresolved", reason: "law-not-found", parsed };
  }

  // 候補スコアは parse score をそのまま採るため全候補同点。安定ソートで resolve の順を保つ。
  const candidates = aliasCandidates
    .map((candidate) => toCandidate(candidate, parsed))
    .sort((a, b) => b.score - a.score);

  return { status: "resolved", candidates };
};

// 文字列 → parse → 候補解決の便利ラッパー。パース不能なら undefined。
export const resolveReferenceInput = (
  input: string,
  options: ResolveReferenceOptions = {},
): ReferenceResolution | undefined => {
  const parsed = parseReference(input, options);

  return parsed === undefined ? undefined : resolveReferenceCandidates(parsed, options);
};
