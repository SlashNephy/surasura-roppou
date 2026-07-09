import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { LawListResult, LawRepository } from "@/core/egov";
import { deleteSurasuraDatabase } from "@/core/storage";

import { createCatalogSearchService } from "./catalog";
import { createSearchIndexRepository } from "./index-repository";
import type { SearchIndexRepository } from "./index-repository";

const openedSearch: SearchIndexRepository[] = [];
const openedDatabaseNames: string[] = [];
const fixedNow = () => new Date("2026-07-06T00:00:00.000Z");

const createDatabaseName = (): string => {
  const name = `surasura-catalog-${String(openedDatabaseNames.length)}`;
  openedDatabaseNames.push(name);
  return name;
};

afterEach(async () => {
  await Promise.all(openedSearch.splice(0).map((repository) => repository.close()));
  await Promise.all(openedDatabaseNames.splice(0).map((name) => deleteSurasuraDatabase(name)));
});

const minpouListResult: LawListResult = {
  totalCount: 1,
  count: 1,
  laws: [
    {
      law: {
        lawId: "129AC0000000089",
        title: "民法",
        lawNumber: "明治二十九年法律第八十九号",
        aliases: ["民"],
        source: "egov",
      },
      revision: {
        lawId: "129AC0000000089",
        revisionId: "R",
        fetchedAt: "2026-07-06T00:00:00.000Z",
      },
    },
  ],
};

const createLawRepository = (listLaws: LawRepository["listLaws"]): LawRepository => ({
  listLaws,
  getLaw: vi.fn(),
  getLawMetadata: vi.fn(),
});

describe("CatalogSearchService", () => {
  it("オンラインで名前検索し、結果をキャッシュして source=online を返す", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    const lawRepository = createLawRepository(() => Promise.resolve(minpouListResult));
    const service = createCatalogSearchService({ lawRepository, indexRepository, now: fixedNow });

    const result = await service.search("民法");

    expect(result.source).toBe("online");
    expect(result.hits).toEqual([
      {
        lawId: "129AC0000000089",
        title: "民法",
        lawNumber: "明治二十九年法律第八十九号",
        matchedField: "name",
      },
    ]);
    // キャッシュへ upsert される
    await expect(indexRepository.listCatalog()).resolves.toHaveLength(1);
  });

  it("略称一致は matchedField=alias にする", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    const lawRepository = createLawRepository(() => Promise.resolve(minpouListResult));
    const service = createCatalogSearchService({ lawRepository, indexRepository, now: fixedNow });

    const result = await service.search("民");

    expect(result.hits[0].matchedField).toBe("alias");
  });

  it("オンライン失敗時はキャッシュへフォールバックし source=cache を返す", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    await indexRepository.upsertCatalogEntries([
      {
        lawId: "129AC0000000089",
        title: "民法",
        lawNumber: "明治二十九年法律第八十九号",
        aliases: ["民"],
        cachedAt: "2026-07-06T00:00:00.000Z",
      },
    ]);
    const lawRepository = createLawRepository(() => Promise.reject(new Error("offline")));
    const service = createCatalogSearchService({ lawRepository, indexRepository, now: fixedNow });

    const result = await service.search("民法");

    expect(result.source).toBe("cache");
    expect(result.hits.map((hit) => hit.lawId)).toEqual(["129AC0000000089"]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("法令番号らしいクエリでは番号検索も行う", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    const listLaws = vi.fn<LawRepository["listLaws"]>(() => Promise.resolve(minpouListResult));
    const service = createCatalogSearchService({
      lawRepository: createLawRepository(listLaws),
      indexRepository,
      now: fixedNow,
    });

    await service.search("明治二十九年法律第八十九号");

    expect(listLaws).toHaveBeenCalledWith(
      expect.objectContaining({ lawNumber: "明治二十九年法律第八十九号" }),
    );
  });
});
