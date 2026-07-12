import { afterEach, describe, expect, it, vi } from "vitest";

import { getOcrModelConsent, setOcrModelConsent } from "./ocr-consent";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ocr model consent", () => {
  it("初期状態は未同意", () => {
    expect(getOcrModelConsent()).toBe(false);
  });

  it("同意を保存すると true を返す", () => {
    setOcrModelConsent(true);
    expect(getOcrModelConsent()).toBe(true);
  });

  it("同意を取り消すと false を返す", () => {
    setOcrModelConsent(true);
    setOcrModelConsent(false);
    expect(getOcrModelConsent()).toBe(false);
  });
});

describe("ocr model consent（ストレージブロック）", () => {
  it("getItem が例外を投げる環境では false を返す", () => {
    // プライベートブラウジング等でストレージアクセスが blocked されるケースをシミュレート。
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getOcrModelConsent()).toBe(false);
  });

  it("setItem が例外を投げる環境でも例外を外に出さない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    // 例外がスローされないことを確認する。
    expect(() => {
      setOcrModelConsent(true);
    }).not.toThrow();
  });
});
