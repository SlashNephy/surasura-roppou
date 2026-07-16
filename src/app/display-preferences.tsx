import { ThemeProvider, useTheme } from "next-themes";
import { useCallback, useLayoutEffect, useState, useSyncExternalStore } from "react";
import type { PropsWithChildren, ReactElement } from "react";

import {
  DEFAULT_DISPLAY_PREFERENCES,
  DISPLAY_PREFERENCES_STORAGE_KEYS,
  getDisplayPreferences,
  sanitizeStoredDisplayTheme,
  setDisplayFontSize,
  setDisplayLineSpacing,
  subscribeDisplayPreferences,
  type DisplayFontSize,
  type DisplayLineSpacing,
  type DisplayPreferences,
  type DisplayTheme,
} from "@/core/settings";

interface DisplayPreferencesValue extends DisplayPreferences {
  setFontSize: (value: DisplayFontSize) => void;
  setLineSpacing: (value: DisplayLineSpacing) => void;
  setTheme: (value: DisplayTheme) => void;
}

const getServerDisplayPreferences = (): DisplayPreferences => DEFAULT_DISPLAY_PREFERENCES;

const isDisplayTheme = (value: string | undefined): value is DisplayTheme =>
  value === "system" || value === "light" || value === "dark";

const getInitialTheme = (): DisplayTheme => {
  sanitizeStoredDisplayTheme();
  return getDisplayPreferences().theme;
};

const DisplayPreferencesBridge = ({ children }: PropsWithChildren): ReactElement => {
  const { fontSize, lineSpacing } = useSyncExternalStore(
    subscribeDisplayPreferences,
    getDisplayPreferences,
    getServerDisplayPreferences,
  );

  useLayoutEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    document.documentElement.dataset.lineSpacing = lineSpacing;
  }, [fontSize, lineSpacing]);

  return <>{children}</>;
};

export const DisplayPreferencesProvider = ({ children }: PropsWithChildren): ReactElement => {
  const [defaultTheme] = useState(getInitialTheme);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem
      storageKey={DISPLAY_PREFERENCES_STORAGE_KEYS.theme}
    >
      <DisplayPreferencesBridge>{children}</DisplayPreferencesBridge>
    </ThemeProvider>
  );
};

export const useDisplayPreferences = (): DisplayPreferencesValue => {
  const { fontSize, lineSpacing } = useSyncExternalStore(
    subscribeDisplayPreferences,
    getDisplayPreferences,
    getServerDisplayPreferences,
  );
  const { setTheme: setNextTheme, theme: nextTheme } = useTheme();
  const theme = isDisplayTheme(nextTheme) ? nextTheme : DEFAULT_DISPLAY_PREFERENCES.theme;
  const setTheme = useCallback(
    (value: DisplayTheme): void => {
      setNextTheme(value);
    },
    [setNextTheme],
  );

  return {
    fontSize,
    lineSpacing,
    theme,
    setFontSize: setDisplayFontSize,
    setLineSpacing: setDisplayLineSpacing,
    setTheme,
  };
};
