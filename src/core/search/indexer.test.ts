import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import type { Law, LawNode, LawRevision } from "@/core/domain";
import { deleteSurasuraDatabase } from "@/core/storage";
import type { LawDocumentInput } from "@/core/storage";

import { createSearchIndexRepository } from "./index-repository";
import type { SearchIndexRepository } from "./index-repository";
import { createSearchIndexer } from "./indexer";

const openedSearch: SearchIndexRepository[] = [];
const openedDatabaseNames: string[] = [];
const fixedNow = () => new Date("2026-07-06T00:00:00.000Z");

const createDatabaseName = (): string => {
  const name = `surasura-indexer-${String(openedDatabaseNames.length)}`;
  openedDatabaseNames.push(name);
  return name;
};

afterEach(async () => {
  await Promise.all(openedSearch.splice(0).map((repository) => repository.close()));
  await Promise.all(openedDatabaseNames.splice(0).map((name) => deleteSurasuraDatabase(name)));
});

const law: Law = {
  lawId: "L1",
  title: "国家賠償法",
  lawNumber: "N1",
  aliases: ["国賠"],
  source: "egov",
};
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
  rawText: "公共団体が賠償の責めに任ずる",
  plainText: "公共団体が賠償の責めに任ずる",
  children: ["L1:R1:article:1/paragraph:1"],
};
const paragraphNode: LawNode = {
  id: "L1:R1:article:1/paragraph:1",
  lawId: "L1",
  revisionId: "R1",
  type: "Paragraph",
  path: "article:1/paragraph:1",
  number: "1",
  rawText: "公共団体が賠償の責めに任ずる",
  plainText: "公共団体が賠償の責めに任ずる",
  children: [],
};
const document: LawDocumentInput = { law, revision, nodes: [articleNode, paragraphNode] };

describe("SearchIndexer", () => {
  it("条ノードを索引し、カタログエントリを作る", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    const indexer = createSearchIndexer(indexRepository, { now: fixedNow });

    await indexer.indexLaw(document);

    await expect(indexRepository.getPostingsByBigram("賠償")).resolves.toEqual([
      { lawId: "L1", bigram: "賠償", nodeIds: ["L1:R1:article:1"] },
    ]);
    await expect(indexRepository.listCatalog()).resolves.toEqual([
      {
        lawId: "L1",
        title: "国家賠償法",
        lawNumber: "N1",
        aliases: ["国賠"],
        cachedAt: "2026-07-06T00:00:00.000Z",
      },
    ]);
  });

  it("項ノードは独立索引しない（条に含まれる）", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    const indexer = createSearchIndexer(indexRepository, { now: fixedNow });

    await indexer.indexLaw(document);

    const postings = await indexRepository.getPostingsByBigram("賠償");
    expect(postings.flatMap((posting) => posting.nodeIds)).toEqual(["L1:R1:article:1"]);
  });

  it("removeLaw で索引を消す", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    const indexer = createSearchIndexer(indexRepository, { now: fixedNow });
    await indexer.indexLaw(document);

    await indexer.removeLaw("L1");

    await expect(indexRepository.hasPostings("L1")).resolves.toBe(false);
  });

  it("reindexMissing は未索引の法令だけ索引する", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    const indexer = createSearchIndexer(indexRepository, { now: fixedNow });

    await indexer.reindexMissing([document]);
    await expect(indexRepository.hasPostings("L1")).resolves.toBe(true);

    // 2 回目は既存を検知してスキップしても結果は同じ（冪等）
    await indexer.reindexMissing([document]);
    await expect(indexRepository.getPostingsByBigram("賠償")).resolves.toEqual([
      { lawId: "L1", bigram: "賠償", nodeIds: ["L1:R1:article:1"] },
    ]);
  });
});
