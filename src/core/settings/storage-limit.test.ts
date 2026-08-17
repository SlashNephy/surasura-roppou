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
    setStorageLimitMegabytes(25);

    // 解除後は通知されない。
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("converts megabytes to binary bytes", () => {
    expect(megabytesToBytes(50)).toBe(52_428_800);
  });
});
