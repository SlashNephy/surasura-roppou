import type { IDBPDatabase } from "idb";

import type { LawNode } from "@/core/domain";
import { openSurasuraDatabase } from "@/core/storage";
import type { LawCatalogEntry, SearchPosting, SurasuraDatabase } from "@/core/storage";

export interface StoredPostings {
  bigram: string;
  nodeIds: string[];
}

export interface SearchIndexRepository {
  upsertCatalogEntries(entries: LawCatalogEntry[]): Promise<void>;
  listCatalog(): Promise<LawCatalogEntry[]>;
  replaceLawPostings(lawId: string, postings: StoredPostings[]): Promise<void>;
  deleteLawPostings(lawId: string): Promise<void>;
  getPostingsByBigram(bigram: string, lawId?: string): Promise<SearchPosting[]>;
  hasPostings(lawId: string): Promise<boolean>;
  getNodeById(nodeId: string): Promise<LawNode | undefined>;
  close(): Promise<void>;
}

export interface SearchIndexRepositoryOptions {
  databaseName?: string;
}

export const createSearchIndexRepository = (
  options: SearchIndexRepositoryOptions = {},
): SearchIndexRepository => {
  let databasePromise: Promise<IDBPDatabase<SurasuraDatabase>> | undefined;
  const getDatabase = () => {
    databasePromise ??= openSurasuraDatabase(options.databaseName);
    return databasePromise;
  };

  return {
    async upsertCatalogEntries(entries) {
      if (entries.length === 0) {
        return;
      }

      const database = await getDatabase();
      const tx = database.transaction("lawCatalog", "readwrite");
      for (const entry of entries) {
        void tx.store.put(entry);
      }
      await tx.done;
    },

    async listCatalog() {
      const database = await getDatabase();
      return database.getAll("lawCatalog");
    },

    async replaceLawPostings(lawId, postings) {
      const database = await getDatabase();
      const tx = database.transaction("searchPostings", "readwrite");
      const existingKeys = await tx.store.index("by-law-id").getAllKeys(lawId);
      for (const key of existingKeys) {
        void tx.store.delete(key);
      }
      for (const posting of postings) {
        void tx.store.put({ lawId, bigram: posting.bigram, nodeIds: posting.nodeIds });
      }
      await tx.done;
    },

    async deleteLawPostings(lawId) {
      const database = await getDatabase();
      const tx = database.transaction("searchPostings", "readwrite");
      const keys = await tx.store.index("by-law-id").getAllKeys(lawId);
      for (const key of keys) {
        void tx.store.delete(key);
      }
      await tx.done;
    },

    async getPostingsByBigram(bigram, lawId) {
      const database = await getDatabase();

      if (lawId === undefined) {
        return database.getAllFromIndex("searchPostings", "by-bigram", bigram);
      }

      const posting = await database.get("searchPostings", [lawId, bigram]);
      return posting === undefined ? [] : [posting];
    },

    async hasPostings(lawId) {
      const database = await getDatabase();
      const key = await database.getKeyFromIndex("searchPostings", "by-law-id", lawId);
      return key !== undefined;
    },

    async getNodeById(nodeId) {
      const database = await getDatabase();
      const record = await database.get("lawNodes", nodeId);
      return record?.node;
    },

    async close() {
      if (databasePromise === undefined) {
        return;
      }

      const database = await databasePromise;
      database.close();
      databasePromise = undefined;
    },
  };
};
