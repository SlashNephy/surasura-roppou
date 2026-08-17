// 一度でも要求したかを持つ。初回のダウンロード指定でだけ要求し、以後は設定画面に委ねる。
// Firefox は persist() でプロンプトを出すため、毎回呼ぶと閲覧の邪魔になる。
export const PERSISTENCE_REQUESTED_STORAGE_KEY = "surasura:storage:persist-requested";

const getStorageManager = (): StorageManager | undefined =>
  typeof navigator === "undefined" ? undefined : navigator.storage;

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
