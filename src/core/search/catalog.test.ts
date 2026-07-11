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
  // console.warn などの spy を毎テスト後に復元する。復元しないと、後続テストで
  // 別の console.warn 呼び出しが誤って抑制され、ノイズに気付けなくなる。
  vi.restoreAllMocks();
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
      // signal を転送するようになったため、第 2 引数が存在する。
      expect.anything(),
    );
  });

  // 名前検索と番号検索の両方が同じ法令を返すと、キャッシュ書き戻し前の entries には
  // 同一 lawId が 2 件含まれる。dedupe をキャッシュ書き戻しにしか適用しないと、
  // 返却される result.hits に重複ヒットが漏れて出てしまう回帰を防ぐためのテスト。
  it("名前検索と番号検索が同じ法令を返しても、返却 hits は重複しない", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    // createLawRepository(() => Promise.resolve(minpouListResult)) は
    // どの listLaws 呼び出しに対しても同一の法令（129AC0000000089）を返す。
    // クエリを法令番号そのものにすると lawNumberPattern に一致し、
    // タイトル検索・番号検索の 2 回 listLaws が呼ばれ、同じ法令が 2 件返る。
    const lawRepository = createLawRepository(() => Promise.resolve(minpouListResult));
    const service = createCatalogSearchService({ lawRepository, indexRepository, now: fixedNow });

    const result = await service.search("明治二十九年法律第八十九号");

    expect(result.source).toBe("online");
    expect(result.hits).toHaveLength(1);
    expect(result.hits.map((hit) => hit.lawId)).toEqual(["129AC0000000089"]);
  });

  it("search は signal を listLaws へ渡す", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const lawRepository = {
      listLaws: vi.fn((_query: unknown, options?: { signal?: AbortSignal }) => {
        received = options?.signal;
        return Promise.resolve({ totalCount: 0, count: 0, laws: [] });
      }),
    } as unknown as LawRepository;
    const service = createCatalogSearchService({ lawRepository, indexRepository });

    await service.search("民法", { signal: controller.signal });

    expect(received).toBe(controller.signal);
  });

  it("中断された signal では AbortError を投げ、キャッシュを引かない", async () => {
    const databaseName = createDatabaseName();
    const indexRepository = createSearchIndexRepository({ databaseName });
    openedSearch.push(indexRepository);
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException("aborted", "AbortError");
    const lawRepository = {
      listLaws: vi.fn(() => Promise.reject(abortError)),
    } as unknown as LawRepository;
    const listCatalog = vi.fn(() => Promise.resolve([]));
    const indexRepositoryLocal = { ...indexRepository, listCatalog };
    const service = createCatalogSearchService({
      lawRepository,
      indexRepository: indexRepositoryLocal,
    });

    await expect(service.search("民法", { signal: controller.signal })).rejects.toBe(abortError);
    expect(listCatalog).not.toHaveBeenCalled();
  });

  // オンライン呼び出し自体は成功したがヒットが 0 件だった場合、
  // catch 節を経由せず（例外にせず）hits.length > 0 のガードでキャッシュへフォールバックすることを確認する。
  it("オンラインが成功してもヒット 0 件ならキャッシュへフォールバックする", async () => {
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
    const emptyListResult: LawListResult = { totalCount: 0, count: 0, laws: [] };
    const lawRepository = createLawRepository(() => Promise.resolve(emptyListResult));
    const service = createCatalogSearchService({ lawRepository, indexRepository, now: fixedNow });

    const result = await service.search("民法");

    expect(result.source).toBe("cache");
    expect(result.hits.map((hit) => hit.lawId)).toEqual(["129AC0000000089"]);
  });
});
