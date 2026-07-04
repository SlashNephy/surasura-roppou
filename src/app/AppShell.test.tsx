import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAppRouter } from "./router";

const primaryNavRoutes = ["法令", "ジャンプ", "撮る", "復習", "設定"] as const;
const scrollTo = window.scrollTo;

describe("AppShell", () => {
  beforeAll(() => {
    window.scrollTo = () => undefined;
  });

  afterAll(() => {
    window.scrollTo = scrollTo;
  });

  it("renders desktop and mobile navigation links for main routes", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });

    render(<RouterProvider router={createAppRouter({ history })} />);

    await waitFor(() => {
      for (const label of primaryNavRoutes) {
        expect(screen.getAllByRole("link", { name: label })).toHaveLength(2);
      }
    });
  });

  it("renders desktop navigation, main, and study panes", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });

    render(<RouterProvider router={createAppRouter({ history })} />);

    await waitFor(() => {
      expect(
        screen.getByRole("complementary", { name: "ナビゲーションパネル" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("main", { name: "メインコンテンツ" })).toBeInTheDocument();
      expect(screen.getByRole("complementary", { name: "学習パネル" })).toBeInTheDocument();
    });
  });
});
