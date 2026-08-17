import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_STORAGE_LIMIT_MEGABYTES,
  getStorageLimitMegabytes,
  megabytesToBytes,
  setStorageLimitMegabytes,
  subscribeStorageLimit,
  type StorageLimitMegabytes,
} from "@/core/settings";

interface StorageLimitValue {
  limitMegabytes: StorageLimitMegabytes;
  limitBytes: number;
  setLimitMegabytes: (value: StorageLimitMegabytes) => void;
}

const getServerStorageLimit = (): StorageLimitMegabytes => DEFAULT_STORAGE_LIMIT_MEGABYTES;

// SavedLawUseCase へ渡す getStorageLimitBytes の実体。呼ばれるたびにストアを読み直す契約
// なので、React の再レンダーやユースケースの参照同一性とは独立に最新の上限値を返せる。
// ビューア・保存リストなど、上限付きユースケースを作る全箇所がこれを共有する。
export const getCurrentStorageLimitBytes = (): number =>
  megabytesToBytes(getStorageLimitMegabytes());

export const useStorageLimit = (): StorageLimitValue => {
  const limitMegabytes = useSyncExternalStore(
    subscribeStorageLimit,
    getStorageLimitMegabytes,
    getServerStorageLimit,
  );
  const setLimitMegabytes = useCallback((value: StorageLimitMegabytes): void => {
    setStorageLimitMegabytes(value);
  }, []);

  return { limitMegabytes, limitBytes: megabytesToBytes(limitMegabytes), setLimitMegabytes };
};
