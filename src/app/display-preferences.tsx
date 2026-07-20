import { ThemeProvider, useTheme } from "next-themes";
import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PropsWithChildren, ReactElement } from "react";

import {
  DEFAULT_DISPLAY_PREFERENCES,
  DISPLAY_PREFERENCES_STORAGE_KEYS,
  getDisplayPreferences,
  isDisplayTheme,
  sanitizeStoredDisplayTheme,
  subscribeDisplayPreferences,
  type DisplayPreferences,
  type DisplayTheme,
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

interface DisplayPreferencesBridgeProps extends PropsWithChildren {
  onInitialThemeReady: () => void;
}

const DisplayPreferencesBridge = ({
  children,
  onInitialThemeReady,
}: DisplayPreferencesBridgeProps): ReactElement => {
  const { fontSize, lawFont, lineSpacing, uiFont } = useSyncExternalStore(
    subscribeDisplayPreferences,
    getDisplayPreferences,
    getServerDisplayPreferences,
  );
  const { setTheme, theme } = useTheme();
  const hasValidTheme = isDisplayTheme(theme);
  const unknownThemeClass = useRef<unknown>(undefined);
  const initialThemeReady = useRef(false);

  useLayoutEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    document.documentElement.dataset.lineSpacing = lineSpacing;
    document.documentElement.dataset.lawFont = lawFont;
    document.documentElement.dataset.uiFont = uiFont;
  }, [fontSize, lawFont, lineSpacing, uiFont]);

  useLayoutEffect(() => {
    const handleThemeStorage = (event: StorageEvent) => {
      if (event.key === null) {
        // 全消去は伝播を止めず、ほかの表示設定も各 subscriber に既定値へ戻させる。
        setTheme(DEFAULT_DISPLAY_PREFERENCES.theme);
        return;
      }

      if (
        event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.theme ||
        event.newValue === null ||
        isDisplayTheme(event.newValue)
      ) {
        return;
      }

      // next-themes の bubble listener が任意文字列を classList.add する前に無害化する。
      event.stopImmediatePropagation();
      sanitizeStoredDisplayTheme();
      setTheme(DEFAULT_DISPLAY_PREFERENCES.theme);
    };

    window.addEventListener("storage", handleThemeStorage, true);
    return () => {
      window.removeEventListener("storage", handleThemeStorage, true);
    };
  }, [setTheme]);

  useLayoutEffect(() => {
    if (hasValidTheme) {
      // next-themes は既知テーマだけを除去するため、補正前に付いた未知 class は別途取り除く。
      removeUnknownThemeClass(unknownThemeClass.current);
      unknownThemeClass.current = undefined;
      if (!initialThemeReady.current) {
        initialThemeReady.current = true;
        onInitialThemeReady();
      }
      return;
    }

    unknownThemeClass.current = theme;
    removeUnknownThemeClass(theme);
    // 保存値の削除が拒否されても、next-themes の session state は独立して system へ戻す。
    sanitizeStoredDisplayTheme();
    setTheme(DEFAULT_DISPLAY_PREFERENCES.theme);
  }, [hasValidTheme, onInitialThemeReady, setTheme, theme]);

  return <>{children}</>;
};

export const DisplayPreferencesProvider = ({ children }: PropsWithChildren): ReactElement => {
  const [forcedTheme, setForcedTheme] = useState<DisplayTheme | undefined>(
    () => getDisplayPreferences().theme,
  );
  const releaseInitialTheme = useCallback(() => {
    setForcedTheme(undefined);
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={DEFAULT_DISPLAY_PREFERENCES.theme}
      enableSystem
      forcedTheme={forcedTheme}
      storageKey={DISPLAY_PREFERENCES_STORAGE_KEYS.theme}
    >
      <DisplayPreferencesBridge onInitialThemeReady={releaseInitialTheme}>
        {children}
      </DisplayPreferencesBridge>
    </ThemeProvider>
  );
};
