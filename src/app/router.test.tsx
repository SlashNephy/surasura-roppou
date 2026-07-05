import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { setupScrollMocks } from "@/test/scrollMocks";

import { createAppRouter } from "./router";

setupScrollMocks();

const routes = [
  ["/", "今日の条文へ進む"],
  ["/laws", "法令を探す"],
  ["/laws/129AC0000000089", "民法"],
  ["/laws/129AC0000000089/articles/1", "民法"],
  ["/jump", "条文参照を開く"],
  ["/scanner", "条文参照を撮る"],
  ["/study", "復習を始める"],
  ["/settings", "設定を調整する"],
] as const;

describe("app router", () => {
  it.each(routes)("renders %s", async (path, heading) => {
    const history = createMemoryHistory({ initialEntries: [path] });

    render(<RouterProvider router={createAppRouter({ history })} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  });

  it("uses theme-aware text classes on route placeholder content", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });

    render(<RouterProvider router={createAppRouter({ history })} />);

    await waitFor(() => {
      expect(screen.getByText("Laws")).toHaveClass("text-primary");
      expect(screen.getByRole("heading", { name: "法令を探す" })).toHaveClass("text-foreground");
      expect(
        screen.getByText("法令名、略称、法令番号から目的の法令へ進むための入口です。"),
      ).toHaveClass("text-muted-foreground");
    });
  });
});
