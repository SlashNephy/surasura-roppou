const displayFontSizes = ["standard", "large", "extra-large"] as const;
const displayLineSpacings = ["standard", "relaxed", "wide"] as const;
// 本文・UI フォントの選択肢。system は現行のシステムフォントスタックを指し、
// それ以外は Fontsource で同梱する Web フォントの内部名。CSS の data 属性値と一致させる。
const displayFonts = [
  "system",
  "noto-serif-jp",
  "biz-udmincho",
  "zen-old-mincho",
  "noto-sans-jp",
  "biz-udgothic",
] as const;
const displayThemes = ["system", "light", "dark"] as const;
const displayTextModes = ["readable", "original"] as const;

export type DisplayFontSize = (typeof displayFontSizes)[number];

export type DisplayFont = (typeof displayFonts)[number];

export type DisplayLineSpacing = (typeof displayLineSpacings)[number];

export type DisplayTheme = (typeof displayThemes)[number];

export type DisplayTextMode = (typeof displayTextModes)[number];

export interface DisplayPreferences {
  readonly fontSize: DisplayFontSize;
  readonly lineSpacing: DisplayLineSpacing;
  // 条文を読む領域（法令本文・目次）の本文フォント。
  readonly lawFont: DisplayFont;
  readonly theme: DisplayTheme;
  // 法令本文の表示モード（読みやすい表示 / 原文表示）。原文は常に保持し表示のみ切替。
  readonly textDisplayMode: DisplayTextMode;
  // アプリ全体の UI フォント。見出しの font-serif には適用しない。
  readonly uiFont: DisplayFont;
}

const createDisplayPreferences = (
  fontSize: DisplayFontSize,
  lineSpacing: DisplayLineSpacing,
  lawFont: DisplayFont,
  theme: DisplayTheme,
  textDisplayMode: DisplayTextMode,
  uiFont: DisplayFont,
): DisplayPreferences =>
  Object.freeze({ fontSize, lineSpacing, lawFont, theme, textDisplayMode, uiFont });

export const DEFAULT_DISPLAY_PREFERENCES = createDisplayPreferences(
  "standard",
  "standard",
  "system",
  "system",
  "readable",
  "system",
);

// 表示設定を保存データや分析対象から分離し、項目ごとの変更だけを永続化する。
export const DISPLAY_PREFERENCES_STORAGE_KEYS = {
  fontSize: "surasura:display:font-size",
  lawFont: "surasura:display:law-font",
  lineSpacing: "surasura:display:line-spacing",
  textMode: "surasura:display:text-mode",
  theme: "surasura:display:theme",
  uiFont: "surasura:display:ui-font",
} as const;

const listeners = new Set<() => void>();

let storageEventTarget: Window | undefined;

let cachedPreferences = DEFAULT_DISPLAY_PREFERENCES;

const handleStorage = (event: StorageEvent): void => {
  if (
    event.key !== null &&
    event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize &&
    event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.lawFont &&
    event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing &&
    event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.textMode &&
    event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.theme &&
    event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.uiFont
  ) {
    return;
  }

  for (const listener of listeners) {
    listener();
  }
};

const startStorageSubscription = (): void => {
  if (storageEventTarget !== undefined || typeof window === "undefined") {
    return;
  }

  storageEventTarget = window;
  storageEventTarget.addEventListener("storage", handleStorage);
};

const stopStorageSubscription = (): void => {
  storageEventTarget?.removeEventListener("storage", handleStorage);
  storageEventTarget = undefined;
};

const includes = <Value extends string>(values: readonly Value[], value: string): value is Value =>
  values.includes(value as Value);

export const isDisplayFont = (value: unknown): value is DisplayFont =>
  typeof value === "string" && includes(displayFonts, value);

export const isDisplayFontSize = (value: unknown): value is DisplayFontSize =>
  typeof value === "string" && includes(displayFontSizes, value);

export const isDisplayLineSpacing = (value: unknown): value is DisplayLineSpacing =>
  typeof value === "string" && includes(displayLineSpacings, value);

export const isDisplayTheme = (value: unknown): value is DisplayTheme =>
  typeof value === "string" && includes(displayThemes, value);

export const isDisplayTextMode = (value: unknown): value is DisplayTextMode =>
  typeof value === "string" && includes(displayTextModes, value);

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
  const lawFont = read(
    storage,
    DISPLAY_PREFERENCES_STORAGE_KEYS.lawFont,
    displayFonts,
    DEFAULT_DISPLAY_PREFERENCES.lawFont,
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
  const textDisplayMode = read(
    storage,
    DISPLAY_PREFERENCES_STORAGE_KEYS.textMode,
    displayTextModes,
    DEFAULT_DISPLAY_PREFERENCES.textDisplayMode,
  );
  const uiFont = read(
    storage,
    DISPLAY_PREFERENCES_STORAGE_KEYS.uiFont,
    displayFonts,
    DEFAULT_DISPLAY_PREFERENCES.uiFont,
  );

  // useSyncExternalStore の snapshot が、値の不変時に同じ参照を返す契約を保つ。
  if (
    cachedPreferences.fontSize === fontSize &&
    cachedPreferences.lawFont === lawFont &&
    cachedPreferences.lineSpacing === lineSpacing &&
    cachedPreferences.theme === theme &&
    cachedPreferences.textDisplayMode === textDisplayMode &&
    cachedPreferences.uiFont === uiFont
  ) {
    return cachedPreferences;
  }

  cachedPreferences = createDisplayPreferences(
    fontSize,
    lineSpacing,
    lawFont,
    theme,
    textDisplayMode,
    uiFont,
  );
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

export const setDisplayTextMode = (value: DisplayTextMode): void => {
  write(getStorage(), DISPLAY_PREFERENCES_STORAGE_KEYS.textMode, value);
};

export const setDisplayLawFont = (value: DisplayFont): void => {
  write(getStorage(), DISPLAY_PREFERENCES_STORAGE_KEYS.lawFont, value);
};

export const setDisplayUiFont = (value: DisplayFont): void => {
  write(getStorage(), DISPLAY_PREFERENCES_STORAGE_KEYS.uiFont, value);
};

export const subscribeDisplayPreferences = (listener: () => void): (() => void) => {
  // 同じ callback の重複購読も、解除単位が独立するよう購読ごとに一意な関数を登録する。
  const notify = () => {
    listener();
  };
  listeners.add(notify);
  startStorageSubscription();

  return () => {
    if (listeners.delete(notify) && listeners.size === 0) {
      stopStorageSubscription();
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
