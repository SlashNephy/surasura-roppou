import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DISPLAY_PREFERENCES,
  getDisplayPreferences,
  sanitizeStoredDisplayTheme,
  setDisplayFontSize,
  setDisplayLineSpacing,
  setDisplayTheme,
  subscribeDisplayPreferences,
} from "./display-preferences";

const storageKeys = {
  fontSize: "surasura:display:font-size",
  lineSpacing: "surasura:display:line-spacing",
  theme: "surasura:display:theme",
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("getDisplayPreferences", () => {
  it("保存値がないときは既定値を返す", () => {
    expect(getDisplayPreferences()).toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  it.each([
    { fontSize: "standard", lineSpacing: "standard", theme: "system" },
    { fontSize: "large", lineSpacing: "relaxed", theme: "light" },
    { fontSize: "extra-large", lineSpacing: "wide", theme: "dark" },
  ] as const)(
    "$fontSize / $lineSpacing / $theme を保存して復元する",
    ({ fontSize, lineSpacing, theme }) => {
      setDisplayFontSize(fontSize);
      setDisplayLineSpacing(lineSpacing);
      setDisplayTheme(theme);

      expect(getDisplayPreferences()).toEqual({ fontSize, lineSpacing, theme });
    },
  );

  it.each([
    {
      key: storageKeys.fontSize,
      invalidValue: "huge",
      expected: { fontSize: "standard", lineSpacing: "relaxed", theme: "dark" },
    },
    {
      key: storageKeys.lineSpacing,
      invalidValue: "narrow",
      expected: { fontSize: "large", lineSpacing: "standard", theme: "dark" },
    },
    {
      key: storageKeys.theme,
      invalidValue: "sepia",
      expected: { fontSize: "large", lineSpacing: "relaxed", theme: "system" },
    },
  ] as const)("$key の不正値だけを既定値へ戻す", ({ key, invalidValue, expected }) => {
    localStorage.setItem(storageKeys.fontSize, "large");
    localStorage.setItem(storageKeys.lineSpacing, "relaxed");
    localStorage.setItem(storageKeys.theme, "dark");
    localStorage.setItem(key, invalidValue);

    expect(getDisplayPreferences()).toEqual(expected);
  });

  it("window と localStorage がない環境では既定値を返す", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("localStorage", undefined);

    expect(getDisplayPreferences()).toEqual(DEFAULT_DISPLAY_PREFERENCES);
    expect(() => {
      setDisplayFontSize("large");
      setDisplayLineSpacing("relaxed");
      setDisplayTheme("dark");
      sanitizeStoredDisplayTheme();
      subscribeDisplayPreferences(() => undefined)();
    }).not.toThrow();
  });
});

describe("display preference subscriptions", () => {
  it("setter の保存直後に同一タブの購読者へ通知する", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDisplayPreferences(listener);

    setDisplayFontSize("large");
    setDisplayLineSpacing("relaxed");
    setDisplayTheme("dark");

    expect(localStorage.getItem(storageKeys.fontSize)).toBe("large");
    expect(localStorage.getItem(storageKeys.lineSpacing)).toBe("relaxed");
    expect(localStorage.getItem(storageKeys.theme)).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it("各表示設定の storage イベントを購読者へ通知する", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDisplayPreferences(listener);

    for (const key of Object.values(storageKeys)) {
      window.dispatchEvent(new StorageEvent("storage", { key }));
    }
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));

    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it("unsubscribe 後は setter と storage イベントのどちらでも通知しない", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDisplayPreferences(listener);
    unsubscribe();

    setDisplayFontSize("large");
    window.dispatchEvent(new StorageEvent("storage", { key: storageKeys.fontSize }));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("sanitizeStoredDisplayTheme", () => {
  it.each([null, "system", "light", "dark"] as const)("%s は削除せず維持する", (storedTheme) => {
    if (storedTheme !== null) {
      localStorage.setItem(storageKeys.theme, storedTheme);
    }

    sanitizeStoredDisplayTheme();

    expect(localStorage.getItem(storageKeys.theme)).toBe(storedTheme);
  });

  it("不正なテーマ値だけを削除する", () => {
    localStorage.setItem(storageKeys.fontSize, "large");
    localStorage.setItem(storageKeys.lineSpacing, "relaxed");
    localStorage.setItem(storageKeys.theme, "sepia");

    sanitizeStoredDisplayTheme();

    expect(localStorage.getItem(storageKeys.fontSize)).toBe("large");
    expect(localStorage.getItem(storageKeys.lineSpacing)).toBe("relaxed");
    expect(localStorage.getItem(storageKeys.theme)).toBeNull();
  });
});
