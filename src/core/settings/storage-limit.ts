// オフライン保存に使う容量の上限。表示設定と同じく localStorage に持ち、
// 保存データ（IndexedDB）やエクスポート対象からは切り離す。
const storageLimits = [25, 50, 100] as const;

export type StorageLimitMegabytes = (typeof storageLimits)[number];

export const selectableStorageLimits: readonly StorageLimitMegabytes[] = storageLimits;

export const DEFAULT_STORAGE_LIMIT_MEGABYTES: StorageLimitMegabytes = 50;

export const STORAGE_LIMIT_STORAGE_KEY = "surasura:storage:limit-mb";

const listeners = new Set<() => void>();

const isStorageLimit = (value: number): value is StorageLimitMegabytes =>
  storageLimits.some((limit) => limit === value);

export const getStorageLimitMegabytes = (): StorageLimitMegabytes => {
  if (typeof window === "undefined") {
    return DEFAULT_STORAGE_LIMIT_MEGABYTES;
  }

  const stored = Number(window.localStorage.getItem(STORAGE_LIMIT_STORAGE_KEY));

  // 手編集や選択肢の変更で読めない値になっていても既定へ倒す。
  return isStorageLimit(stored) ? stored : DEFAULT_STORAGE_LIMIT_MEGABYTES;
};

export const setStorageLimitMegabytes = (value: StorageLimitMegabytes): void => {
  window.localStorage.setItem(STORAGE_LIMIT_STORAGE_KEY, String(value));

  for (const listener of listeners) {
    listener();
  }
};

export const subscribeStorageLimit = (listener: () => void): (() => void) => {
  listeners.add(listener);

  // 別タブでの変更にも追従する。
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_LIMIT_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
};

// 上限は 2 進接頭辞で扱う。ブラウザの quota も estimate() も同じ単位系である。
export const megabytesToBytes = (megabytes: number): number => megabytes * 1024 * 1024;
