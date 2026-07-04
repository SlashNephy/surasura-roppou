import { RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAppRouter } from "./router";

const scrollTo = window.scrollTo;

const routes = [
  ["/", "今日の条文へ進む"],
  ["/laws", "法令を探す"],
  ["/jump", "条文参照を開く"],
  ["/scanner", "条文参照を撮る"],
  ["/study", "復習を始める"],
  ["/settings", "設定を調整する"],
] as const;

describe("app router", () => {
  beforeAll(() => {
    window.scrollTo = () => undefined;
  });

  afterAll(() => {
    window.scrollTo = scrollTo;
  });

  it.each(routes)("renders %s", async (path, heading) => {
    window.history.pushState({}, "", path);

    render(<RouterProvider router={createAppRouter()} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  });
});
