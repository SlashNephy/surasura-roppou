import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PwaUpdatePrompt } from "./PwaUpdatePrompt";
import type { PwaUpdateController, PwaUpdateState } from "@/core/pwa";

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

  it("shows registration errors from the service worker controller", () => {
    const controller = createStaticController({
      needRefresh: false,
      offlineReady: false,
      error: "network offline",
      update: vi.fn(),
    });

    render(<PwaUpdatePrompt controller={controller} />);

    expect(screen.getByRole("status")).toHaveTextContent("オフライン起動の準備に失敗しました");
    expect(screen.getByText("network offline")).toBeInTheDocument();
  });

  it("keeps a dismissed prompt hidden when the controller republishes the same state", async () => {
    const mutableController = createMutableController({
      needRefresh: false,
      offlineReady: true,
      error: undefined,
    });

    render(<PwaUpdatePrompt controller={mutableController.controller} />);

    expect(screen.getByRole("status")).toHaveTextContent("オフラインで起動できます");

    await userEvent.click(screen.getByRole("button", { name: "閉じる" }));
    act(() => {
      mutableController.publish({ needRefresh: false, offlineReady: true, error: undefined });
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      mutableController.publish({ needRefresh: true, offlineReady: true, error: undefined });
    });

    expect(screen.getByRole("status")).toHaveTextContent("新しいバージョンがあります");
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

const createMutableController = (initialState: PwaUpdateState) => {
  const listeners = new Set<(state: PwaUpdateState) => void>();
  const update = vi.fn().mockResolvedValue(undefined);

  return {
    controller: {
      subscribe(listener) {
        listeners.add(listener);
        listener(initialState);

        return () => {
          listeners.delete(listener);
        };
      },
      update,
    } satisfies PwaUpdateController,
    publish(nextState: PwaUpdateState) {
      for (const listener of [...listeners]) {
        listener(nextState);
      }
    },
  };
};
