import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createQuickSearch } from "@/core/jump";
import type { QuickSearch, QuickSearchOutcome } from "@/core/jump";
import type { CatalogSearchResult, CatalogSearchService } from "@/core/search";

import { SearchPage } from "./search-page";

const emptyCatalog: CatalogSearchService = {
  search: (): Promise<CatalogSearchResult> => Promise.resolve({ hits: [], source: "cache" }),
};

const renderSearch = (q: string, quickSearch = createQuickSearch({ catalog: emptyCatalog })) => {
  const rootRoute = createRootRoute();
  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "search",
    validateSearch: (search: Record<string, unknown>): { q?: string } => ({
      q: typeof search.q === "string" ? search.q : undefined,
    }),
    component: () => <SearchPage quickSearch={quickSearch} />,
  });
  const lawRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws/$lawId/articles/$article",
    component: () => <div>article page</div>,
  });
  const history = createMemoryHistory({ initialEntries: [`/search?q=${encodeURIComponent(q)}`] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([searchRoute, lawRoute]),
    history,
  });

  render(<RouterProvider router={router} />);
  return { history, router };
};

describe("SearchPage", () => {
  it("単一の確定参照は該当条文へ自動遷移する", async () => {
    const { history } = renderSearch("民709");

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/709");
    });
  });

  it("相対参照は文脈が必要である旨を表示する", async () => {
    renderSearch("前条");

    expect(await screen.findByText(/前後の文脈が必要/)).toBeInTheDocument();
  });

  it("クエリが非空→空に遷移したとき stale な候補を表示しない（regression）", async () => {
    // autoJump: false の複数候補を返す fake quickSearch。
    // q が非空のときだけ候補を返し、空のときは empty を返す。
    const multiCandidateOutcome: QuickSearchOutcome = {
      status: "candidates",
      candidates: [
        {
          kind: "catalog",
          lawId: "129AC0000000089",
          lawTitle: "民法",
          reason: ["法令名『民法』に一致"],
          score: 0.3,
        },
        {
          kind: "catalog",
          lawId: "132AC0000000048",
          lawTitle: "商法",
          reason: ["法令名『商法』に一致"],
          score: 0.3,
        },
      ],
      autoJump: false,
    };
    const fakeQuickSearch: QuickSearch = {
      search: (query: string) => {
        if (query.trim() === "") {
          return Promise.resolve({ status: "empty" });
        }
        return Promise.resolve(multiCandidateOutcome);
      },
    };

    const { router } = renderSearch("民法", fakeQuickSearch);

    // 候補リストが表示されるまで待機する（科目フィルタの option にも「民法」があるため link で絞る）。
    await screen.findByRole("link", { name: /民法/ });
    expect(screen.getByRole("link", { name: /商法/ })).toBeInTheDocument();

    // 同一マウントのまま q を空にして /search へ遷移する。
    await act(async () => {
      await router.navigate({ to: "/search", search: { q: "" } });
    });

    // 空クエリ時の促しテキストが表示される。
    await waitFor(() => {
      expect(screen.getByText(/入力してください/)).toBeInTheDocument();
    });

    // stale な候補（商法）は DOM に存在しない。
    expect(screen.queryByRole("link", { name: /商法/ })).not.toBeInTheDocument();
  });

  it("検索中はスケルトンを表示し、解決後に候補を表示する", async () => {
    let resolveFn: ((outcome: QuickSearchOutcome) => void) | undefined;
    const quickSearch = {
      search: vi.fn(
        () =>
          new Promise<QuickSearchOutcome>((resolve) => {
            resolveFn = resolve;
          }),
      ),
    } as unknown as QuickSearch;

    // 既存の renderSearch は quickSearch を第2引数で受け取れる。
    renderSearch("民法", quickSearch);

    expect(await screen.findByRole("status", { name: "検索中" })).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
      resolveFn?.({
        status: "candidates",
        candidates: [
          { kind: "catalog", lawId: "129AC0000000089", lawTitle: "民法", reason: [], score: 0.3 },
        ],
        autoJump: false,
      });
    });

    // 科目フィルタの option にも「民法」があるため link で絞る。
    expect(await screen.findByRole("link", { name: /民法/ })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "検索中" })).not.toBeInTheDocument();
  });
});

describe("SearchPage 科目フィルタ", () => {
  // 民法（civil）と行政手続法（administrative）の 2 候補を返す fake quickSearch。
  const crossSubjectOutcome: QuickSearchOutcome = {
    status: "candidates",
    candidates: [
      {
        kind: "catalog",
        lawId: "129AC0000000089",
        lawTitle: "民法",
        reason: ["法令名『民法』に一致"],
        score: 0.3,
      },
      {
        kind: "catalog",
        lawId: "405AC0000000088",
        lawTitle: "行政手続法",
        reason: ["法令名『行政手続法』に一致"],
        score: 0.3,
      },
    ],
    autoJump: false,
  };
  const crossSubjectQuickSearch: QuickSearch = {
    search: () => Promise.resolve(crossSubjectOutcome),
  };

  it("科目で候補を絞り込める", async () => {
    const user = userEvent.setup();
    renderSearch("法", crossSubjectQuickSearch);

    // 科目フィルタの option にも「民法」があるため link で絞る。
    expect(await screen.findByRole("link", { name: /民法/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /行政手続法/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("科目で絞り込む"), "administrative");

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /民法/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /行政手続法/ })).toBeInTheDocument();
  });

  it("科目フィルタで候補が 0 件になったら専用の文言を表示する", async () => {
    const user = userEvent.setup();
    renderSearch("法", crossSubjectQuickSearch);

    // 科目フィルタの option にも「民法」があるため link で絞る。
    await screen.findByRole("link", { name: /民法/ });
    await user.selectOptions(screen.getByLabelText("科目で絞り込む"), "constitution");

    expect(await screen.findByText("この科目に該当する候補がありません。")).toBeInTheDocument();
  });

  it("クエリが変わったら科目フィルタをリセットする", async () => {
    const user = userEvent.setup();
    const { router } = renderSearch("法", crossSubjectQuickSearch);

    // 科目フィルタの option にも「民法」があるため link で絞る。
    await screen.findByRole("link", { name: /民法/ });
    await user.selectOptions(screen.getByLabelText("科目で絞り込む"), "constitution");
    expect(await screen.findByText("この科目に該当する候補がありません。")).toBeInTheDocument();

    // 同一マウントのまま別のクエリへ遷移する。前の検索語向けの絞り込みが
    // 新しい候補に残ると即「0 件」表示になるため、フィルタはリセットされる。
    await act(async () => {
      await router.navigate({ to: "/search", search: { q: "民" } });
    });

    expect(await screen.findByRole("link", { name: /民法/ })).toBeInTheDocument();
    expect(screen.getByLabelText("科目で絞り込む")).toHaveValue("all");
  });
});
