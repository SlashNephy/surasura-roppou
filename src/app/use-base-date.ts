import { useCallback, useSyncExternalStore } from "react";

import { getBaseDate, setBaseDate as setBaseDateStore, subscribe } from "@/core/settings";

// 基準日ストアを React に橋渡しするフック。
// useSyncExternalStore で外部ストア（localStorage）の変更を安全に購読する。
export const useBaseDate = () => {
  const baseDate = useSyncExternalStore(subscribe, getBaseDate, () => undefined);

  const setBaseDate = useCallback((value: string | undefined) => {
    setBaseDateStore(value);
  }, []);

  return { baseDate, setBaseDate };
};
