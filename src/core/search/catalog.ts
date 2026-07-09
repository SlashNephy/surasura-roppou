import type { LawRepository, LawSummary } from "@/core/egov";
import type { LawCatalogEntry } from "@/core/storage";

import type { SearchIndexRepository } from "./index-repository";
import { normalizeForSearch } from "./normalize";

export type MatchedField = "name" | "number" | "alias";

export interface LawCatalogHit {
  lawId: string;
  title: string;
  lawNumber?: string;
  matchedField: MatchedField;
}

export interface CatalogSearchResult {
  hits: LawCatalogHit[];
  source: "online" | "cache";
}

export interface CatalogSearchService {
  search(
    query: string,
    options?: { online?: boolean; limit?: number },
  ): Promise<CatalogSearchResult>;
}

export interface CatalogSearchDependencies {
  lawRepository: LawRepository;
  indexRepository: SearchIndexRepository;
  now?: () => Date;
}

const defaultLimit = 20;
// 元号 + 年 + …号 を含むものを法令番号らしいとみなす（分類の本体は #25）。
const lawNumberPattern = /(令和|平成|昭和|大正|明治).*号/;

export const createCatalogSearchService = (
  dependencies: CatalogSearchDependencies,
): CatalogSearchService => {
  const now = dependencies.now ?? (() => new Date());

  return {
    async search(query, options = {}) {
      const trimmed = query.trim();

      if (trimmed === "") {
        return { hits: [], source: "cache" };
      }

      const limit = options.limit ?? defaultLimit;

      if (options.online !== false) {
        try {
          const summaries = await fetchOnline(dependencies.lawRepository, trimmed, limit);
          const entries = dedupeById(summaries.map((summary) => toCatalogEntry(summary, now)));
          await dependencies.indexRepository.upsertCatalogEntries(entries);
          const hits = toHits(entries, trimmed);

          if (hits.length > 0) {
            return { hits: hits.slice(0, limit), source: "online" };
          }
        } catch (error) {
          // ネットワーク不通などはキャッシュへフォールバックする。想定外の失敗も観測できるよう英語でログする。
          console.warn("[search] online catalog search failed, falling back to cache", error);
        }
      }

      const cached = await dependencies.indexRepository.listCatalog();
      const hits = toHits(cached, trimmed);

      return { hits: hits.slice(0, limit), source: "cache" };
    },
  };
};

const fetchOnline = async (
  lawRepository: LawRepository,
  query: string,
  limit: number,
): Promise<LawSummary[]> => {
  // 名前検索と番号検索は互いに独立なので、並列に投げてレイテンシを抑える。
  const requests = [lawRepository.listLaws({ title: query, limit })];

  if (lawNumberPattern.test(query)) {
    requests.push(lawRepository.listLaws({ lawNumber: query, limit }));
  }

  const results = await Promise.all(requests);

  return results.flatMap((result) => result.laws);
};

const toCatalogEntry = (summary: LawSummary, now: () => Date): LawCatalogEntry => ({
  lawId: summary.law.lawId,
  title: summary.law.title,
  ...(summary.law.lawNumber === undefined ? {} : { lawNumber: summary.law.lawNumber }),
  ...(summary.law.lawType === undefined ? {} : { lawType: summary.law.lawType }),
  aliases: summary.law.aliases,
  cachedAt: now().toISOString(),
});

const dedupeById = (entries: LawCatalogEntry[]): LawCatalogEntry[] => {
  const byId = new Map<string, LawCatalogEntry>();
  for (const entry of entries) {
    byId.set(entry.lawId, entry);
  }
  return [...byId.values()];
};

// カタログエントリがクエリのどのフィールドで一致するかを返す（一致無しは undefined）。
// 略称（例:「民」）は正式名称（例:「民法」）の部分文字列であることが多いため、
// 名称一致より先に略称一致を判定し、alias 判定が name 判定に隠れないようにする。
const classifyMatch = (
  entry: LawCatalogEntry,
  normalizedQuery: string,
): MatchedField | undefined => {
  if (
    entry.aliases.some((alias) => normalizeForSearch(alias).normalized.includes(normalizedQuery))
  ) {
    return "alias";
  }

  if (normalizeForSearch(entry.title).normalized.includes(normalizedQuery)) {
    return "name";
  }

  if (
    entry.lawNumber !== undefined &&
    normalizeForSearch(entry.lawNumber).normalized.includes(normalizedQuery)
  ) {
    return "number";
  }

  return undefined;
};

const toHits = (entries: LawCatalogEntry[], query: string): LawCatalogHit[] => {
  const normalizedQuery = normalizeForSearch(query).normalized;
  const hits: LawCatalogHit[] = [];

  for (const entry of entries) {
    const matchedField = classifyMatch(entry, normalizedQuery);

    if (matchedField === undefined) {
      continue;
    }

    hits.push({
      lawId: entry.lawId,
      title: entry.title,
      ...(entry.lawNumber === undefined ? {} : { lawNumber: entry.lawNumber }),
      matchedField,
    });
  }

  return hits;
};
