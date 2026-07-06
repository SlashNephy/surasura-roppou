import { useEffect, useState } from "react";
import { RefreshCw, Wifi } from "lucide-react";

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

  useEffect(() => {
    return controller.subscribe((nextState) => {
      setState(nextState);
      setIsDismissed(false);
    });
  }, [controller]);

  if (isDismissed || (!state.needRefresh && !state.offlineReady)) {
    return null;
  }

  const message = state.needRefresh ? "新しいバージョンがあります" : "オフラインで起動できます";

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 grid gap-3 rounded-md border bg-background p-3 text-sm shadow-lg md:inset-x-auto md:right-4 md:bottom-4 md:w-80"
    >
      <div className="flex min-w-0 items-center gap-2 text-foreground">
        {state.needRefresh ? (
          <RefreshCw className="size-4 text-primary" aria-hidden="true" />
        ) : (
          <Wifi className="size-4 text-primary" aria-hidden="true" />
        )}
        <p className="min-w-0 leading-6">{message}</p>
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
    </div>
  );
};
