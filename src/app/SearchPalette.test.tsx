import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

const renderShell = async (initialEntry = "/laws") => {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const storageRepository = createMemoryStorageRepository().repository;

  render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);
  await screen.findByRole("banner");

  return { history };
};

describe("SearchPalette", () => {
  it("opens the palette from the header trigger and navigates to a destination", async () => {
    const user = userEvent.setup();
    const { history } = await renderShell();

    await user.click(screen.getByRole("button", { name: "検索" }));

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

  it("shows a placeholder message for unresolved reference queries", async () => {
    const user = userEvent.setup();
    await renderShell();

    await user.keyboard("/");
    await user.type(screen.getByPlaceholderText("国賠法1条、民709、行政手続法14条…"), "国賠1");

    expect(
      await screen.findByText("条文参照ジャンプ（国賠1、民709 など）は今後対応予定です。"),
    ).toBeInTheDocument();
  });
});
