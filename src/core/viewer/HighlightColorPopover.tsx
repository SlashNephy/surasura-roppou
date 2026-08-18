import { useEffect, useRef } from "react";

import type { HighlightColor } from "@/core/domain";
import { highlightColors } from "@/core/domain";
import { cn } from "@/shared/utils/cn";

// 色見本は色だけで意味を伝えない。読み上げ用の名前を必ず持たせる。
const labelByColor: Record<HighlightColor, string> = {
  yellow: "黄",
  cyan: "水色",
  pink: "ピンク",
  orange: "オレンジ",
};

const swatchClassByColor: Record<HighlightColor, string> = {
  yellow: "bg-[var(--highlight-yellow)]",
  cyan: "bg-[var(--highlight-cyan)]",
  pink: "bg-[var(--highlight-pink)]",
  orange: "bg-[var(--highlight-orange)]",
};

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

interface HighlightColorPopoverProps {
  anchorRect: AnchorRect;
  selectedColor?: HighlightColor;
  onSelect: (color: HighlightColor) => void;
  onDelete?: () => void;
  onDismiss: () => void;
}

const popoverHeight = 48;
const popoverGap = 8;

export const HighlightColorPopover = ({
  anchorRect,
  onDelete,
  onDismiss,
  onSelect,
  selectedColor,
}: HighlightColorPopoverProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  useEffect(() => {
    containerRef.current?.querySelector("button")?.focus();
  }, []);

  // 選択範囲の直上に出す。画面上端に近ければ直下へ回り込ませる。
  const showsBelow = anchorRect.top < popoverHeight + popoverGap;
  const top = showsBelow ? anchorRect.bottom + popoverGap : anchorRect.top - popoverHeight;

  return (
    <div
      ref={containerRef}
      aria-label="ハイライトの色"
      className="fixed z-50 flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-md"
      role="group"
      style={{ top, left: anchorRect.left + anchorRect.width / 2, transform: "translateX(-50%)" }}
    >
      {highlightColors.map((color) => (
        <button
          key={color}
          aria-label={`${labelByColor[color]}でハイライト`}
          aria-pressed={selectedColor === color}
          className={cn(
            // スウォッチは popover 地色とのコントラストが 3:1 に満たないため枠線で輪郭を出す。
            "size-7 rounded-full border border-input",
            swatchClassByColor[color],
            selectedColor === color && "ring-2 ring-ring ring-offset-1 ring-offset-popover",
          )}
          onClick={() => {
            onSelect(color);
          }}
          type="button"
        />
      ))}
      {onDelete === undefined ? null : (
        <button
          aria-label="ハイライトを削除"
          className="ml-1 rounded-sm px-2 py-1 text-sm text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={onDelete}
          type="button"
        >
          削除
        </button>
      )}
    </div>
  );
};
