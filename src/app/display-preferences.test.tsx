import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DISPLAY_PREFERENCES_STORAGE_KEYS } from "@/core/settings";

import { DisplayPreferencesProvider } from "./display-preferences";
import { useDisplayPreferences } from "./use-display-preferences";

const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
let prefersDark = false;

const matchMedia = (query: string): MediaQueryList =>
  ({
    media: query,
    get matches() {
      return query === "(prefers-color-scheme: dark)" && prefersDark;
    },
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaListeners.delete(listener);
    },
    addListener: (listener: ((event: MediaQueryListEvent) => void) | null) => {
      if (listener !== null) {
        mediaListeners.add(listener);
      }
    },
    removeListener: (listener: ((event: MediaQueryListEvent) => void) | null) => {
      if (listener !== null) {
        mediaListeners.delete(listener);
      }
    },
    dispatchEvent: () => true,
  }) as MediaQueryList;

const setPrefersDark = (matches: boolean): void => {
  prefersDark = matches;
  const event = {
    matches,
    media: "(prefers-color-scheme: dark)",
  } as MediaQueryListEvent;

  for (const listener of mediaListeners) {
    listener(event);
  }
};

const Probe = () => {
  const preferences = useDisplayPreferences();

  return (
    <>
      <output>{`${preferences.fontSize}/${preferences.lineSpacing}/${preferences.theme}`}</output>
      <button
        onClick={() => {
          preferences.setFontSize("extra-large");
        }}
        type="button"
      >
        文字を大きくする
      </button>
      <button
        onClick={() => {
          preferences.setLineSpacing("wide");
        }}
        type="button"
      >
        行間を広くする
      </button>
      <button
        onClick={() => {
          preferences.setTheme("light");
        }}
        type="button"
      >
        ライトへ固定する
      </button>
      <button
        onClick={() => {
          preferences.setTheme("system");
        }}
        type="button"
      >
        システムへ戻す
      </button>
      <button
        onClick={() => {
          preferences.setTheme("dark");
        }}
        type="button"
      >
        ダークへ固定する
      </button>
    </>
  );
};

const renderProvider = () =>
  render(
    <DisplayPreferencesProvider>
      <Probe />
    </DisplayPreferencesProvider>,
  );

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: matchMedia,
  });
  prefersDark = false;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  mediaListeners.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
  document.documentElement.removeAttribute("data-font-size");
  document.documentElement.removeAttribute("data-line-spacing");
});

