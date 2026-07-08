import { toBigrams } from "./bigram";
import type { SearchIndexRepository } from "./index-repository";
import { normalizeForSearch } from "./normalize";
import { buildSearchableText } from "./searchable-node";
import { buildSnippet } from "./snippet";
import type { SearchSnippet } from "./snippet";

export interface SavedTextHit {
  lawId: string;
  revisionId: string;
  path: string;
  article?: string;
  title?: string;
  snippet: SearchSnippet;
  score: number;
}

export interface FullTextSearchService {
  search(query: string, options?: { lawId?: string; limit?: number }): Promise<SavedTextHit[]>;
}

export const createFullTextSearchService = (
  indexRepository: SearchIndexRepository,
): FullTextSearchService => ({
  async search(query, options = {}) {
    const normalizedQuery = normalizeForSearch(query).normalized;

    if (normalizedQuery.length < 2) {
      return [];
    }

    const bigrams = [...toBigrams(normalizedQuery)];
    let candidates: Set<string> | undefined;

    for (const bigram of bigrams) {
      const postings = await indexRepository.getPostingsByBigram(bigram, options.lawId);
      const nodeIds = new Set<string>();
      for (const posting of postings) {
        for (const nodeId of posting.nodeIds) {
          nodeIds.add(nodeId);
        }
      }

      candidates = candidates === undefined ? nodeIds : intersect(candidates, nodeIds);

      if (candidates.size === 0) {
        return [];
      }
    }

    if (candidates === undefined) {
      return [];
    }

    const hits: SavedTextHit[] = [];

    for (const nodeId of candidates) {
      const node = await indexRepository.getNodeById(nodeId);

      if (node === undefined) {
        continue;
      }

      const text = buildSearchableText(node);
      const normalizedText = normalizeForSearch(text).normalized;
      const score = countOccurrences(normalizedText, normalizedQuery);

      if (score === 0) {
        continue;
      }

      hits.push({
        lawId: node.lawId,
        revisionId: node.revisionId,
        path: node.path,
        ...(node.number === undefined ? {} : { article: node.number }),
        ...(node.title === undefined ? {} : { title: node.title }),
        snippet: buildSnippet(text, query),
        score,
      });
    }

    hits.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

    return options.limit === undefined ? hits : hits.slice(0, options.limit);
  },
});

const intersect = (left: Set<string>, right: Set<string>): Set<string> => {
  const result = new Set<string>();
  for (const value of left) {
    if (right.has(value)) {
      result.add(value);
    }
  }
  return result;
};

// 重なりを許して出現回数を数える（ランクの一致回数に使う）。
const countOccurrences = (haystack: string, needle: string): number => {
  let count = 0;
  let from = haystack.indexOf(needle);

  while (from !== -1) {
    count += 1;
    from = haystack.indexOf(needle, from + 1);
  }

  return count;
};
