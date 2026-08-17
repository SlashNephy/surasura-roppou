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
