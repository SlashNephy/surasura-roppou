import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Wifi } from "lucide-react";

import { pwaUpdateController } from "@/core/pwa";
import type { PwaUpdateController, PwaUpdateState } from "@/core/pwa";
import { Button } from "@/shared/ui/button";

const initialState = {
  needRefresh: false,
  offlineReady: false,
} satisfies PwaUpdateState;

interface PwaUpdatePromptProps {
  controller?: PwaUpdateController;
}

export const PwaUpdatePrompt = ({ controller = pwaUpdateController }: PwaUpdatePromptProps) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [state, setState] = useState<PwaUpdateState>(initialState);
  const stateRef = useRef<PwaUpdateState>(initialState);

  useEffect(() => {
    return controller.subscribe((nextState) => {
      if (isSamePwaUpdateState(stateRef.current, nextState)) {
        return;
      }

      stateRef.current = nextState;
      setState(nextState);
      setIsDismissed(false);
    });
  }, [controller]);

  if (isDismissed || (!state.error && !state.needRefresh && !state.offlineReady)) {
    return null;
  }

  const message = state.error
    ? "オフライン起動の準備に失敗しました"
    : state.needRefresh
      ? "新しいバージョンがあります"
      : "オフラインで起動できます";

  return (
    <output className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 grid gap-3 rounded-md border bg-background p-3 text-sm shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:w-80">
      <div className="flex min-w-0 items-center gap-2 text-foreground">
        {state.error ? (
          <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
        ) : state.needRefresh ? (
          <RefreshCw className="size-4 text-primary" aria-hidden="true" />
        ) : (
          <Wifi className="size-4 text-primary" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="leading-display">{message}</p>
          {state.error ? (
            <p className="text-xs leading-display text-muted-foreground">{state.error}</p>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsDismissed(true);
          }}
        >
          閉じる
        </Button>
        {state.needRefresh ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void controller.update();
            }}
          >
            更新
          </Button>
        ) : null}
      </div>
    </output>
  );
};

const isSamePwaUpdateState = (current: PwaUpdateState, next: PwaUpdateState) =>
  current.error === next.error &&
  current.needRefresh === next.needRefresh &&
  current.offlineReady === next.offlineReady;
