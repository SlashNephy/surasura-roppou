import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import type { Law, LawNode, LawRevision } from "@/core/domain";
import { createStorageRepository, deleteSurasuraDatabase } from "@/core/storage";
import type { LawDocumentInput, StorageRepository } from "@/core/storage";

import { createFullTextSearchService } from "./full-text";
import { createSearchIndexRepository } from "./index-repository";
import type { SearchIndexRepository } from "./index-repository";
import { createSearchIndexer } from "./indexer";

const openedStorage: StorageRepository[] = [];
const openedSearch: SearchIndexRepository[] = [];
const openedDatabaseNames: string[] = [];
const fixedNow = () => new Date("2026-07-06T00:00:00.000Z");

const createDatabaseName = (): string => {
  const name = `surasura-fulltext-${String(openedDatabaseNames.length)}`;
  openedDatabaseNames.push(name);
  return name;
};

afterEach(async () => {
  await Promise.all(openedStorage.splice(0).map((repository) => repository.close()));
  await Promise.all(openedSearch.splice(0).map((repository) => repository.close()));
  await Promise.all(openedDatabaseNames.splice(0).map((name) => deleteSurasuraDatabase(name)));
});

const article = (lawId: string, revisionId: string, number: string, text: string): LawNode => ({
  id: `${lawId}:${revisionId}:article:${number}`,
  lawId,
  revisionId,
  type: "Article",
  path: `article:${number}`,
  number,
  rawText: text,
  plainText: text,
  children: [],
});

const buildDocument = (lawId: string, title: string, nodes: LawNode[]): LawDocumentInput => {
  const law: Law = { lawId, title, aliases: [], source: "egov" };
  const revision: LawRevision = {
    lawId,
    revisionId: `${lawId}-R`,
    fetchedAt: "2026-07-06T00:00:00.000Z",
  };
  return { law, revision, nodes };
};

const setup = async (documents: LawDocumentInput[]) => {
  const databaseName = createDatabaseName();
  const storageRepository = createStorageRepository({ databaseName });
  openedStorage.push(storageRepository);
  const indexRepository = createSearchIndexRepository({ databaseName });
  openedSearch.push(indexRepository);
  const indexer = createSearchIndexer(indexRepository, { now: fixedNow });

  for (const document of documents) {
    await storageRepository.saveLawDocument(document);
    await indexer.indexLaw(document);
  }

  return createFullTextSearchService(indexRepository);
};

describe("FullTextSearchService", () => {
  it("保存済み本文の一致条を snippet 付きで返す", async () => {
    const service = await setup([
      buildDocument("L1", "国家賠償法", [
        article("L1", "L1-R", "1", "公務員が職務上の秘密を守る"),
        article("L1", "L1-R", "2", "損害の賠償について定める"),
      ]),
    ]);

    const hits = await service.search("秘密");

    expect(hits).toHaveLength(1);
    expect(hits[0].lawId).toBe("L1");
    expect(hits[0].article).toBe("1");
    expect(hits[0].snippet.text).toContain("秘密");
    const [highlight] = hits[0].snippet.highlights;
    expect(hits[0].snippet.text.slice(highlight.start, highlight.end)).toBe("秘密");
  });

  it("bigram が揃っても連続一致しない語は除外する", async () => {
    const service = await setup([
      buildDocument("L1", "テスト法", [article("L1", "L1-R", "1", "秘は密の前に、別に密秘がある")]),
    ]);

    // "秘密" の bigram は本文中に present だが "秘密" は連続して現れない
    await expect(service.search("秘密")).resolves.toEqual([]);
  });

  it("複数法令を横断し、一致回数の多い条を上位にする", async () => {
    const service = await setup([
      buildDocument("L1", "法一", [article("L1", "L1-R", "1", "秘密。秘密。秘密")]),
      buildDocument("L2", "法二", [article("L2", "L2-R", "1", "秘密は一度だけ")]),
    ]);

    const hits = await service.search("秘密");

    expect(hits.map((hit) => hit.lawId)).toEqual(["L1", "L2"]);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("lawId 指定でその法令内に絞る", async () => {
    const service = await setup([
      buildDocument("L1", "法一", [article("L1", "L1-R", "1", "秘密を守る")]),
      buildDocument("L2", "法二", [article("L2", "L2-R", "1", "秘密を守る")]),
    ]);

    const hits = await service.search("秘密", { lawId: "L2" });

    expect(hits.map((hit) => hit.lawId)).toEqual(["L2"]);
  });

  it("2 文字未満は空を返す", async () => {
    const service = await setup([
      buildDocument("L1", "法一", [article("L1", "L1-R", "1", "秘密を守る")]),
    ]);

    await expect(service.search("秘")).resolves.toEqual([]);
  });
});
