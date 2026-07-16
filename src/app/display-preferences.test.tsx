import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DISPLAY_PREFERENCES_STORAGE_KEYS } from "@/core/settings";

import { DisplayPreferencesProvider, useDisplayPreferences } from "./display-preferences";

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

  it("不正な保存テーマを起動前に削除してシステムとして扱う", async () => {
    localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme, "sepia");
    prefersDark = true;

    renderProvider();

    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBeNull();
    expect(screen.getByText("standard/standard/system")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
