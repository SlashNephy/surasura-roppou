import { afterEach, describe, expect, it, vi } from "vitest";

import { estimateStorageUsage, isStoragePersisted, requestStoragePersistence } from "./persistence";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storage persistence", () => {
  it("reports not persisted when the API is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    await expect(isStoragePersisted()).resolves.toBe(false);
  });

  it("reports not persisted when the API throws", async () => {
    // 保護の状態が読めないことで閲覧を止めない。
    vi.stubGlobal("navigator", {
      storage: { persisted: () => Promise.reject(new Error("denied")) },
    });

    await expect(isStoragePersisted()).resolves.toBe(false);
  });

  it("returns the grant result of the request", async () => {
    vi.stubGlobal("navigator", { storage: { persist: () => Promise.resolve(true) } });

    await expect(requestStoragePersistence()).resolves.toBe(true);
  });

  it("returns undefined when usage cannot be estimated", async () => {
    vi.stubGlobal("navigator", {});

    await expect(estimateStorageUsage()).resolves.toBeUndefined();
  });
});
