// オフライン保存に使う容量の上限。表示設定と同じく localStorage に持ち、
// 保存データ（IndexedDB）やエクスポート対象からは切り離す。
const storageLimits = [25, 50, 100] as const;

export type StorageLimitMegabytes = (typeof storageLimits)[number];

export const selectableStorageLimits: readonly StorageLimitMegabytes[] = storageLimits;

export const DEFAULT_STORAGE_LIMIT_MEGABYTES: StorageLimitMegabytes = 50;

export const STORAGE_LIMIT_STORAGE_KEY = "surasura:storage:limit-mb";

const listeners = new Set<() => void>();

let storageEventTarget: Window | undefined;

const isStorageLimit = (value: number): value is StorageLimitMegabytes =>
  storageLimits.some((limit) => limit === value);

// Cookie を無効化した環境や Safari のプライベートブラウジングでは、
// localStorage プロパティへのアクセス自体が例外を投げる。display-preferences.ts と同様に保護する。
const getStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const handleStorage = (event: StorageEvent): void => {
  if (event.key !== null && event.key !== STORAGE_LIMIT_STORAGE_KEY) {
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

export const getStorageLimitMegabytes = (): StorageLimitMegabytes => {
  const storage = getStorage();
  if (storage === undefined) {
    return DEFAULT_STORAGE_LIMIT_MEGABYTES;
  }

  try {
    const stored = Number(storage.getItem(STORAGE_LIMIT_STORAGE_KEY));

    // 手編集や選択肢の変更で読めない値になっていても既定へ倒す。
    return isStorageLimit(stored) ? stored : DEFAULT_STORAGE_LIMIT_MEGABYTES;
  } catch {
    // ストレージを利用できない環境では、保存値がない場合と同じ既定値へ安全に劣化させる。
    return DEFAULT_STORAGE_LIMIT_MEGABYTES;
  }
};

export const setStorageLimitMegabytes = (value: StorageLimitMegabytes): void => {
  const storage = getStorage();
  if (storage === undefined) {
    return;
  }

  try {
    storage.setItem(STORAGE_LIMIT_STORAGE_KEY, String(value));
  } catch {
    // 保存状態が変わっていないため、購読者へも変更通知を送らない。
    return;
  }

  for (const listener of listeners) {
    listener();
  }
};

export const subscribeStorageLimit = (listener: () => void): (() => void) => {
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

// 上限は 2 進接頭辞で扱う。ブラウザの quota も estimate() も同じ単位系である。
export const megabytesToBytes = (megabytes: number): number => megabytes * 1024 * 1024;
