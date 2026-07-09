import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMemoryStorageRepository } from "@/test/fixtures/storage";

import { createAppRouter } from "./router";

const primaryNavRoutes = ["法令", "撮る", "復習", "設定"] as const;
const scrollTo = window.scrollTo;

describe("AppShell", () => {
  beforeAll(() => {
    window.scrollTo = () => undefined;
  });

  afterAll(() => {
    window.scrollTo = scrollTo;
  });

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

  it("renders the site footer with the e-Gov source attribution on every route", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      expect(screen.getByRole("contentinfo")).toBeInTheDocument();
      const sourceLink = screen.getByRole("link", { name: /e-Gov 法令検索/ });
      expect(sourceLink).toHaveAttribute("href", "https://laws.e-gov.go.jp");
      expect(
        screen.getByText("本アプリは学習補助であり、法的助言を提供するものではありません"),
      ).toBeInTheDocument();
    });
  });
});
