import { describe, expect, it, vi } from "vitest";

import type { CatalogSearchResult, CatalogSearchService, LawCatalogHit } from "@/core/search";

import { createQuickSearch } from "./quick-search";

// カタログはネットワーク層。テストではモックを注入する。
const createCatalogStub = (hits: LawCatalogHit[]): CatalogSearchService => ({
  search: vi.fn((): Promise<CatalogSearchResult> => Promise.resolve({ hits, source: "cache" })),
});

const catalogHit = (overrides: Partial<LawCatalogHit> = {}): LawCatalogHit => ({
  lawId: "129AC0000000089",
  title: "民法",
  lawNumber: "明治二十九年法律第八十九号",
  matchedField: "name",
  ...overrides,
});

describe("createQuickSearch", () => {
  it("空クエリは empty を返す", async () => {
    const quickSearch = createQuickSearch({ catalog: createCatalogStub([]) });

    await expect(quickSearch.search("   ")).resolves.toEqual({ status: "empty" });
  });

  it("単一の具体参照は autoJump 付きで返し、カタログ検索を呼ばない", async () => {
    // search スパイを独立変数として保持し、unbound-method 警告を回避する。
    const catalogSearch = vi.fn((): Promise<CatalogSearchResult> =>
      Promise.resolve({ hits: [catalogHit()], source: "cache" }),
    );
    const catalog: CatalogSearchService = { search: catalogSearch };
    const quickSearch = createQuickSearch({ catalog });

    const outcome = await quickSearch.search("民709");

    expect(outcome.status).toBe("candidates");
    if (outcome.status !== "candidates") return;
    expect(outcome.autoJump).toBe(true);
    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.candidates[0]).toMatchObject({
      kind: "reference",
      lawId: "129AC0000000089",
      article: "709",
    });
    // autoJump 確定時はネットワークを叩かない
    expect(catalogSearch).not.toHaveBeenCalled();
  });

  it("法令名のみ（条なし）は autoJump せず、カタログ候補と併記する", async () => {
    const catalog = createCatalogStub([catalogHit({ matchedField: "name" })]);
    const quickSearch = createQuickSearch({ catalog });

    const outcome = await quickSearch.search("民法");

    expect(outcome.status).toBe("candidates");
    if (outcome.status !== "candidates") return;
    expect(outcome.autoJump).toBe(false);
    // 参照（民法・法令レベル）が上位、同一 lawId のカタログ重複は除去される
    expect(outcome.candidates.map((candidate) => candidate.kind)).toEqual(["reference"]);
    expect(outcome.candidates[0].article).toBeUndefined();
  });

  it("相対参照は unresolved(needs-context) を返す", async () => {
    const quickSearch = createQuickSearch({ catalog: createCatalogStub([]) });

    const outcome = await quickSearch.search("前条");

    expect(outcome).toMatchObject({ status: "unresolved", reason: "needs-context" });
  });

  it("辞書外の絶対参照でもカタログ該当があればカタログ候補を返す", async () => {
    const catalog = createCatalogStub([
      catalogHit({ lawId: "347AC0000000057", title: "銀行法", matchedField: "name" }),
    ]);
    const quickSearch = createQuickSearch({ catalog });

    const outcome = await quickSearch.search("銀行法");

    expect(outcome.status).toBe("candidates");
    if (outcome.status !== "candidates") return;
    expect(outcome.candidates[0]).toMatchObject({ kind: "catalog", lawId: "347AC0000000057" });
  });

  it("search は signal をカタログ検索へ渡す", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const catalog: CatalogSearchService = {
      search: vi.fn(
        (
          _query: string,
          options?: { online?: boolean; limit?: number; signal?: AbortSignal },
        ): Promise<CatalogSearchResult> => {
          received = options?.signal;
          return Promise.resolve({ hits: [], source: "cache" });
        },
      ),
    };
    const quickSearch = createQuickSearch({ catalog });

    // 法令名のみ（autoJump しない）→ カタログ検索が走る
    await quickSearch.search("民法", { signal: controller.signal });

    expect(received).toBe(controller.signal);
  });
});
