import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createEgovLawRepository } from "@/core/egov";
import { createJsonFetchStub, fixedTestNow as now, lawDataFixture } from "@/test/fixtures/egov";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { createAppRouter } from "./router";

const primaryNavRoutes = ["法令", "撮る", "復習", "設定"] as const;

describe("AppShell", () => {
  setupScrollMocks();

  it("renders header and mobile navigation links for main routes", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      for (const label of primaryNavRoutes) {
        expect(screen.getAllByRole("link", { name: label })).toHaveLength(2);
      }
    });
  });

  it("renders header banner and main content without side panels", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByRole("main", { name: "メインコンテンツ" })).toBeInTheDocument();
      expect(
        screen.queryByRole("complementary", { name: "ナビゲーションパネル" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("complementary", { name: "学習パネル" })).not.toBeInTheDocument();
    });
  });

  it("separates active and inactive navigation color classes", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      const activeLinks = screen.getAllByRole("link", { name: "法令" });
      const inactiveLinks = screen.getAllByRole("link", { name: "設定" });

      for (const link of activeLinks) {
        expect(link).toHaveClass("bg-accent");
        expect(link).toHaveClass("text-accent-foreground");
        expect(link).not.toHaveClass("text-muted-foreground");
      }

      for (const link of inactiveLinks) {
        expect(link).toHaveClass("text-muted-foreground");
        expect(link).not.toHaveClass("bg-accent");
      }
    });
  });

  it("returns to the article that was open when the law tab was left", async () => {
    const user = userEvent.setup();
    const articlePath = "/laws/129AC0000000089/articles/1";
    const history = createMemoryHistory({ initialEntries: [articlePath] });
    const { fetcher } = createJsonFetchStub(lawDataFixture);
    const lawRepository = createEgovLawRepository({ fetcher, now });
    const storageRepository = createMemoryStorageRepository().repository;
    const router = createAppRouter({ history, lawRepository, storageRepository });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "民法" })).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole("link", { name: "撮る" })[0]);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/scanner");
    });

    await user.click(screen.getAllByRole("link", { name: "法令" })[0]);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(articlePath);
    });
  });

  it("keeps the law tab pointing at its root before any law has been opened", async () => {
    const history = createMemoryHistory({ initialEntries: ["/scanner"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      for (const link of screen.getAllByRole("link", { name: "法令" })) {
        expect(link).toHaveAttribute("href", "/laws");
      }
    });
  });

  it("renders the site footer with the e-Gov source attribution on every route", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
      const sourceLink = screen.getByRole("link", { name: /e-Gov 法令検索/ });
      expect(sourceLink).toHaveAttribute("href", "https://laws.e-gov.go.jp");
      expect(
        screen.getByText(
          "本アプリは学習を目的としたもので、法的助言を提供するものではありません。",
        ),
      ).toBeInTheDocument();
    });
  });
});
