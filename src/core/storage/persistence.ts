// 一度でも要求したかを持つ。初回のダウンロード指定でだけ要求し、以後は設定画面に委ねる。
// Firefox は persist() でプロンプトを出すため、毎回呼ぶと閲覧の邪魔になる。
export const PERSISTENCE_REQUESTED_STORAGE_KEY = "surasura:storage:persist-requested";

const getStorageManager = (): StorageManager | undefined =>
  typeof navigator === "undefined" ? undefined : navigator.storage;

// Cookie を無効化した環境や Safari のプライベートブラウジングでは、localStorage プロパティへの
// アクセス自体が例外を投げる。storage-limit.ts / display-preferences.ts と同様に保護する。
const getStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

/** 保護を一度でも要求したか。読めない環境では false を返し、要求のたびに呼ばれることを許容する。 */
export const hasRequestedPersistence = (): boolean => {
  const storage = getStorage();

  if (storage === undefined) {
    return false;
  }

  try {
    return storage.getItem(PERSISTENCE_REQUESTED_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
};

/** 要求済みの印を立てる。書き込めない環境では黙って諦める（次回も要求が走るだけで安全側）。 */
export const markPersistenceRequested = (): void => {
  const storage = getStorage();

  if (storage === undefined) {
    return;
  }

  try {
    storage.setItem(PERSISTENCE_REQUESTED_STORAGE_KEY, "1");
  } catch {
    // 保護の要求自体は requestStoragePersistence 側で保護済みなので、印が立たないだけに留める。
  }
};

/** 保護されているか。読めないときは false を返し、閲覧を止めない。 */
export const isStoragePersisted = async (): Promise<boolean> => {
  const storage = getStorageManager();

  if (storage?.persisted === undefined) {
    return false;
  }

  try {
    return await storage.persisted();
  } catch {
    return false;
  }
};

/** 保護を要求する。拒否・失敗しても false を返すだけで、呼び出し側はバナーを出さない。 */
export const requestStoragePersistence = async (): Promise<boolean> => {
  const storage = getStorageManager();

  if (storage?.persist === undefined) {
    return false;
  }

  try {
    return await storage.persist();
  } catch {
    return false;
  }
};

/** オリジン全体の使用量。取れないときは undefined を返し、表示側で欄を空にする。 */
export const estimateStorageUsage = async (): Promise<
  { usage?: number; quota?: number } | undefined
> => {
  const storage = getStorageManager();

  if (storage?.estimate === undefined) {
    return undefined;
  }

  try {
    const estimate = await storage.estimate();

    return { usage: estimate.usage, quota: estimate.quota };
  } catch {
    return undefined;
  }
};
