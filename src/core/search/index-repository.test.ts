import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import type { Law, LawNode, LawRevision } from "@/core/domain";
import { createStorageRepository, deleteSurasuraDatabase } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";

import { createSearchIndexRepository } from "./index-repository";
import type { SearchIndexRepository } from "./index-repository";

const openedDatabaseNames: string[] = [];
const openedStorage: StorageRepository[] = [];
const openedSearch: SearchIndexRepository[] = [];

const createDatabaseName = (): string => {
  const name = `surasura-index-repo-${String(openedDatabaseNames.length)}`;
  openedDatabaseNames.push(name);
  return name;
};

afterEach(async () => {
  await Promise.all(openedStorage.splice(0).map((repository) => repository.close()));
  await Promise.all(openedSearch.splice(0).map((repository) => repository.close()));
  await Promise.all(openedDatabaseNames.splice(0).map((name) => deleteSurasuraDatabase(name)));
});

const law: Law = { lawId: "L1", title: "国家賠償法", aliases: ["国賠"], source: "egov" };
const revision: LawRevision = {
  lawId: "L1",
  revisionId: "R1",
  fetchedAt: "2026-07-06T00:00:00.000Z",
};
const articleNode: LawNode = {
  id: "L1:R1:article:1",
  lawId: "L1",
  revisionId: "R1",
  type: "Article",
  path: "article:1",
  number: "1",
  rawText: "国又は公共団体が賠償の責めに任ずる",
  plainText: "国又は公共団体が賠償の責めに任ずる",
  children: [],
};

describe("SearchIndexRepository", () => {
  it("カタログを upsert して一覧できる", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);

    await indexRepository.upsertCatalogEntries([
      { lawId: "L1", title: "国家賠償法", aliases: ["国賠"], cachedAt: "2026-07-06T00:00:00.000Z" },
    ]);

    await expect(indexRepository.listCatalog()).resolves.toEqual([
      { lawId: "L1", title: "国家賠償法", aliases: ["国賠"], cachedAt: "2026-07-06T00:00:00.000Z" },
    ]);
  });

  it("postings を法令ごとに置換し、bigram とlawId で引ける", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);

    await indexRepository.replaceLawPostings("L1", [{ bigram: "賠償", nodeIds: ["n1"] }]);
    await indexRepository.replaceLawPostings("L1", [{ bigram: "秘密", nodeIds: ["n2"] }]);

    await expect(indexRepository.getPostingsByBigram("賠償")).resolves.toEqual([]);
    await expect(indexRepository.getPostingsByBigram("秘密")).resolves.toEqual([
      { lawId: "L1", bigram: "秘密", nodeIds: ["n2"] },
    ]);
    await expect(indexRepository.hasPostings("L1")).resolves.toBe(true);

    await indexRepository.deleteLawPostings("L1");
    await expect(indexRepository.hasPostings("L1")).resolves.toBe(false);
  });

  it("lawId 指定で postings を絞れる", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);

    await indexRepository.replaceLawPostings("L1", [{ bigram: "秘密", nodeIds: ["a"] }]);
    await indexRepository.replaceLawPostings("L2", [{ bigram: "秘密", nodeIds: ["b"] }]);

    await expect(indexRepository.getPostingsByBigram("秘密", "L2")).resolves.toEqual([
      { lawId: "L2", bigram: "秘密", nodeIds: ["b"] },
    ]);
  });

  it("保存済みノードを id で取得する", async () => {
    const databaseName = createDatabaseName();
    const storageRepository = createStorageRepository({ databaseName });
    openedStorage.push(storageRepository);
    await storageRepository.saveLawDocument({ law, revision, nodes: [articleNode] });

    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);

    await expect(indexRepository.getNodeById("L1:R1:article:1")).resolves.toEqual(articleNode);
    await expect(indexRepository.getNodeById("missing")).resolves.toBeUndefined();
  });
});
