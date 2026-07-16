export type DisplayFontSize = "standard" | "large" | "extra-large";

export type DisplayLineSpacing = "standard" | "relaxed" | "wide";

export type DisplayTheme = "system" | "light" | "dark";

export interface DisplayPreferences {
  fontSize: DisplayFontSize;
  lineSpacing: DisplayLineSpacing;
  theme: DisplayTheme;
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = Object.freeze({
  fontSize: "standard",
  lineSpacing: "standard",
  theme: "system",
});

// 表示設定を保存データや分析対象から分離し、項目ごとの変更だけを永続化する。
const storageKeys = {
  fontSize: "surasura:display:font-size",
  lineSpacing: "surasura:display:line-spacing",
  theme: "surasura:display:theme",
} as const;

const fontSizes = ["standard", "large", "extra-large"] as const;
const lineSpacings = ["standard", "relaxed", "wide"] as const;
const themes = ["system", "light", "dark"] as const;
const listeners = new Set<() => void>();

let cachedPreferences = DEFAULT_DISPLAY_PREFERENCES;

const includes = <Value extends string>(values: readonly Value[], value: string): value is Value =>
  values.includes(value as Value);

const read = <Value extends string>(
  key: string,
  values: readonly Value[],
  fallback: Value,
): Value => {
  if (typeof localStorage === "undefined") {
    return fallback;
  }

  const stored = localStorage.getItem(key);
  return stored !== null && includes(values, stored) ? stored : fallback;
};

const write = (key: string, value: string): void => {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(key, value);
  for (const listener of listeners) {
    listener();
  }
};

export const getDisplayPreferences = (): DisplayPreferences => {
  const fontSize = read(storageKeys.fontSize, fontSizes, DEFAULT_DISPLAY_PREFERENCES.fontSize);
  const lineSpacing = read(
    storageKeys.lineSpacing,
    lineSpacings,
    DEFAULT_DISPLAY_PREFERENCES.lineSpacing,
  );
  const theme = read(storageKeys.theme, themes, DEFAULT_DISPLAY_PREFERENCES.theme);

  // useSyncExternalStore の snapshot が、値の不変時に同じ参照を返す契約を保つ。
  if (
    cachedPreferences.fontSize === fontSize &&
    cachedPreferences.lineSpacing === lineSpacing &&
    cachedPreferences.theme === theme
  ) {
    return cachedPreferences;
  }

  cachedPreferences = { fontSize, lineSpacing, theme };
  return cachedPreferences;
};

export const setDisplayFontSize = (value: DisplayFontSize): void => {
  write(storageKeys.fontSize, value);
};

export const setDisplayLineSpacing = (value: DisplayLineSpacing): void => {
  write(storageKeys.lineSpacing, value);
};

export const setDisplayTheme = (value: DisplayTheme): void => {
  write(storageKeys.theme, value);
};

export const subscribeDisplayPreferences = (listener: () => void): (() => void) => {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === storageKeys.fontSize ||
      event.key === storageKeys.lineSpacing ||
      event.key === storageKeys.theme
    ) {
      listener();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
};

export const sanitizeStoredDisplayTheme = (): void => {
  if (typeof localStorage === "undefined") {
    return;
  }

  const stored = localStorage.getItem(storageKeys.theme);
  if (stored !== null && !includes(themes, stored)) {
    // next-themes が未知のテーマ名を html class として扱う前に保存境界で除去する。
    localStorage.removeItem(storageKeys.theme);
  }
};
