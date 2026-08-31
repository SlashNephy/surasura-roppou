import type { LawListResult, LawRepository } from "@/core/egov";
import type { SearchIndexRepository } from "@/core/search";
import type { LawCatalogEntry } from "@/core/storage";
import { describe, expect, it, vi } from "vitest";

import { createLawNumberResolver } from "./law-number-resolver";
import { parseLawNumber } from "./law-number";

const parse = (text: string) => {
  const parsed = parseLawNumber(text);

  if (parsed === undefined) {
    throw new Error(`unparsable law number: ${text}`);
  }

  return parsed;
};

const emptyResult: LawListResult = { totalCount: 0, count: 0, laws: [] };

const lawResult = (lawId: string, lawNumber: string): LawListResult => ({
  totalCount: 1,
  count: 1,
  laws: [
    {
      law: { lawId, title: "テスト法", lawNumber, lawType: "Act", aliases: [], source: "egov" },
      revision: { lawId, revisionId: `${lawId}_r`, fetchedAt: "2026-08-31T00:00:00.000Z" },
    },
  ],
});

const createDependencies = ({
  catalog = [],
  listLaws = () => Promise.resolve(emptyResult),
}: {
  catalog?: LawCatalogEntry[];
  listLaws?: LawRepository["listLaws"];
} = {}) => {
  const upsertCatalogEntries = vi.fn<SearchIndexRepository["upsertCatalogEntries"]>(() =>
    Promise.resolve(),
  );
  const listLawsSpy = vi.fn(listLaws);

  return {
    upsertCatalogEntries,
    listLawsSpy,
    dependencies: {
      lawRepository: { listLaws: listLawsSpy } as unknown as LawRepository,
      indexRepository: {
        listCatalog: () => Promise.resolve(catalog),
        upsertCatalogEntries,
      } as unknown as SearchIndexRepository,
    },
  };
};

