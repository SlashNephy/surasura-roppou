import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createAppRouter } from "./router";

const scrollToDescriptor = Object.getOwnPropertyDescriptor(window, "scrollTo");
const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);

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
  beforeAll(() => {
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
  });

  afterAll(() => {
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
