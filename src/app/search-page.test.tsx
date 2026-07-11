import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

    // 候補リストが表示されるまで待機する。
    await screen.findByText("民法");
    expect(screen.getByText("商法")).toBeInTheDocument();

    // 同一マウントのまま q を空にして /search へ遷移する。
    await act(async () => {
      await router.navigate({ to: "/search", search: { q: "" } });
    });

    // 空クエリ時の促しテキストが表示される。
    await waitFor(() => {
      expect(screen.getByText(/入力してください/)).toBeInTheDocument();
    });

    // stale な候補（商法）は DOM に存在しない。
    expect(screen.queryByText("商法")).not.toBeInTheDocument();
  });
});
