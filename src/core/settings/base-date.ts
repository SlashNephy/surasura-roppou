// e-Gov API v2 が asof に受理する最古の日付。これより前は HTTP 400 になる。
export const earliestBaseDate = "2017-04-01";

// localStorage のキー。名前空間を付けて他アプリと衝突しないようにする。
const storageKey = "surasura:base-date";

// 同一タブ内の購読者。別タブは storage イベントで拾う。
const listeners = new Set<() => void>();

// YYYY-MM-DD 形式で、実在する日付かつ earliestBaseDate 以上かを検証する。
export const isValidBaseDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  // Date.parse は "2020-02-31" を 3/2 に丸めるため、往復一致で厳密に存在日を確認する。
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(timestamp)) {
    return false;
  }
  if (new Date(timestamp).toISOString().slice(0, 10) !== value) {
    return false;
  }

  // ISO 8601 の日付は辞書順比較がそのまま日付順になる。
  return value >= earliestBaseDate;
};

export const getBaseDate = (): string | undefined => {
  if (typeof localStorage === "undefined") {
    return undefined;
  }

  const stored = localStorage.getItem(storageKey);
  if (stored === null || !isValidBaseDate(stored)) {
    return undefined;
  }

  return stored;
};

export const setBaseDate = (value: string | undefined): void => {
  if (typeof localStorage === "undefined") {
    return;
  }

  if (value === undefined || value === "") {
    localStorage.removeItem(storageKey);
  } else {
    // 不正値は保存も通知もしない（呼び出し側で検証済みだが二重の防御）。
    if (!isValidBaseDate(value)) {
      return;
    }
    localStorage.setItem(storageKey, value);
  }

  for (const listener of listeners) {
    listener();
  }
};

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);

  // 別タブでの変更を反映する。key が null の場合は clear() なので常に通知する。
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
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

// 取得時に e-Gov へ渡す asof を決める。未設定なら undefined（＝現行法）。
export const resolveAsOf = (baseDate: string | undefined): string | undefined =>
  baseDate !== undefined && isValidBaseDate(baseDate) ? baseDate : undefined;
