import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DISPLAY_PREFERENCES_STORAGE_KEYS, getBaseDate, setBaseDate } from "@/core/settings";

import { DisplayPreferencesProvider } from "./display-preferences";
import { createAppRouter } from "./router";

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

beforeEach(() => {
  prefersDark = false;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
});

afterEach(() => {
  localStorage.clear();
  mediaListeners.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-font-size");
  document.documentElement.removeAttribute("data-line-spacing");
});

describe("SettingsPage 表示", () => {
  it("文字サイズと行間を選択して端末へ保存する", async () => {
    const { user } = renderSettingsRoute();

    await user.selectOptions(await screen.findByLabelText("文字サイズ"), "extra-large");
    await user.selectOptions(screen.getByLabelText("行間"), "wide");

    expect(screen.getByLabelText("文字サイズ")).toHaveValue("extra-large");
    expect(screen.getByLabelText("行間")).toHaveValue("wide");
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize)).toBe("extra-large");
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing)).toBe("wide");
    expect(document.documentElement).toHaveAttribute("data-font-size", "extra-large");
    expect(document.documentElement).toHaveAttribute("data-line-spacing", "wide");
  });

  it("テーマをダークへ固定して説明と画面へ反映する", async () => {
    const { user } = renderSettingsRoute();

    expect(await screen.findByText("端末の外観設定に合わせます。")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("テーマ"), "dark");

    expect(screen.getByText("端末の外観設定にかかわらずダークで表示します。")).toBeInTheDocument();
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe("dark");
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  });

  it("reload 相当の再マウント後に選択値を復元する", async () => {
    const firstRender = renderSettingsRoute();

    await firstRender.user.selectOptions(await screen.findByLabelText("文字サイズ"), "large");
    await firstRender.user.selectOptions(screen.getByLabelText("行間"), "relaxed");
    await firstRender.user.selectOptions(screen.getByLabelText("テーマ"), "light");

    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize)).toBe("large");
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing)).toBe("relaxed");
    expect(localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme)).toBe("light");

    firstRender.unmount();
    renderSettingsRoute();

    expect(await screen.findByLabelText("文字サイズ")).toHaveValue("large");
    expect(screen.getByLabelText("行間")).toHaveValue("relaxed");
    expect(screen.getByLabelText("テーマ")).toHaveValue("light");
  });

  it("native select をラベルで特定して Tab で到達できる", async () => {
    const { user } = renderSettingsRoute();

    const fontSize = await screen.findByRole("combobox", { name: "文字サイズ" });
    const lineSpacing = screen.getByRole("combobox", { name: "行間" });
    const theme = screen.getByRole("combobox", { name: "テーマ" });

    expect(fontSize).toHaveAccessibleName("文字サイズ");
    expect(lineSpacing).toHaveAccessibleName("行間");
    expect(theme).toHaveAccessibleName("テーマ");

    for (let tabCount = 0; tabCount < 20 && document.activeElement !== fontSize; tabCount += 1) {
      await user.tab();
    }
    expect(fontSize).toHaveFocus();
  });

  it("システム、ライト、ダークの選択に応じた説明を表示する", async () => {
    const { user } = renderSettingsRoute();
    const theme = await screen.findByRole("combobox", { name: "テーマ" });

    expect(screen.getByText("端末の外観設定に合わせます。")).toBeInTheDocument();

    await user.selectOptions(theme, "light");
    expect(screen.getByText("端末の外観設定にかかわらずライトで表示します。")).toBeInTheDocument();

    await user.selectOptions(theme, "dark");
    expect(screen.getByText("端末の外観設定にかかわらずダークで表示します。")).toBeInTheDocument();

    await user.selectOptions(theme, "system");
    expect(screen.getByText("端末の外観設定に合わせます。")).toBeInTheDocument();
  });
});

describe("SettingsPage 基準日", () => {
  it("persists a valid base date", async () => {
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度の基準日"), {
      target: { value: "2020-06-01" },
    });

    expect(getBaseDate()).toBe("2020-06-01");
  });

  it("rejects a base date before the e-Gov lower bound", async () => {
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度の基準日"), {
      target: { value: "2016-01-01" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("2017-04-01 以降");
    expect(getBaseDate()).toBeUndefined();
  });

  it("clears the base date when emptied", async () => {
    setBaseDate("2020-06-01");
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度の基準日"), {
      target: { value: "" },
    });

    expect(getBaseDate()).toBeUndefined();
  });

  it("keeps an out-of-range value visible in the input while showing the error", async () => {
    renderSettingsRoute();

    const input = await screen.findByLabelText("学習年度の基準日");
    fireEvent.change(input, { target: { value: "2016-01-01" } });

    // 無効値でも入力欄は巻き戻らずユーザーの入力を保持する。
    expect(input).toHaveValue("2016-01-01");
    expect(screen.getByRole("alert")).toHaveTextContent("2017-04-01 以降");
    expect(getBaseDate()).toBeUndefined();
  });
});

describe("SettingsPage 学習年度", () => {
  it("年度を選ぶと基準日がその年の 4/1 になり日付入力も追従する", async () => {
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度"), { target: { value: "2026" } });

    expect(getBaseDate()).toBe("2026-04-01");
    expect(screen.getByLabelText("学習年度の基準日")).toHaveValue("2026-04-01");
  });

  it("基準日が未設定のときは「未設定（現行法）」を表示する", async () => {
    renderSettingsRoute();

    expect(await screen.findByLabelText("学習年度")).toHaveValue("none");
  });

  it("「未設定（現行法）」を選ぶと基準日をクリアする", async () => {
    setBaseDate("2026-04-01");
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度"), { target: { value: "none" } });

    expect(getBaseDate()).toBeUndefined();
    expect(screen.getByLabelText("学習年度の基準日")).toHaveValue("");
  });

  it("基準日を手動編集すると年度セレクタは「カスタム」表示になる", async () => {
    setBaseDate("2026-04-01");
    renderSettingsRoute();

    expect(await screen.findByLabelText("学習年度")).toHaveValue("2026");

    fireEvent.change(screen.getByLabelText("学習年度の基準日"), {
      target: { value: "2026-05-01" },
    });

    expect(screen.getByLabelText("学習年度")).toHaveValue("custom");
  });

  it("「カスタム」の選択は基準日を変更しない", async () => {
    setBaseDate("2026-04-01");
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度"), { target: { value: "custom" } });

    expect(getBaseDate()).toBe("2026-04-01");
  });

  it("科目プリセットに行政書士プリセットを表示する", async () => {
    renderSettingsRoute();

    expect(await screen.findByText("行政書士（4 科目）")).toBeInTheDocument();
  });
});

describe("SettingsPage データ", () => {
  it("opens the export and import page from an accessible whole-row link", async () => {
    renderSettingsRoute();

    expect(await screen.findByRole("link", { name: /エクスポート \/ インポート/ })).toHaveAttribute(
      "href",
      "/settings/data-transfer",
    );
  });
});

const renderSettingsRoute = () => {
  const history = createMemoryHistory({ initialEntries: ["/settings"] });
  const user = userEvent.setup();

  const renderResult = render(
    <DisplayPreferencesProvider>
      <RouterProvider router={createAppRouter({ history })} />
    </DisplayPreferencesProvider>,
  );

  return { history, user, ...renderResult };
};
