import type { LawCatalogEntry, LawDocumentInput } from "@/core/storage";

import { toBigrams } from "./bigram";
import type { SearchIndexRepository, StoredPostings } from "./index-repository";
import { normalizeForSearch } from "./normalize";
import { buildSearchableText, isSearchableNode } from "./searchable-node";

export interface SearchIndexer {
  indexLaw(document: LawDocumentInput): Promise<void>;
  removeLaw(lawId: string): Promise<void>;
  reindexMissing(documents: LawDocumentInput[]): Promise<void>;
}

export interface SearchIndexerOptions {
  now?: () => Date;
}

export const createSearchIndexer = (
  indexRepository: SearchIndexRepository,
  options: SearchIndexerOptions = {},
): SearchIndexer => {
  const now = options.now ?? (() => new Date());

  const indexLaw = async (document: LawDocumentInput): Promise<void> => {
    const postingsByBigram = new Map<string, string[]>();

    for (const node of document.nodes) {
      if (!isSearchableNode(node)) {
        continue;
      }

      const { normalized } = normalizeForSearch(buildSearchableText(node));
      for (const bigram of toBigrams(normalized)) {
        const nodeIds = postingsByBigram.get(bigram) ?? [];
        nodeIds.push(node.id);
        postingsByBigram.set(bigram, nodeIds);
      }
    }

    const postings: StoredPostings[] = [...postingsByBigram].map(([bigram, nodeIds]) => ({
      bigram,
      nodeIds,
    }));
    const entry: LawCatalogEntry = {
      lawId: document.law.lawId,
      title: document.law.title,
      ...(document.law.lawNumber === undefined ? {} : { lawNumber: document.law.lawNumber }),
      ...(document.law.lawType === undefined ? {} : { lawType: document.law.lawType }),
      aliases: document.law.aliases,
      cachedAt: now().toISOString(),
    };

    await indexRepository.replaceLawPostings(document.law.lawId, postings);
    await indexRepository.upsertCatalogEntries([entry]);
  };

  return {
    indexLaw,
    async removeLaw(lawId) {
      await indexRepository.deleteLawPostings(lawId);
    },
    async reindexMissing(documents) {
      for (const document of documents) {
        if (!(await indexRepository.hasPostings(document.law.lawId))) {
          await indexLaw(document);
        }
      }
    },
  };
};
