import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createQuickSearch } from "@/core/jump";
import type { CatalogSearchResult, CatalogSearchService } from "@/core/search";

import { SearchPage } from "./search-page";

const emptyCatalog: CatalogSearchService = {
  search: (): Promise<CatalogSearchResult> => Promise.resolve({ hits: [], source: "cache" }),
};

const renderSearch = (q: string) => {
  const quickSearch = createQuickSearch({ catalog: emptyCatalog });
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
});
