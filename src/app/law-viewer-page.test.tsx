import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { computeArticleFingerprint } from "@/core/domain";
import type { Bookmark } from "@/core/domain";
import { createEgovLawRepository } from "@/core/egov";
import type { LawDocument, LawListResult, LawMetadata, LawRepository } from "@/core/egov";
import { setBaseDate } from "@/core/settings";
import { createJsonFetchStub, fixedTestNow as now, lawDataFixture } from "@/test/fixtures/egov";
import type { StorageRepository } from "@/core/storage";
import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { LawViewerPage, LawViewerPageContent } from "./law-viewer-page";
import { sampleLawViewerDocument } from "./law-viewer-sample";
import { createAppRouter } from "./router";
import type { LawViewerState } from "./law-viewer-page";

const scrollMocks = setupScrollMocks();

afterEach(() => {
  localStorage.clear();
});

const createFixtureRepository = () => {
  const { calls, fetcher } = createJsonFetchStub(lawDataFixture);

  return {
    calls,
    repository: createEgovLawRepository({ fetcher, now }),
  };
};

const createMissingRepository = (): LawRepository => {
  const { fetcher } = createJsonFetchStub(
    {
      code: "400001",
      message: "指定された法令IDが存在しません。",
    },
    404,
  );

  return createEgovLawRepository({ fetcher, now });
};

const pendingRepository = {
  listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
  getLaw: (): Promise<LawDocument> =>
    new Promise((resolve) => {
      void resolve;
    }),
  getLawMetadata: (): Promise<LawMetadata> => Promise.reject(new Error("Not used in this test")),
} satisfies LawRepository;

const renderLawViewerRoute = (
  path: string,
  repository = createFixtureRepository().repository,
  storageRepository = createMemoryStorageRepository().repository,
) => {
  const LawViewerRoute = () => (
    <LawViewerPage repository={repository} storageRepository={storageRepository} />
  );
  const history = createMemoryHistory({ initialEntries: [path] });
  const rootRoute = createRootRoute({
    component: Outlet,
  });
  const baseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws/$lawId",
    component: LawViewerRoute,
  });
  const articleRoute = createRoute({
    getParentRoute: () => baseRoute,
    path: "articles/$article",
    component: LawViewerRoute,
  });

  render(
    <RouterProvider
      router={createRouter({
        history,
        routeTree: rootRoute.addChildren([baseRoute.addChildren([articleRoute])]),
      })}
    />,
  );

  return {
    history,
    user: userEvent.setup(),
  };
};

const renderLawViewerContentRoute = (
  path: string,
  state: LawViewerState,
  // 既定はメモリ実装。テスト環境に IndexedDB が無いため、アンカー検証フックが
  // 既定の実ストレージへ問い合わせて未処理拒否を出すのを避ける。
  storageRepository: StorageRepository = createMemoryStorageRepository().repository,
  // 見比べダイアログの作成時版取得を含め、既定の実 e-Gov リポジトリへ通信させないための注入口。
  repository?: LawRepository,
) => {
  const BaseLawViewerRoute = () => {
    const { lawId } = useParams({ from: "/laws/$lawId" });

    return (
      <LawViewerPageContent
        lawId={lawId}
        repository={repository}
        state={state}
        storageRepository={storageRepository}
      />
    );
  };
  const ArticleLawViewerRoute = () => {
    const { article, lawId } = useParams({ from: "/laws/$lawId/articles/$article" });

    return (
      <LawViewerPageContent
        activeArticleNumber={article}
        lawId={lawId}
        repository={repository}
        state={state}
        storageRepository={storageRepository}
      />
    );
  };
  const rootRoute = createRootRoute({
    component: Outlet,
  });
  const baseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws/$lawId",
    component: BaseLawViewerRoute,
  });
  const articleRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws/$lawId/articles/$article",
    component: ArticleLawViewerRoute,
  });
  const history = createMemoryHistory({ initialEntries: [path] });

  render(
    <RouterProvider
      router={createRouter({
        history,
        routeTree: rootRoute.addChildren([baseRoute, articleRoute]),
      })}
    />,
  );

  return {
    history,
    user: userEvent.setup(),
  };
};