describe("DisplayPreferencesProvider", () => {
  it("保存済みの文字サイズと行間を hook と html 属性へ反映する", () => {
    localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize, "large");
    localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing, "relaxed");

    renderProvider();

    expect(screen.getByText("large/relaxed/system")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-font-size", "large");
    expect(document.documentElement).toHaveAttribute("data-line-spacing", "relaxed");
  });

  it("hook の setter で文字サイズと行間を保存し、出力と html 属性を更新する", () => {
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "文字を大きくする" }));
    fireEvent.click(screen.getByRole("button", { name: "行間を広くする" }));

    expect(screen.getByText("extra-large/wide/system")).toBeInTheDocument();
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize)).toBe("extra-large");
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing)).toBe("wide");
    expect(document.documentElement).toHaveAttribute("data-font-size", "extra-large");
    expect(document.documentElement).toHaveAttribute("data-line-spacing", "wide");
  });

  it("未設定のシステムテーマは OS のダーク・ライト変更へ追従する", async () => {
    renderProvider();

    expect(screen.getByText("standard/standard/system")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"));
    expect(document.documentElement.style.colorScheme).toBe("light");

    act(() => {
      setPrefersDark(true);
    });
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(document.documentElement.style.colorScheme).toBe("dark");

    act(() => {
      setPrefersDark(false);
    });
    await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"));
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("ライト固定中は OS 変更へ追従せず、システムへ戻すと現在の OS テーマへ復帰する", async () => {
    renderProvider();

    act(() => {
      setPrefersDark(true);
    });
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));

    fireEvent.click(screen.getByRole("button", { name: "ライトへ固定する" }));
    await waitFor(() => expect(screen.getByText("standard/standard/light")).toBeInTheDocument());
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe("light");

    act(() => {
      setPrefersDark(false);
      setPrefersDark(true);
    });
    expect(document.documentElement).not.toHaveClass("dark");

    fireEvent.click(screen.getByRole("button", { name: "システムへ戻す" }));
    await waitFor(() => expect(screen.getByText("standard/standard/system")).toBeInTheDocument());
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe("system");
  });

  it("ダークへ固定して保存する", async () => {
    renderProvider();

    fireEvent.click(screen.getByRole("button", { name: "ダークへ固定する" }));

    await waitFor(() => expect(screen.getByText("standard/standard/dark")).toBeInTheDocument());
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe("dark");
  });

  it("Provider 単体でも不正な保存テーマをシステムへ補正する", async () => {
    localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, "sepia");
    prefersDark = true;

    renderProvider();

    expect(screen.getByText("standard/standard/system")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe("system");
  });

  it.each([
    { blockSetItem: false, expectedStoredTheme: "system" },
    { blockSetItem: true, expectedStoredTheme: "dark light" },
  ] as const)(
    "起動時の不正テーマを storage 修正できなくても安全な初期テーマだけを適用する ($blockSetItem)",
    async ({ blockSetItem, expectedStoredTheme }) => {
      localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, "dark light");
      prefersDark = true;
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new DOMException("blocked", "SecurityError");
      });
      if (blockSetItem) {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
          throw new DOMException("blocked", "SecurityError");
        });
      }
      const pageError = vi.fn();
      window.addEventListener("error", pageError);

      try {
        expect(() => {
          renderProvider();
        }).not.toThrow();

        await waitFor(() => {
          expect(screen.getByText("standard/standard/system")).toBeInTheDocument();
          expect(document.documentElement.className).toBe("dark");
          expect(document.documentElement.style.colorScheme).toBe("dark");
          expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe(
            expectedStoredTheme,
          );
        });
        expect(pageError).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener("error", pageError);
      }
    },
  );

  it.each([
    { storedTheme: "dark", expectedClass: "dark" },
    { storedTheme: "light", expectedClass: "light" },
    { storedTheme: "system", expectedClass: "dark" },
  ] as const)(
    "正常な保存テーマ $storedTheme を初期表示し、同じ保存値を維持する",
    async ({ expectedClass, storedTheme }) => {
      localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, storedTheme);
      prefersDark = true;

      renderProvider();

      await waitFor(() => {
        expect(screen.getByText(`standard/standard/${storedTheme}`)).toBeInTheDocument();
        expect(document.documentElement.className).toBe(expectedClass);
        expect(document.documentElement.style.colorScheme).toBe(expectedClass);
        expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe(storedTheme);
      });
    },
  );

  it("実行中に不正なテーマを受信するとシステムへ戻して DOM と保存値を揃える", async () => {
    localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, "light");
    prefersDark = true;
    renderProvider();

    await waitFor(() => expect(screen.getByText("standard/standard/light")).toBeInTheDocument());
    expect(document.documentElement).not.toHaveClass("dark");

    act(() => {
      localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, "sepia");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: DISPLAY_PREFERENCES_STORAGE_KEYS.theme,
          newValue: "sepia",
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("standard/standard/system")).toBeInTheDocument();
      expect(document.documentElement).toHaveClass("dark");
      expect(document.documentElement).not.toHaveClass("sepia");
      expect(document.documentElement.style.colorScheme).toBe("dark");
      expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe("system");
    });
  });

  it.each(["sepia", "dark light", ""])(
    "不正な theme storage event %j を DOM 適用前に遮断する",
    async (invalidTheme) => {
      localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, "light");
      prefersDark = true;
      renderProvider();

      await waitFor(() => expect(screen.getByText("standard/standard/light")).toBeInTheDocument());
      const propagatedStorageEvent = vi.fn();
      const pageError = vi.fn();
      window.addEventListener("storage", propagatedStorageEvent);
      window.addEventListener("error", pageError);

      try {
        act(() => {
          localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, invalidTheme);
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: DISPLAY_PREFERENCES_STORAGE_KEYS.theme,
              newValue: invalidTheme,
            }),
          );
        });

        await waitFor(() => {
          expect(screen.getByText("standard/standard/system")).toBeInTheDocument();
          expect(document.documentElement.className).toBe("dark");
          expect(document.documentElement.style.colorScheme).toBe("dark");
          expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe("system");
        });
        expect(propagatedStorageEvent).not.toHaveBeenCalled();
        expect(pageError).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener("storage", propagatedStorageEvent);
        window.removeEventListener("error", pageError);
      }
    },
  );

  it("Provider の unmount 後は theme storage event を遮断しない", () => {
    const { unmount } = renderProvider();
    unmount();
    const propagatedStorageEvent = vi.fn();
    window.addEventListener("storage", propagatedStorageEvent);

    try {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: DISPLAY_PREFERENCES_STORAGE_KEYS.theme,
          newValue: "dark light",
        }),
      );

      expect(propagatedStorageEvent).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("storage", propagatedStorageEvent);
    }
  });

  it.each([
    { newValue: "dark", expectedTheme: "dark", expectedClass: "dark" },
    { newValue: "light", expectedTheme: "light", expectedClass: "light" },
    { newValue: "system", expectedTheme: "system", expectedClass: "dark" },
    { newValue: null, expectedTheme: "system", expectedClass: "dark" },
  ] as const)(
    "正常な theme storage event $newValue は next-themes へ渡す",
    async ({ expectedClass, expectedTheme, newValue }) => {
      localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, "light");
      prefersDark = true;
      renderProvider();

      await waitFor(() => expect(screen.getByText("standard/standard/light")).toBeInTheDocument());
      const propagatedStorageEvent = vi.fn();
      window.addEventListener("storage", propagatedStorageEvent);

      try {
        act(() => {
          if (newValue === null) {
            localStorage.removeItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme);
          } else {
            localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, newValue);
          }
          window.dispatchEvent(
            new StorageEvent("storage", {
              key: DISPLAY_PREFERENCES_STORAGE_KEYS.theme,
              newValue,
            }),
          );
        });

        await waitFor(() => {
          expect(screen.getByText(`standard/standard/${expectedTheme}`)).toBeInTheDocument();
          expect(document.documentElement.className).toBe(expectedClass);
          expect(document.documentElement.style.colorScheme).toBe(expectedClass);
          expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe(expectedTheme);
        });
        expect(propagatedStorageEvent).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener("storage", propagatedStorageEvent);
      }
    },
  );

  it.each([
    { failingOperation: "removeItem", expectedStoredTheme: "system" },
    { failingOperation: "setItem", expectedStoredTheme: null },
  ] as const)(
    "localStorage.$failingOperation が拒否されても不正テーマを DOM に残さない",
    async ({ expectedStoredTheme, failingOperation }) => {
      localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, "sepia");
      prefersDark = true;
      vi.spyOn(Storage.prototype, failingOperation).mockImplementation(() => {
        throw new DOMException("blocked", "SecurityError");
      });

      renderProvider();

      await waitFor(() => {
        expect(screen.getByText("standard/standard/system")).toBeInTheDocument();
        expect(document.documentElement).toHaveClass("dark");
        expect(document.documentElement).not.toHaveClass("sepia");
        expect(document.documentElement.style.colorScheme).toBe("dark");
        expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe(
          expectedStoredTheme,
        );
      });
    },
  );
});
