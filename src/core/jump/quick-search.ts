import type { LawReferenceCandidate } from "@/core/domain";
import type { CatalogSearchService, LawCatalogHit } from "@/core/search";

import type { AliasResolver } from "./alias-resolver";
import { resolveReferenceInput } from "./candidate-resolver";
import type { UnresolvedReason } from "./candidate-resolver";
import type { ParsedReference } from "./reference-parser";

export type QuickSearchCandidateKind = "reference" | "catalog";

export interface QuickSearchCandidate {
  kind: QuickSearchCandidateKind;
  lawId: string;
  lawTitle: string;
  article?: string;
  paragraph?: string;
  item?: string;
  // 確認 UI 向けの根拠文言（「正式名称『民法』に一致」など）。
  reason: string[];
  score: number;
}

export type QuickSearchOutcome =
  | { status: "candidates"; candidates: QuickSearchCandidate[]; autoJump: boolean }
  | { status: "unresolved"; reason: UnresolvedReason; parsed: ParsedReference }
  | { status: "empty" };

export interface QuickSearchOptions {
  limit?: number;
  online?: boolean;
  signal?: AbortSignal;
}

export interface QuickSearch {
  search(query: string, options?: QuickSearchOptions): Promise<QuickSearchOutcome>;
}

export interface QuickSearchDependencies {
  catalog: CatalogSearchService;
  resolver?: AliasResolver;
}

// 具体的な条番号を持つ単一参照だけを直接ジャンプ対象にする下限。
// 絶対参照＋条番号は 0.75 以上、法令名のみは 0.55 以下（reference-parser の scoreReference）。
const AUTO_JUMP_THRESHOLD = 0.7;

// カタログ候補は service が返す順（略称優先）を保つ。順位付けはこの一定値では行わない。
const CATALOG_CANDIDATE_SCORE = 0.3;

const toReferenceCandidate = (
  candidate: Readonly<LawReferenceCandidate>,
): QuickSearchCandidate => ({
  kind: "reference",
  lawId: candidate.lawId,
  lawTitle: candidate.lawTitle,
  reason: candidate.reason,
  score: candidate.score,
  // null は「値なし」として undefined と同等に扱い、フィールドを省略する。
  ...(candidate.article == null ? {} : { article: candidate.article }),
  ...(candidate.paragraph == null ? {} : { paragraph: candidate.paragraph }),
  ...(candidate.item == null ? {} : { item: candidate.item }),
});

const buildCatalogReason = (hit: LawCatalogHit): string[] => {
  switch (hit.matchedField) {
    case "name":
      return [`法令名『${hit.title}』に一致`];
    case "alias":
      return ["略称に一致"];
    case "number":
      return [`法令番号『${hit.lawNumber ?? ""}』に一致`];
  }
};

const toCatalogCandidate = (hit: LawCatalogHit): QuickSearchCandidate => ({
  kind: "catalog",
  lawId: hit.lawId,
  lawTitle: hit.title,
  reason: buildCatalogReason(hit),
  score: CATALOG_CANDIDATE_SCORE,
});

// 具体的な条番号を持ち、閾値以上の単一参照候補か。
const isAutoJumpCandidate = (candidate: QuickSearchCandidate): boolean =>
  candidate.article !== undefined && candidate.score >= AUTO_JUMP_THRESHOLD;

export const createQuickSearch = (dependencies: QuickSearchDependencies): QuickSearch => {
  const { catalog, resolver } = dependencies;

  return {
    async search(query, options = {}) {
      const trimmed = query.trim();

      if (trimmed === "") {
        return { status: "empty" };
      }

      const resolution = resolveReferenceInput(trimmed, { resolver });
      const referenceCandidates =
        resolution?.status === "resolved" ? resolution.candidates.map(toReferenceCandidate) : [];

      // 具体条番号の単一参照は確定ジャンプ。カタログ（ネットワーク）を省く。
      if (referenceCandidates.length === 1 && isAutoJumpCandidate(referenceCandidates[0])) {
        return { status: "candidates", candidates: referenceCandidates, autoJump: true };
      }

      const catalogResult = await catalog.search(trimmed, {
        online: options.online,
        limit: options.limit,
        signal: options.signal,
      });

      // 参照候補と同一 lawId のカタログ重複は落とす（同じ法令を二重表示しない）。
      const referenceLawIds = new Set(referenceCandidates.map((candidate) => candidate.lawId));
      const catalogCandidates = catalogResult.hits
        .filter((hit) => !referenceLawIds.has(hit.lawId))
        .map(toCatalogCandidate);

      const candidates = [...referenceCandidates, ...catalogCandidates];

      if (candidates.length === 0 && resolution?.status === "unresolved") {
        return { status: "unresolved", reason: resolution.reason, parsed: resolution.parsed };
      }

      return { status: "candidates", candidates, autoJump: false };
    },
  };
};
