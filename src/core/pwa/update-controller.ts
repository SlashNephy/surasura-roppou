export interface PwaUpdateState {
  error?: string;
  needRefresh: boolean;
  offlineReady: boolean;
}

export interface RegisterServiceWorkerOptions {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisterError?: (error: unknown) => void;
}

export type RegisterServiceWorker = (
  options: RegisterServiceWorkerOptions,
) => (reloadPage?: boolean) => Promise<void>;

export interface PwaUpdateController {
  subscribe(listener: (state: PwaUpdateState) => void): () => void;
  update(): Promise<void>;
}

const initialState: PwaUpdateState = {
  needRefresh: false,
  offlineReady: false,
};

export const createPwaUpdateController = (
  registerServiceWorker: RegisterServiceWorker,
): PwaUpdateController => {
  let state = initialState;
  const listeners = new Set<(state: PwaUpdateState) => void>();

  const publish = (nextState: PwaUpdateState) => {
    state = nextState;

    for (const listener of [...listeners]) {
      listener(state);
    }
  };

  const updateServiceWorker = registerServiceWorker({
    onNeedRefresh() {
      publish({ ...state, error: undefined, needRefresh: true });
    },
    onOfflineReady() {
      publish({ ...state, error: undefined, offlineReady: true });
    },
    onRegisterError(error) {
      console.error("PWA registration failed:", error);
      publish({ ...state, error: toErrorMessage(error) });
    },
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(state);

      return () => {
        listeners.delete(listener);
      };
    },
    update() {
      return updateServiceWorker(true);
    },
  };
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};
