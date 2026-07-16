import { useTheme } from "next-themes";
import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_DISPLAY_PREFERENCES,
  getDisplayPreferences,
  isDisplayTheme,
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
