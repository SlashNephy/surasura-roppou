import { afterEach, describe, expect, it, vi } from "vitest";

import { createPwaUpdateController } from "./update-controller";
import type { RegisterServiceWorker } from "./update-controller";

describe("createPwaUpdateController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes offline-ready and refresh-needed states from service worker callbacks", () => {
    const register = vi.fn<RegisterServiceWorker>(() => vi.fn());
    const controller = createPwaUpdateController(register);
    const listener = vi.fn();

    const unsubscribe = controller.subscribe(listener);

    expect(listener).toHaveBeenLastCalledWith({
      error: undefined,
      needRefresh: false,
      offlineReady: false,
    });

    register.mock.calls[0]?.[0].onOfflineReady?.();
    expect(listener).toHaveBeenLastCalledWith({
      error: undefined,
      needRefresh: false,
      offlineReady: true,
    });

    register.mock.calls[0]?.[0].onNeedRefresh?.();
    expect(listener).toHaveBeenLastCalledWith({
      error: undefined,
      needRefresh: true,
      offlineReady: true,
    });

    unsubscribe();
    const callCountBeforeCallback = listener.mock.calls.length;
    register.mock.calls[0]?.[0].onNeedRefresh?.();

    expect(listener).toHaveBeenCalledTimes(callCountBeforeCallback);
  });

  it.each([
    { error: new Error("boom"), expected: "boom", name: "Error" },
    { error: "network offline", expected: "network offline", name: "string" },
    { error: 503, expected: "503", name: "number" },
    { error: { reason: "offline" }, expected: "[object Object]", name: "plain object" },
  ])("publishes $name registration errors while listeners are active", ({ error, expected }) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const register = vi.fn<RegisterServiceWorker>(() => vi.fn());
    const controller = createPwaUpdateController(register);
    const listener = vi.fn();

    controller.subscribe(listener);
    register.mock.calls[0]?.[0].onRegisterError?.(error);

    expect(listener).toHaveBeenLastCalledWith({
      error: expected,
      needRefresh: false,
      offlineReady: false,
    });
    expect(consoleError).toHaveBeenCalledWith("PWA registration failed:", error);

    consoleError.mockRestore();
  });

  it("clears a registration error when service worker callbacks later succeed", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const register = vi.fn<RegisterServiceWorker>(() => vi.fn());
    const controller = createPwaUpdateController(register);
    const listener = vi.fn();

    controller.subscribe(listener);
    register.mock.calls[0]?.[0].onRegisterError?.("network offline");
    register.mock.calls[0]?.[0].onOfflineReady?.();

    expect(listener).toHaveBeenLastCalledWith({
      error: undefined,
      needRefresh: false,
      offlineReady: true,
    });
  });

  it("requests a page reload when applying an available update", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const controller = createPwaUpdateController(vi.fn<RegisterServiceWorker>(() => update));

    await controller.update();

    expect(update).toHaveBeenCalledWith(true);
  });
});
