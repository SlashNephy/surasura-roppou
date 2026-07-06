import { useEffect, useState } from "react";

import type { LawViewerDocument } from "./law-viewer-sample";

export interface SavedViewerState {
  isSaved: boolean;
  loadedFromStorage: boolean;
  savedAt?: string;
}

export const useSavedViewerState = (state: LawViewerDocument) =>
  useState<SavedViewerState>(() => toSavedViewerState(state));

export const toSavedViewerState = (state: LawViewerDocument): SavedViewerState => ({
  isSaved: state.isSaved,
  loadedFromStorage: state.loadedFromStorage,
  ...(state.savedAt === undefined ? {} : { savedAt: state.savedAt }),
});

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  return isOnline;
};
