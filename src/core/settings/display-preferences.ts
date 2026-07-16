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
export const DISPLAY_PREFERENCES_STORAGE_KEYS = {
  fontSize: "surasura:display:font-size",
  lineSpacing: "surasura:display:line-spacing",
  theme: "surasura:display:theme",
} as const;

const listeners = new Set<() => void>();

let cachedPreferences = DEFAULT_DISPLAY_PREFERENCES;

const includes = <Value extends string>(values: readonly Value[], value: string): value is Value =>
  values.includes(value as Value);

export const isDisplayTheme = (value: unknown): value is DisplayTheme =>
  typeof value === "string" && includes(displayThemes, value);

const getStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    // Window.localStorage 自体へのアクセスを拒否する環境では、ストレージなしとして扱う。
    return undefined;
  }
};

const read = <Value extends string>(
  storage: Storage | undefined,
  key: string,
  values: readonly Value[],
  fallback: Value,
): Value => {
  if (storage === undefined) {
    return fallback;
  }

  try {
    const stored = storage.getItem(key);
    return stored !== null && includes(values, stored) ? stored : fallback;
  } catch {
    // ストレージを利用できない環境では、保存値がない場合と同じ既定値へ安全に劣化させる。
    return fallback;
  }
};

const write = (storage: Storage | undefined, key: string, value: string): void => {
  if (storage === undefined) {
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    // 保存状態が変わっていないため、購読者へも変更通知を送らない。
    return;
  }

  for (const listener of listeners) {
    listener();
  }
};

export const getDisplayPreferences = (): DisplayPreferences => {
  const storage = getStorage();
  const fontSize = read(
    storage,
    DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize,
    displayFontSizes,
    DEFAULT_DISPLAY_PREFERENCES.fontSize,
  );
  const lineSpacing = read(
    storage,
    DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing,
    displayLineSpacings,
    DEFAULT_DISPLAY_PREFERENCES.lineSpacing,
  );
  const theme = read(
    storage,
    DISPLAY_PREFERENCES_STORAGE_KEYS.theme,
    displayThemes,
    DEFAULT_DISPLAY_PREFERENCES.theme,
  );

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
  write(getStorage(), DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize, value);
};

export const setDisplayLineSpacing = (value: DisplayLineSpacing): void => {
  write(getStorage(), DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing, value);
};

export const setDisplayTheme = (value: DisplayTheme): void => {
  write(getStorage(), DISPLAY_PREFERENCES_STORAGE_KEYS.theme, value);
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
      event.key === DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize ||
      event.key === DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing ||
      event.key === DISPLAY_PREFERENCES_STORAGE_KEYS.theme
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
  const storage = getStorage();
  if (storage === undefined) {
    return;
  }

  try {
    const stored = storage.getItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme);
    if (stored !== null && !includes(displayThemes, stored)) {
      // next-themes が未知のテーマ名を html class として扱う前に保存境界で除去する。
      storage.removeItem(DISPLAY_PREFERENCES_STORAGE_KEYS.theme);
    }
  } catch {
    // ストレージ操作が拒否された場合は next-themes 側へ処理を委ね、起動自体は妨げない。
  }
};
