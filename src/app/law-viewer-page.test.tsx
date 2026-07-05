import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LawViewerPageContent } from "./law-viewer-page";
import type { LawViewerState } from "./law-viewer-page";
import { createAppRouter } from "./router";

type ScrollIntoView = (arg?: boolean | ScrollIntoViewOptions) => void;

const scrollToDescriptor = Object.getOwnPropertyDescriptor(window, "scrollTo");
const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);
let scrollIntoView: ReturnType<typeof vi.fn<ScrollIntoView>>;

const renderLawViewerRoute = (path: string) => {
  const history = createMemoryHistory({ initialEntries: [path] });

  render(<RouterProvider router={createAppRouter({ history })} />);

  return {
    history,
    user: userEvent.setup(),
  };
};

const renderLawViewerContentRoute = (path: string, state: LawViewerState) => {
  const BaseLawViewerRoute = () => {
    const { lawId } = useParams({ from: "/laws/$lawId" });

    return <LawViewerPageContent lawId={lawId} state={state} />;
  };
  const ArticleLawViewerRoute = () => {
    const { article, lawId } = useParams({ from: "/laws/$lawId/articles/$article" });

    return <LawViewerPageContent activeArticleNumber={article} lawId={lawId} state={state} />;
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
} satisfies LawViewerState;

describe("LawViewerPageContent", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    scrollIntoView = vi.fn<ScrollIntoView>();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
      writable: true,
    });
  });

  afterEach(() => {
    if (scrollToDescriptor === undefined) {
      Reflect.deleteProperty(window, "scrollTo");
    } else {
      Object.defineProperty(window, "scrollTo", scrollToDescriptor);
    }

    if (scrollIntoViewDescriptor === undefined) {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    } else {
      Object.defineProperty(Element.prototype, "scrollIntoView", scrollIntoViewDescriptor);
    }
  });

  it("renders a loading state from the page state contract", () => {
    render(<LawViewerPageContent state={{ status: "loading" }} />);

    expect(screen.getByLabelText("法令本文を読み込み中")).toBeInTheDocument();
  });

  it("renders an error state with a return link to law search", async () => {
    renderLawViewerRoute("/laws/not-found");

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

  it("renders the ready sample law as unsaved", async () => {
    renderLawViewerRoute("/laws/129AC0000000089");

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByText("未保存")).toBeInTheDocument();
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
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    });
  });

  it("navigates to the selected article from the table of contents", async () => {
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    await user.click(await screen.findByRole("button", { name: "第二条" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/2");
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
    expect(tocToggle).toHaveAttribute("aria-expanded", "false");
    expect(tocToggle).toHaveClass("lg:hidden");
    expect(tocToggle).not.toHaveClass("md:hidden");

    await user.click(tocToggle);

    expect(tocToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("navigation", { name: "法令目次" }).length).toBeGreaterThan(0);
  });

  it("keeps the article input text-friendly for branch article numbers", async () => {
    renderLawViewerRoute("/laws/129AC0000000089");

    const articleInput = await screen.findByLabelText("条番号");
    expect(articleInput).toHaveAttribute("name", "article");
    expect(articleInput).toHaveAttribute("autocomplete", "off");
    expect(articleInput).not.toHaveAttribute("inputmode", "numeric");
  });
});
