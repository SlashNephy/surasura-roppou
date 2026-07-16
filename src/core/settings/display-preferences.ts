const displayFontSizes = ["standard", "large", "extra-large"] as const;
const displayLineSpacings = ["standard", "relaxed", "wide"] as const;
const displayThemes = ["system", "light", "dark"] as const;

export type DisplayFontSize = (typeof displayFontSizes)[number];

export type DisplayLineSpacing = (typeof displayLineSpacings)[number];

export type DisplayTheme = (typeof displayThemes)[number];

export interface DisplayPreferences {
  readonly fontSize: DisplayFontSize;
  readonly lineSpacing: DisplayLineSpacing;
  readonly theme: DisplayTheme;
}

const createDisplayPreferences = (
  fontSize: DisplayFontSize,
  lineSpacing: DisplayLineSpacing,
  theme: DisplayTheme,
): DisplayPreferences => Object.freeze({ fontSize, lineSpacing, theme });

export const DEFAULT_DISPLAY_PREFERENCES = createDisplayPreferences(
  "standard",
  "standard",
  "system",
);

// 表示設定を保存データや分析対象から分離し、項目ごとの変更だけを永続化する。
const storageKeys = {
  fontSize: "surasura:display:font-size",
  lineSpacing: "surasura:display:line-spacing",
  theme: "surasura:display:theme",
} as const;

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

  try {
    const stored = localStorage.getItem(key);
    return stored !== null && includes(values, stored) ? stored : fallback;
  } catch {
    // ストレージを利用できない環境では、保存値がない場合と同じ既定値へ安全に劣化させる。
    return fallback;
  }
};

const write = (key: string, value: string): void => {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存状態が変わっていないため、購読者へも変更通知を送らない。
    return;
  }

  for (const listener of listeners) {
    listener();
  }
};

export const getDisplayPreferences = (): DisplayPreferences => {
  const fontSize = read(
    storageKeys.fontSize,
    displayFontSizes,
    DEFAULT_DISPLAY_PREFERENCES.fontSize,
  );
  const lineSpacing = read(
    storageKeys.lineSpacing,
    displayLineSpacings,
    DEFAULT_DISPLAY_PREFERENCES.lineSpacing,
  );
  const theme = read(storageKeys.theme, displayThemes, DEFAULT_DISPLAY_PREFERENCES.theme);

  // useSyncExternalStore の snapshot が、値の不変時に同じ参照を返す契約を保つ。
  if (
    cachedPreferences.fontSize === fontSize &&
    cachedPreferences.lineSpacing === lineSpacing &&
    cachedPreferences.theme === theme
  ) {
    return cachedPreferences;
  }

  cachedPreferences = createDisplayPreferences(fontSize, lineSpacing, theme);
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
  // 同じ callback の重複購読も、解除単位が独立するよう購読ごとに一意な関数を登録する。
  const notify = () => {
    listener();
  };
  listeners.add(notify);

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === storageKeys.fontSize ||
      event.key === storageKeys.lineSpacing ||
      event.key === storageKeys.theme
    ) {
      notify();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(notify);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
};

export const sanitizeStoredDisplayTheme = (): void => {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    const stored = localStorage.getItem(storageKeys.theme);
    if (stored !== null && !includes(displayThemes, stored)) {
      // next-themes が未知のテーマ名を html class として扱う前に保存境界で除去する。
      localStorage.removeItem(storageKeys.theme);
    }
  } catch {
    // ストレージ操作が拒否された場合は next-themes 側へ処理を委ね、起動自体は妨げない。
  }
};
