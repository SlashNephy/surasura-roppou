import { AlertTriangle } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

interface AnchorDriftBadgeProps {
  status: "drift" | "not_found";
  onOpenCompare: () => void;
}

// 「改正の可能性」バッジ。クリックで見比べ画面を開く。
export const AnchorDriftBadge = ({ status, onOpenCompare }: AnchorDriftBadgeProps) => (
  <Button
    className="h-auto p-0"
    onClick={onOpenCompare}
    type="button"
    variant="ghost"
    aria-label="改正の可能性を確認する"
  >
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle aria-hidden="true" className="size-3.5" />
      {status === "not_found" ? "条が見つかりません" : "改正の可能性"}
    </Badge>
  </Button>
);
