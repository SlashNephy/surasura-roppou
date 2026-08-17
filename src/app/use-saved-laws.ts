import { useEffect, useMemo, useState } from "react";

import { createSavedLawUseCase } from "@/core/storage";
import type { SavedLawSummary, StorageRepository } from "@/core/storage";

import { getCurrentStorageLimitBytes } from "./use-storage-limit";

interface UseSavedLawsResult {
  savedLaws: SavedLawSummary[];
  savedLawsError: string | undefined;
}

export const useSavedLaws = (storageRepository: StorageRepository): UseSavedLawsResult => {
  const [savedLaws, setSavedLaws] = useState<SavedLawSummary[]>([]);
  const [savedLawsError, setSavedLawsError] = useState<string | undefined>();
  const savedLawUseCase = useMemo(
    () =>
      createSavedLawUseCase(storageRepository, {
        getStorageLimitBytes: getCurrentStorageLimitBytes,
      }),
    [storageRepository],
  );

  useEffect(() => {
    let isCurrent = true;

    void savedLawUseCase
      .list()
      .then((nextSavedLaws) => {
        if (isCurrent) {
          setSavedLaws(nextSavedLaws);
          setSavedLawsError(undefined);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSavedLaws([]);
          setSavedLawsError("保存済み法令を読み込めませんでした。");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [savedLawUseCase]);

  return { savedLaws, savedLawsError };
};