const nonNumericArticleState = {
  status: "ready",
  law: {
    lawId: "custom-law",
    title: "条番号テスト法",
    aliases: [],
    source: "egov",
  },
  revision: {
    lawId: "custom-law",
    revisionId: "custom-law_revision",
    fetchedAt: "2026-07-05T00:00:00.000Z",
  },
  nodes: [
    {
      id: "article:709-2",
      lawId: "custom-law",
      revisionId: "custom-law_revision",
      type: "Article",
      path: "article:709-2",
      number: "709の2",
      title: "第七百九条の二",
      rawText: "第七百九条の二　条番号の枝番を確認する。",
      plainText: "第七百九条の二 条番号の枝番を確認する。",
      children: [],
    },
  ],
  isSaved: false,
  loadedFromStorage: false,
} satisfies LawViewerState;

describe("LawViewerPageContent", () => {
  it("renders a loading state from the page state contract", () => {
    render(<LawViewerPageContent state={{ status: "loading" }} />);

    expect(screen.getByLabelText("法令本文を読み込み中")).toBeInTheDocument();
  });

  it("renders an error state with a return link to law search", async () => {
    renderLawViewerRoute("/laws/not-found", createMissingRepository());

    expect(await screen.findByRole("alert")).toHaveTextContent("法令が見つかりません。");
    expect(screen.getByRole("link", { name: "法令検索へ戻る" })).toHaveAttribute("href", "/laws");
  });

  it("renders an offline-unavailable state with the law title", async () => {
    renderLawViewerRoute("/laws/offline-demo");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "この法令は端末に保存されていません",
    );
    expect(screen.getByText("民法")).toBeInTheDocument();
  });

  it("renders a loading state while the repository request is pending", async () => {
    renderLawViewerRoute("/laws/129AC0000000089", pendingRepository);

    expect(await screen.findByLabelText("法令本文を読み込み中")).toBeInTheDocument();
  });

  it("loads the ready law through the repository as unsaved", async () => {
    const { calls, repository } = createFixtureRepository();

    renderLawViewerRoute("/laws/129AC0000000089", repository);

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByText("未保存")).toBeInTheDocument();
    expect(calls).toEqual([
      {
        input:
          "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089?law_full_text_format=json&response_format=json",
        init: { headers: { accept: "application/json" } },
      },
    ]);
  });

  it("saves the loaded law document for offline viewing", async () => {
    const storage = createMemoryStorageRepository();
    const { user } = renderLawViewerRoute(
      "/laws/129AC0000000089",
      createFixtureRepository().repository,
      storage.repository,
    );

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "オフライン保存" }));

    expect(screen.getByText("保存済み")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存解除" })).toBeInTheDocument();
    expect(storage.getSavedDocument()?.law.title).toBe("民法");
  });

  it("shows a recoverable error when offline save fails", async () => {
    const storageRepository = {
      ...createMemoryStorageRepository().repository,
      saveLawDocument: () => Promise.reject(new Error("Quota exceeded")),
    };
    const { user } = renderLawViewerRoute(
      "/laws/129AC0000000089",
      createFixtureRepository().repository,
      storageRepository,
    );

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "オフライン保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "オフライン保存を更新できませんでした。",
    );
    expect(screen.getByRole("button", { name: "オフライン保存" })).toBeEnabled();
    expect(screen.getByText("未保存")).toBeInTheDocument();
  });

  it("removes a saved law document without leaving the viewer", async () => {
    const storage = createMemoryStorageRepository(
      createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    );
    const { user } = renderLawViewerRoute(
      "/laws/129AC0000000089",
      createFixtureRepository().repository,
      storage.repository,
    );

    expect(await screen.findByRole("button", { name: "保存解除" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存解除" }));

    expect(screen.getByRole("button", { name: "オフライン保存" })).toBeInTheDocument();
    expect(screen.getByText("未保存")).toBeInTheDocument();
    expect(storage.getSavedDocument()).toBeUndefined();
  });

  it("shows the saved law body when the network is unavailable", async () => {
    const repository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (): Promise<LawDocument> => Promise.reject(new Error("network down")),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;
    const storage = createMemoryStorageRepository(
      createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    );

    renderLawViewerRoute("/laws/129AC0000000089", repository, storage.repository);

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByText("保存済み本文を表示中")).toBeInTheDocument();
    expect(screen.getByText("取得: 2026-07-05")).toBeInTheDocument();
  });

  it("renders readable display mode by default", async () => {
    renderLawViewerRoute("/laws/129AC0000000089");

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "読みやすい表示" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const article = screen.getByRole("article", { name: "第一条" });

    expect(within(article).getByRole("heading", { name: "第1条" })).toBeInTheDocument();
    expect(
      within(article).getByText("私権は、公共の福祉に適合しなければならない。"),
    ).toBeInTheDocument();
  });

  it("switches between readable and original display modes", async () => {
    const { user } = renderLawViewerRoute("/laws/129AC0000000089");

    await screen.findByRole("article", { name: "民法" });
    await user.click(screen.getByRole("button", { name: "原文表示" }));

    expect(screen.getByRole("button", { name: "原文表示" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const article = screen.getByRole("article", { name: "第一条" });

    expect(within(article).getByRole("heading", { name: "第一条" })).toBeInTheDocument();
    expect(
      within(article).getByText("私権は、公共の福祉に適合しなければならない。"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "読みやすい表示" }));

    expect(screen.getByRole("button", { name: "読みやすい表示" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(article).getByRole("heading", { name: "第1条" })).toBeInTheDocument();
  });

  it("copies an article in the unified format from the article hover action", async () => {
    const clipboard = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const { user } = renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
    });

    await withClipboard(clipboard, async () => {
      const article = await screen.findByRole("article", { name: "第一条" });
      const articleUrl = `${window.location.origin}/laws/129AC0000000089/articles/1`;

      await user.click(within(article).getByRole("button", { name: "第一条をコピー" }));

      expect(clipboard).toHaveBeenLastCalledWith(
        [
          "第一条",
          "",
          "私権は、公共の福祉（公共の利益を含む。）に適合しなければならない。",
          "",
          articleUrl,
        ].join("\n"),
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("does not show success notifications after article or URL copy", async () => {
    const clipboard = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const { user } = renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
    });

    await withClipboard(clipboard, async () => {
      const article = await screen.findByRole("article", { name: "第一条" });

      await user.click(within(article).getByRole("button", { name: "第一条をコピー" }));

      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      await user.click(within(article).getByRole("button", { name: "第一条のURLコピー" }));

      await waitFor(() => {
        expect(screen.getByRole("article", { name: "第一条" })).toHaveAttribute(
          "data-active",
          "true",
        );
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("shows a recoverable alert when clipboard is unavailable", async () => {
    const { user } = renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
    });

    await withClipboard(undefined, async () => {
      const article = await screen.findByRole("article", { name: "第一条" });

      await user.click(within(article).getByRole("button", { name: "第一条をコピー" }));

      expect(screen.getByRole("alert")).toHaveTextContent("コピー機能を利用できません。");
    });
  });

  it("activates and scrolls to the article from the URL", async () => {
    renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    expect(await screen.findByRole("article", { name: "第一条" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "第一条" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    await waitFor(() => {
      expect(scrollMocks.scrollIntoView).toHaveBeenCalledWith({
        block: "start",
        behavior: "smooth",
      });
    });
  });

  it("navigates to the selected article from the table of contents", async () => {
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    await user.click(await screen.findByRole("button", { name: "第二条" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/2");
    });
  });

  it("copies the article URL and selects the article from the inline URL action", async () => {
    const clipboard = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    await withClipboard(clipboard, async () => {
      await screen.findByRole("article", { name: "民法" });
      const secondArticle = screen.getByRole("article", { name: "第二条" });

      await user.click(within(secondArticle).getByRole("button", { name: "第二条のURLコピー" }));

      await waitFor(() => {
        expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/2");
        expect(screen.getByRole("article", { name: "第二条" })).toHaveAttribute(
          "data-active",
          "true",
        );
      });
      expect(clipboard).toHaveBeenLastCalledWith(
        `${window.location.origin}/laws/129AC0000000089/articles/2`,
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("navigates to an article from the jump form", async () => {
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    await user.type(await screen.findByLabelText("条番号"), "2");
    await user.click(screen.getByRole("button", { name: "移動" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/2");
    });
  });

  it("navigates to a non-numeric article number from the jump form", async () => {
    const { history, user } = renderLawViewerContentRoute(
      "/laws/custom-law",
      nonNumericArticleState,
    );

    await user.type(await screen.findByLabelText("条番号"), "709の2");
    await user.click(screen.getByRole("button", { name: "移動" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/custom-law/articles/709%E3%81%AE2");
    });
  });

  it("normalizes full-width article number input before navigating", async () => {
    const { history, user } = renderLawViewerContentRoute(
      "/laws/custom-law",
      nonNumericArticleState,
    );

    await user.type(await screen.findByLabelText("条番号"), "７０９ の ２");
    await user.click(screen.getByRole("button", { name: "移動" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/custom-law/articles/709%E3%81%AE2");
    });
  });

  it("keeps the current law page and shows an alert for an unknown jump target", async () => {
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    await user.type(await screen.findByLabelText("条番号"), "999");
    await user.click(screen.getByRole("button", { name: "移動" }));

    expect(history.location.pathname).toBe("/laws/129AC0000000089");
    const articleInput = screen.getByLabelText("条番号");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("指定された条文が見つかりません。");
    expect(alert).toHaveAttribute("id", "article-jump-error");
    expect(articleInput).toHaveAttribute("aria-describedby", "article-jump-error");
    expect(articleInput).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the law body visible and shows an alert for an unknown route article", async () => {
    renderLawViewerRoute("/laws/129AC0000000089/articles/999");

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("指定された条文が見つかりません。");
  });

  it("does not mark the jump input invalid for an unknown route article before form submit", async () => {
    renderLawViewerRoute("/laws/129AC0000000089/articles/999");

    const articleInput = await screen.findByLabelText("条番号");

    expect(screen.getByRole("alert")).toHaveTextContent("指定された条文が見つかりません。");
    expect(articleInput).not.toHaveAttribute("aria-describedby");
    expect(articleInput).not.toHaveAttribute("aria-invalid");
  });

  it("keeps a single article error alert when route and jump targets are both unknown", async () => {
    const { user } = renderLawViewerRoute("/laws/129AC0000000089/articles/999");

    await user.type(await screen.findByLabelText("条番号"), "998");
    await user.click(screen.getByRole("button", { name: "移動" }));

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("指定された条文が見つかりません。");
  });

  it("opens the mobile table of contents from the toggle", async () => {
    const { user } = renderLawViewerRoute("/laws/129AC0000000089");

    const tocToggle = await screen.findByRole("button", { name: "目次" });
    const mobileTocPanel = document.querySelector("#law-viewer-mobile-toc");

    expect(tocToggle).toHaveAttribute("aria-expanded", "false");
    expect(tocToggle).toHaveClass("lg:hidden");
    expect(tocToggle).not.toHaveClass("md:hidden");
    expect(mobileTocPanel).toBeInTheDocument();
    expect(mobileTocPanel).toHaveAttribute("hidden");

    await user.click(tocToggle);

    expect(tocToggle).toHaveAttribute("aria-expanded", "true");
    expect(mobileTocPanel).not.toHaveAttribute("hidden");
    expect(
      within(mobileTocPanel as HTMLElement).getByRole("navigation", { name: "法令目次" }),
    ).toBeInTheDocument();
  });

  it("closes the mobile table of contents after selecting an article", async () => {
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    const tocToggle = await screen.findByRole("button", { name: "目次" });
    await user.click(tocToggle);
    const mobileTocPanel = document.querySelector("#law-viewer-mobile-toc");

    await user.click(within(mobileTocPanel as HTMLElement).getByRole("button", { name: "第二条" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/2");
    });
    expect(tocToggle).toHaveAttribute("aria-expanded", "false");
    expect(mobileTocPanel).toHaveAttribute("hidden");
  });

  it("scrolls again when selecting the currently active article", async () => {
    const { user } = renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    await screen.findByRole("article", { name: "第一条" });
    scrollMocks.scrollIntoView.mockClear();

    await user.click(screen.getByRole("button", { name: "第一条" }));

    expect(scrollMocks.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("keeps the article input text-friendly for branch article numbers", async () => {
    renderLawViewerRoute("/laws/129AC0000000089");

    const articleInput = await screen.findByLabelText("条番号");
    expect(articleInput).toHaveAttribute("name", "article");
    expect(articleInput).toHaveAttribute("autocomplete", "off");
    expect(articleInput).not.toHaveAttribute("inputmode", "numeric");
  });

  it("renders the study context panel", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws/129AC0000000089"] });
    const { fetcher } = createJsonFetchStub(lawDataFixture);
    const lawRepository = createEgovLawRepository({ fetcher, now });
    const storageRepository = createMemoryStorageRepository().repository;

    render(
      <RouterProvider router={createAppRouter({ history, lawRepository, storageRepository })} />,
    );

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "学習コンテキスト" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "法令の目次" })).toBeInTheDocument();
  });

  it("shows the current-law base date label when no base date is set", async () => {
    renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
    });

    // ルーターの初回マッチ解決は非同期のため、本文が描画されるまで待ってから検証する。
    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getAllByText(/基準日 未設定（現行法）/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/施行日 2026-06-24/).length).toBeGreaterThan(0);
  });

  it("shows the resolved base date when one is requested", async () => {
    renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
      requestedAsOf: "2020-06-01",
    });

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getAllByText(/基準日 2020-06-01/).length).toBeGreaterThan(0);
  });

  it("notes that the base date is not applied to an offline saved body", async () => {
    renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
      loadedFromStorage: true,
      requestedAsOf: "2020-06-01",
    });

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByText(/保存版を表示中のため基準日は未反映/)).toBeInTheDocument();
  });

  it("shows the effective date label as unknown when effectiveDate is an empty string", async () => {
    renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
      revision: { ...sampleLawViewerDocument.revision, effectiveDate: "" },
    });

    // ルーターの初回マッチ解決は非同期のため、本文が描画されるまで待ってから検証する。
    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getAllByText(/施行日 不明/).length).toBeGreaterThan(0);
  });

  it("re-resolves the displayed revision when the base date changes", async () => {
    const currentDocument = {
      law: sampleLawViewerDocument.law,
      revision: { ...sampleLawViewerDocument.revision, effectiveDate: "2026-06-24" },
      nodes: sampleLawViewerDocument.nodes,
      raw: {},
    } satisfies LawDocument;
    const olderDocument = {
      law: sampleLawViewerDocument.law,
      revision: {
        ...sampleLawViewerDocument.revision,
        revisionId: "129AC0000000089_20200401_501AC0000000034",
        effectiveDate: "2020-04-01",
      },
      nodes: sampleLawViewerDocument.nodes,
      raw: {},
    } satisfies LawDocument;
    const repository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (_lawId: string, query?: { asOf?: string }): Promise<LawDocument> =>
        Promise.resolve(query?.asOf === "2020-06-01" ? olderDocument : currentDocument),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;

    renderLawViewerRoute("/laws/129AC0000000089", repository);

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getAllByText(/施行日 2026-06-24/).length).toBeGreaterThan(0);

    act(() => {
      setBaseDate("2020-06-01");
    });

    await waitFor(() => {
      expect(screen.getAllByText(/施行日 2020-04-01/).length).toBeGreaterThan(0);
    });
  });

  it("アンカーが drift のとき改正の可能性バッジを表示する", async () => {
    const anchoredBookmark: Bookmark = {
      id: "bookmark-drift",
      target: {
        lawId: sampleLawViewerDocument.law.lawId,
        article: "1",
        revisionId: sampleLawViewerDocument.revision.revisionId,
        // 現在の第一条の指紋とは一致しない値。drift として検知される。
        fingerprint: "deadbeefdeadbeef",
      },
      title: "第一条",
      tags: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    };
    const { repository: storageRepository } = createMemoryStorageRepository({
      bookmarks: [anchoredBookmark],
    });

    renderLawViewerContentRoute(
      "/laws/129AC0000000089/articles/1",
      { status: "ready", ...sampleLawViewerDocument },
      storageRepository,
    );

    expect(await screen.findByText("改正の可能性")).toBeInTheDocument();
  });

  it("drift を「付け替える」で修復すると、再マウントなしに改正の可能性バッジが消える", async () => {
    const anchoredBookmark: Bookmark = {
      id: "bookmark-drift-repair",
      target: {
        lawId: sampleLawViewerDocument.law.lawId,
        article: "1",
        revisionId: sampleLawViewerDocument.revision.revisionId,
        // 現在の第一条の指紋とは一致しない値。drift として検知される。
        fingerprint: "deadbeefdeadbeef",
      },
      title: "第一条",
      tags: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    };
    const { repository: storageRepository } = createMemoryStorageRepository({
      bookmarks: [anchoredBookmark],
    });
    // 見比べダイアログの作成時版取得を実 e-Gov ではなくスタブへ向ける。
    const compareRepository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (): Promise<LawDocument> =>
        Promise.resolve({
          law: sampleLawViewerDocument.law,
          revision: sampleLawViewerDocument.revision,
          nodes: sampleLawViewerDocument.nodes,
          raw: {},
        }),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;

    const { user } = renderLawViewerContentRoute(
      "/laws/129AC0000000089/articles/1",
      { status: "ready", ...sampleLawViewerDocument },
      storageRepository,
      compareRepository,
    );

    await user.click(await screen.findByRole("button", { name: "改正の可能性を確認する" }));
    await user.click(await screen.findByRole("button", { name: "新しい条文に付け替える" }));

    // 修復後、再マウントやナビゲーションなしにバッジが消える（refreshToken による再検証）。
    await waitFor(() => {
      expect(screen.queryByText("改正の可能性")).not.toBeInTheDocument();
    });
  });

  it("アンカーの指紋が一致するとき改正の可能性バッジを表示しない", async () => {
    const currentArticle = sampleLawViewerDocument.nodes.find(
      (node) => node.type === "Article" && node.number === "1",
    );
    const fingerprint = await computeArticleFingerprint(currentArticle?.plainText ?? "");
    const anchoredBookmark: Bookmark = {
      id: "bookmark-match",
      target: {
        lawId: sampleLawViewerDocument.law.lawId,
        article: "1",
        revisionId: sampleLawViewerDocument.revision.revisionId,
        fingerprint,
      },
      title: "第一条",
      tags: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    };
    const { repository: storageRepository } = createMemoryStorageRepository({
      bookmarks: [anchoredBookmark],
    });

    renderLawViewerContentRoute(
      "/laws/129AC0000000089/articles/1",
      { status: "ready", ...sampleLawViewerDocument },
      storageRepository,
    );

    // 本文が描画されるまで待ってから、バッジが無いことを検証する。
    expect(await screen.findByRole("article", { name: "第一条" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("改正の可能性")).not.toBeInTheDocument();
    });
  });

  it("opens the study card dialog from the active article actions", async () => {
    const user = userEvent.setup();
    renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    const createButton = await screen.findByRole("button", { name: "カードを作る" });
    await user.click(createButton);

    expect(await screen.findByRole("heading", { name: "学習カードを作る" })).toBeInTheDocument();
  });
});

const withClipboard = async (
  writeText: ((text: string) => Promise<void>) | undefined,
  callback: () => Promise<void>,
) => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  });

  try {
    await callback();
  } finally {
    if (originalDescriptor === undefined) {
      Reflect.deleteProperty(navigator, "clipboard");
    } else {
      Object.defineProperty(navigator, "clipboard", originalDescriptor);
    }
  }
};
