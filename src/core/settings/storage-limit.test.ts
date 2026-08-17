import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STORAGE_LIMIT_MEGABYTES,
  getStorageLimitMegabytes,
  megabytesToBytes,
  setStorageLimitMegabytes,
  STORAGE_LIMIT_STORAGE_KEY,
  subscribeStorageLimit,
} from "./storage-limit";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("storage limit", () => {
  it("falls back to the default when nothing is stored", () => {
    expect(getStorageLimitMegabytes()).toBe(DEFAULT_STORAGE_LIMIT_MEGABYTES);
  });

  it("falls back to the default when the stored value is not a selectable limit", () => {
    // 手で書き換えられた localStorage や、将来選択肢を削ったときに壊れないようにする。
    window.localStorage.setItem(STORAGE_LIMIT_STORAGE_KEY, "7");

    expect(getStorageLimitMegabytes()).toBe(DEFAULT_STORAGE_LIMIT_MEGABYTES);
  });

  it("stores the selected limit and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStorageLimit(listener);

    setStorageLimitMegabytes(100);

    expect(getStorageLimitMegabytes()).toBe(100);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    setStorageLimitMegabytes(500);

    // 解除後は通知されない。
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("converts megabytes to binary bytes", () => {
    expect(megabytesToBytes(50)).toBe(52_428_800);
  });

  it("falls back to the default without throwing when localStorage access itself throws", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });

    try {
      expect(getStorageLimitMegabytes()).toBe(DEFAULT_STORAGE_LIMIT_MEGABYTES);
      expect(() => {
        setStorageLimitMegabytes(100);
        subscribeStorageLimit(() => undefined)();
      }).not.toThrow();
    } finally {
      if (originalDescriptor === undefined) {
        Reflect.deleteProperty(window, "localStorage");
      } else {
        Object.defineProperty(window, "localStorage", originalDescriptor);
      }
    }
  });

  it("does not notify subscribers when the write fails", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStorageLimit(listener);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(() => {
      setStorageLimitMegabytes(100);
    }).not.toThrow();
    expect(getStorageLimitMegabytes()).toBe(DEFAULT_STORAGE_LIMIT_MEGABYTES);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("keeps one subscription notified after unsubscribing the other, even with the same callback reference", () => {
    const listener = vi.fn();
    const unsubscribeFirst = subscribeStorageLimit(listener);
    const unsubscribeSecond = subscribeStorageLimit(listener);

    unsubscribeFirst();
    setStorageLimitMegabytes(100);

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribeSecond();
  });
});
