import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createQuickSearch } from "@/core/jump";
import type { QuickSearch, QuickSearchOutcome } from "@/core/jump";
import type { CatalogSearchResult, CatalogSearchService } from "@/core/search";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { createAppRouter } from "./router";

setupScrollMocks();

// jsdom は ResizeObserver を実装していないが、cmdk の CommandList は
// 内部で高さ計測のために ResizeObserver を利用するため、最小限のスタブを用意する。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {
      // 高さ計測は行わないため何もしない
    }

    unobserve() {
      // 高さ計測は行わないため何もしない
    }

    disconnect() {
      // 高さ計測は行わないため何もしない
    }
  },
);

const emptyCatalog: CatalogSearchService = {
  search: (): Promise<CatalogSearchResult> => Promise.resolve({ hits: [], source: "cache" }),
};

const renderShell = async (initialEntry = "/laws") => {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const storageRepository = createMemoryStorageRepository().repository;
  const quickSearch = createQuickSearch({ catalog: emptyCatalog });

  render(<RouterProvider router={createAppRouter({ history, storageRepository, quickSearch })} />);
  await screen.findByRole("banner");

  return { history };
};

// 手動で解決できる遅延 quickSearch。検索中スケルトンの検証に使う。
const createDeferredQuickSearch = () => {
  let resolveFn: ((outcome: QuickSearchOutcome) => void) | undefined;
  const search = vi.fn(
    () =>
      new Promise<QuickSearchOutcome>((resolve) => {
        resolveFn = resolve;
      }),
  );
  return {
    quickSearch: { search } as unknown as QuickSearch,
    // search の参照を直接公開することで unbound-method lint を回避する
    searchMock: search,
    resolve: (outcome: QuickSearchOutcome) => resolveFn?.(outcome),
  };
};

describe("SearchPalette", () => {
  it("opens the palette from the header trigger and navigates to a destination", async () => {
    const user = userEvent.setup();
    const { history } = await renderShell();

    await user.click(screen.getByRole("button", { name: /^検索/ }));

    const dialog = await screen.findByRole("dialog", { name: "検索" });
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "今日の復習" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/study");
    });
  });

  it("opens the palette with the slash key", async () => {
    const user = userEvent.setup();
    await renderShell();

    await user.keyboard("/");

    expect(await screen.findByRole("dialog", { name: "検索" })).toBeInTheDocument();
  });

  it("resolves a concrete reference query into a jump candidate", async () => {
    const user = userEvent.setup();
    const { history } = await renderShell();

    await user.keyboard("/");
    await user.type(screen.getByPlaceholderText("法律や条文で検索できます"), "国賠1");

    const option = await screen.findByRole("option", { name: /国家賠償法/ });
    await user.click(option);

    await waitFor(() => {
      // 国家賠償法 lawId は src/core/jump/alias-dictionary.ts で確認済み。
      expect(history.location.pathname).toBe("/laws/322AC0000000125/articles/1");
    });
  });

  it("offers a full search entry that navigates to /search", async () => {
    const user = userEvent.setup();
    const { history } = await renderShell();

    await user.keyboard("/");
    await user.type(screen.getByPlaceholderText("法律や条文で検索できます"), "民法");

    await user.click(await screen.findByRole("option", { name: /「民法」で検索/ }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/search");
      expect(history.location.search).toContain("q=");
    });
  });

  it("検索中はスケルトン（検索中インジケータ）を表示する", async () => {
    const user = userEvent.setup();
    const { quickSearch, searchMock, resolve } = createDeferredQuickSearch();
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;
    render(
      <RouterProvider router={createAppRouter({ history, storageRepository, quickSearch })} />,
    );
    await screen.findByRole("banner");

    await user.keyboard("/");
    await user.type(screen.getByPlaceholderText("法律や条文で検索できます"), "民法");

    // デバウンス後に検索が走り、解決前はスケルトンが出る
    expect(await screen.findByRole("status", { name: "検索中" })).toBeInTheDocument();

    // デバウンス（200ms）後に quickSearch.search が呼ばれるまで待つ
    await waitFor(() => {
      expect(searchMock).toHaveBeenCalled();
    });

    act(() => {
      resolve({
        status: "candidates",
        candidates: [
          { kind: "catalog", lawId: "129AC0000000089", lawTitle: "民法", reason: [], score: 0.3 },
        ],
        autoJump: false,
      });
    });

    // 候補グループの「民法」オプションを待つ（「民法」で検索 とは区別するため前方一致）
    expect(await screen.findByRole("option", { name: /^民法/ })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "検索中" })).not.toBeInTheDocument();
  });
});
