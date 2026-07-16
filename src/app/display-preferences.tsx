import { ThemeProvider, useTheme } from "next-themes";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { PropsWithChildren, ReactElement } from "react";

import {
  DEFAULT_DISPLAY_PREFERENCES,
  DISPLAY_PREFERENCES_STORAGE_KEYS,
  getDisplayPreferences,
  isDisplayTheme,
  sanitizeStoredDisplayTheme,
  subscribeDisplayPreferences,
  type DisplayPreferences,
} from "@/core/settings";

const getServerDisplayPreferences = (): DisplayPreferences => DEFAULT_DISPLAY_PREFERENCES;

const removeUnknownThemeClass = (theme: unknown): void => {
  if (typeof theme !== "string" || theme.length === 0) {
    return;
  }

  const root = document.documentElement;
  root.className = root.className
    .split(/\s+/u)
    .filter((className) => className.length > 0 && className !== theme)
    .join(" ");
};

const DisplayPreferencesBridge = ({ children }: PropsWithChildren): ReactElement => {
  const { fontSize, lineSpacing } = useSyncExternalStore(
    subscribeDisplayPreferences,
    getDisplayPreferences,
    getServerDisplayPreferences,
  );
  const { setTheme, theme } = useTheme();
  const hasValidTheme = isDisplayTheme(theme);
  const unknownThemeClass = useRef<unknown>(undefined);

  useLayoutEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    document.documentElement.dataset.lineSpacing = lineSpacing;
  }, [fontSize, lineSpacing]);

  useLayoutEffect(() => {
    if (hasValidTheme) {
      // next-themes は既知テーマだけを除去するため、補正前に付いた未知 class は別途取り除く。
      removeUnknownThemeClass(unknownThemeClass.current);
      unknownThemeClass.current = undefined;
      return;
    }

    unknownThemeClass.current = theme;
    removeUnknownThemeClass(theme);
    // 保存値の削除が拒否されても、next-themes の session state は独立して system へ戻す。
    sanitizeStoredDisplayTheme();
    setTheme(DEFAULT_DISPLAY_PREFERENCES.theme);
  }, [hasValidTheme, setTheme, theme]);

  return <>{children}</>;
};

export const DisplayPreferencesProvider = ({ children }: PropsWithChildren): ReactElement => {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={DEFAULT_DISPLAY_PREFERENCES.theme}
      enableSystem
      storageKey={DISPLAY_PREFERENCES_STORAGE_KEYS.theme}
    >
      <DisplayPreferencesBridge>{children}</DisplayPreferencesBridge>
    </ThemeProvider>
  );
};
