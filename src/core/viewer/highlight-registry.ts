import type { HighlightColor } from "@/core/domain";
import { highlightColors } from "@/core/domain";

// ::highlight() の登録名。CSS 側の疑似要素セレクタと一致させる。
export const highlightNameByColor: Record<HighlightColor, string> = {
  yellow: "surasura-highlight-yellow",
  cyan: "surasura-highlight-cyan",
  pink: "surasura-highlight-pink",
  orange: "surasura-highlight-orange",
};

export interface PaintedRange {
  annotationId: string;
  color: HighlightColor;
  range: Range;
}

export interface HighlightRegistryLike {
  set(name: string, highlight: unknown): void;
  delete(name: string): boolean;
}

// 色ごとに Highlight を 1 個だけ登録し、そこへ複数の Range を入れる。
// 注釈ごとに登録名を作ると registry が肥大し、CSS も書けなくなる。
export const paintHighlights = (
  registry: HighlightRegistryLike,
  createHighlight: (ranges: Range[]) => unknown,
  painted: PaintedRange[],
): void => {
  for (const color of highlightColors) {
    const ranges = painted.filter((entry) => entry.color === color).map((entry) => entry.range);

    if (ranges.length === 0) {
      registry.delete(highlightNameByColor[color]);
      continue;
    }

    registry.set(highlightNameByColor[color], createHighlight(ranges));
  }
};

export const clearHighlights = (registry: HighlightRegistryLike): void => {
  for (const name of Object.values(highlightNameByColor)) {
    registry.delete(name);
  }
};
