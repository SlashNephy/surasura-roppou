import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createEgovLawRepository } from "@/core/egov";
import { createJsonFetchStub, fixedTestNow as now, lawDataFixture } from "@/test/fixtures/egov";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { createAppRouter } from "./router";

const articlePath = "/laws/129AC0000000089/articles/1";

const renderAppAt = (path: string) => {
  const history = createMemoryHistory({ initialEntries: [path] });
  const { fetcher } = createJsonFetchStub(lawDataFixture);
  const lawRepository = createEgovLawRepository({ fetcher, now });
  const storageRepository = createMemoryStorageRepository().repository;
  const router = createAppRouter({ history, lawRepository, storageRepository });

  render(<RouterProvider router={router} />);

  return router;
};

// jsdom は実際にスクロールしないため、読み進めた状態を scrollY の差し替えと
// scroll イベントで再現する。ルーターはこのイベントで復元対象を捕捉する。
const scrollWindowTo = (scrollY: number) => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY, writable: true });
  document.dispatchEvent(new Event("scroll"));
};

describe("scroll restoration across tab switches", () => {
  const scrollMocks = setupScrollMocks();

  it("restores the reading position when returning to the law tab", async () => {
    const user = userEvent.setup();
    const router = renderAppAt(articlePath);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "民法" })).toBeInTheDocument();
    });

    scrollWindowTo(1200);

    await user.click(screen.getAllByRole("link", { name: "撮る" })[0]);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/scanner");
    });

    scrollWindowTo(0);
    scrollMocks.scrollTo.mockClear();

    await user.click(screen.getAllByRole("link", { name: "法令" })[0]);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "民法" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(scrollMocks.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1200 }));
    });
  });

  it("does not jump back to the article top when a position was restored", async () => {
    const user = userEvent.setup();
    const router = renderAppAt(articlePath);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "民法" })).toBeInTheDocument();
    });

    scrollWindowTo(1200);

    await user.click(screen.getAllByRole("link", { name: "設定" })[0]);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/settings");
    });

    scrollMocks.scrollIntoView.mockClear();

    await user.click(screen.getAllByRole("link", { name: "法令" })[0]);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "民法" })).toBeInTheDocument();
    });

    expect(scrollMocks.scrollIntoView).not.toHaveBeenCalled();
  });

  it("still scrolls to the article when there is no position to restore", async () => {
    renderAppAt("/laws/132AC0000000048/articles/1");

    await waitFor(() => {
      expect(scrollMocks.scrollIntoView).toHaveBeenCalled();
    });
  });
});
