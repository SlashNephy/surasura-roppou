import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PwaUpdatePrompt } from "./PwaUpdatePrompt";
import type { PwaUpdateController } from "@/core/pwa";

describe("PwaUpdatePrompt", () => {
  it("stays hidden until the app shell is cached or an update is ready", () => {
    const controller = createStaticController({
      needRefresh: false,
      offlineReady: false,
      error: undefined,
      update: vi.fn(),
    });

    render(<PwaUpdatePrompt controller={controller} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers a reload action when a service worker update is ready", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const controller = createStaticController({
      needRefresh: true,
      offlineReady: false,
      error: undefined,
      update,
    });

    render(<PwaUpdatePrompt controller={controller} />);

    expect(screen.getByRole("status")).toHaveTextContent("新しいバージョンがあります");

    await userEvent.click(screen.getByRole("button", { name: "更新" }));

    expect(update).toHaveBeenCalledTimes(1);
  });

  it("shows when the app shell is ready for offline use and can be dismissed", async () => {
    const controller = createStaticController({
      needRefresh: false,
      offlineReady: true,
      error: undefined,
      update: vi.fn(),
    });

    render(<PwaUpdatePrompt controller={controller} />);

    expect(screen.getByRole("status")).toHaveTextContent("オフラインで起動できます");

    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

const createStaticController = (
  state: Parameters<PwaUpdateController["subscribe"]>[0] extends (value: infer T) => void
    ? T & { update: () => Promise<void> }
    : never,
): PwaUpdateController => ({
  subscribe(listener) {
    listener({
      error: state.error,
      needRefresh: state.needRefresh,
      offlineReady: state.offlineReady,
    });
    return () => undefined;
  },
  update: state.update,
});