describe("createLawNumberResolver", () => {
  it("derives a cabinet order without touching the network", async () => {
    const { dependencies, listLawsSpy } = createDependencies();
    const resolver = createLawNumberResolver(dependencies);

    await expect(resolver.resolve(parse("昭和二十二年政令第二十一号"))).resolves.toBe(
      "322CO0000000021",
    );
    expect(listLawsSpy).not.toHaveBeenCalled();
  });

  it("resolves from the cached catalog without touching the network", async () => {
    const { dependencies, listLawsSpy } = createDependencies({
      catalog: [
        {
          lawId: "332AC1000000166",
          title: "核原料物質、核燃料物質及び原子炉の規制に関する法律",
          lawNumber: "昭和三十二年法律第百六十六号",
          aliases: [],
          cachedAt: "2026-08-31T00:00:00.000Z",
        },
      ],
    });
    const resolver = createLawNumberResolver(dependencies);

    // 本文側は算用数字で現れることがある。キーで突き合わせるため引けなければならない。
    await expect(resolver.resolve(parse("昭和32年法律第166号"))).resolves.toBe("332AC1000000166");
    expect(listLawsSpy).not.toHaveBeenCalled();
  });

  it("resolves an act through the repository and caches the result", async () => {
    const { dependencies, listLawsSpy, upsertCatalogEntries } = createDependencies({
      listLaws: () => Promise.resolve(lawResult("332AC1000000166", "昭和三十二年法律第百六十六号")),
    });
    const resolver = createLawNumberResolver(dependencies);

    await expect(resolver.resolve(parse("昭和32年法律第166号"))).resolves.toBe("332AC1000000166");
    expect(listLawsSpy).toHaveBeenCalledWith(
      {
        lawNumberEra: "Showa",
        lawNumberYear: 32,
        lawNumberType: "Act",
        lawNumberNumber: 166,
        limit: 1,
      },
      {},
    );
    expect(upsertCatalogEntries).toHaveBeenCalledWith([
      expect.objectContaining({ lawId: "332AC1000000166" }),
    ]);
  });

  it.each([
    {
      name: "does not resolve when the repository returns more than one law",
      result: { totalCount: 2, count: 1, laws: lawResult("332AC1000000166", "x").laws },
    },
    { name: "does not resolve when the repository returns nothing", result: emptyResult },
  ])("$name", async ({ result }) => {
    const { dependencies } = createDependencies({ listLaws: () => Promise.resolve(result) });
    const resolver = createLawNumberResolver(dependencies);

    await expect(resolver.resolve(parse("昭和32年法律第166号"))).resolves.toBeUndefined();
  });

  it("does not query a law type the api cannot look up", async () => {
    const { dependencies, listLawsSpy } = createDependencies();
    const resolver = createLawNumberResolver(dependencies);

    await expect(resolver.resolve(parse("明治二十七年大蔵省令第二号"))).resolves.toBeUndefined();
    expect(listLawsSpy).not.toHaveBeenCalled();
  });

  it("does not retry a law number that failed to resolve", async () => {
    const { dependencies, listLawsSpy } = createDependencies({
      listLaws: () => Promise.resolve(emptyResult),
    });
    const resolver = createLawNumberResolver(dependencies);

    await resolver.resolve(parse("昭和32年法律第166号"));
    await resolver.resolve(parse("昭和32年法律第166号"));

    expect(listLawsSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves an api-unresolvable law type from the cached catalog", async () => {
    // 省令は法令番号から引けないが、検索経由でカタログに入っていれば解決できる。
    // 種別で早々に諦めると、手元にある答えを使い損ねる。
    const { dependencies, listLawsSpy } = createDependencies({
      catalog: [
        {
          lawId: "127M10000040002",
          title: "テスト省令",
          lawNumber: "明治二十七年大蔵省令第二号",
          aliases: [],
          cachedAt: "2026-08-31T00:00:00.000Z",
        },
      ],
    });
    const resolver = createLawNumberResolver(dependencies);

    await expect(resolver.resolve(parse("明治二十七年大蔵省令第二号"))).resolves.toBe(
      "127M10000040002",
    );
    expect(listLawsSpy).not.toHaveBeenCalled();
  });

  it("does not send duplicate requests for concurrent resolves of the same law number", async () => {
    const { dependencies, listLawsSpy } = createDependencies({
      listLaws: () => Promise.resolve(lawResult("332AC1000000166", "昭和三十二年法律第百六十六号")),
    });
    const resolver = createLawNumberResolver(dependencies);

    const [first, second] = await Promise.all([
      resolver.resolve(parse("昭和32年法律第166号")),
      resolver.resolve(parse("昭和32年法律第166号")),
    ]);

    expect(first).toBe("332AC1000000166");
    expect(second).toBe("332AC1000000166");
    expect(listLawsSpy).toHaveBeenCalledTimes(1);
  });

  it("does not resolve when the returned law's number does not match the request", async () => {
    // 322CO0000000052（昭和二十二年政令第五十二号）は law_num_type が "Act,CabinetOrder" を
    // 兼ねるため、law_num_type=Act で問い合わせても totalCount 1 で返ってくる（実測済み）。
    // 本文が指す「昭和二十二年法律第五十二号」とは別の法令であり、誤リンクしてはならない。
    const { dependencies, upsertCatalogEntries } = createDependencies({
      listLaws: () => Promise.resolve(lawResult("322CO0000000052", "昭和二十二年政令第五十二号")),
    });
    const resolver = createLawNumberResolver(dependencies);

    await expect(resolver.resolve(parse("昭和22年法律第52号"))).resolves.toBeUndefined();
    expect(upsertCatalogEntries).not.toHaveBeenCalled();
  });

  it("resolves even when caching the result fails", async () => {
    const { dependencies, upsertCatalogEntries } = createDependencies({
      listLaws: () => Promise.resolve(lawResult("332AC1000000166", "昭和三十二年法律第百六十六号")),
    });

    upsertCatalogEntries.mockRejectedValueOnce(new Error("write failed"));

    const resolver = createLawNumberResolver(dependencies);

    await expect(resolver.resolve(parse("昭和32年法律第166号"))).resolves.toBe("332AC1000000166");
  });

  it("starts a fresh request instead of joining an in-flight promise whose signal is already aborted", async () => {
    // 法令 A の表示中に解決が走り、法令 B へ切り替えて A の effect が中断しても、
    // B が同じ法令番号を解決しようとしたときに中断済みのプロミスへ相乗りしてはならない。
    const controllerA = new AbortController();
    let callCount = 0;
    const { dependencies } = createDependencies({
      listLaws: (_query, options) => {
        callCount += 1;

        if (callCount === 1) {
          return new Promise((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          });
        }

        return Promise.resolve(lawResult("332AC1000000166", "昭和三十二年法律第百六十六号"));
      },
    });
    const resolver = createLawNumberResolver(dependencies);

    const first = resolver.resolve(parse("昭和32年法律第166号"), { signal: controllerA.signal });

    first.catch(() => {
      // 中断は想定内。ここでは検証しない。
    });
    controllerA.abort();

    await expect(resolver.resolve(parse("昭和32年法律第166号"))).resolves.toBe("332AC1000000166");
    expect(callCount).toBe(2);
  });

  it("does not remember an abort as a failure", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    let attempts = 0;
    const { dependencies } = createDependencies({
      listLaws: () => {
        attempts += 1;

        return attempts === 1
          ? Promise.reject(abortError)
          : Promise.resolve(lawResult("332AC1000000166", "昭和三十二年法律第百六十六号"));
      },
    });
    const resolver = createLawNumberResolver(dependencies);

    await expect(resolver.resolve(parse("昭和32年法律第166号"))).rejects.toBe(abortError);
    await expect(resolver.resolve(parse("昭和32年法律第166号"))).resolves.toBe("332AC1000000166");
  });
});
