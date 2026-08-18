import type { HighlightColor } from "@/core/domain";

export interface HighlightRange {
  annotationId: string;
  start: number;
  end: number;
  color: HighlightColor;
}

export interface CreatedHighlightRange {
  start: number;
  end: number;
  color: HighlightColor;
  // 異色分割で生じた断片のとき、元の注釈 id。createdAt やメモの複製元になる。
  sourceAnnotationId?: string;
}

export interface ApplyHighlightResult {
  created: CreatedHighlightRange[];
  updated: HighlightRange[];
  deleted: string[];
}

// 同色は隣接でも吸収する（継ぎ目を作らない）。吸収で範囲が広がると
// さらに別の同色に届きうるので、変化が止まるまで繰り返す。
const absorbSameColor = (
  existing: HighlightRange[],
  next: { start: number; end: number; color: HighlightColor },
): { start: number; end: number; absorbed: HighlightRange[] } => {
  let start = next.start;
  let end = next.end;
  const absorbed: HighlightRange[] = [];
  let changed = true;

  while (changed) {
    changed = false;

    for (const range of existing) {
      if (range.color !== next.color || absorbed.includes(range)) {
        continue;
      }

      if (range.end < start || range.start > end) {
        continue;
      }

      absorbed.push(range);
      start = Math.min(start, range.start);
      end = Math.max(end, range.end);
      changed = true;
    }
  }

  return { start, end, absorbed };
};

// 塗った範囲が既存と重なるとき、新しい色が勝ち、既存は削られる。
// 結果として「同一ノード内でハイライトは互いに重ならない」不変条件が保たれる。
export const applyHighlight = (
  existing: HighlightRange[],
  next: { start: number; end: number; color: HighlightColor },
): ApplyHighlightResult => {
  const { start, end, absorbed } = absorbSameColor(existing, next);
  const created: CreatedHighlightRange[] = [];
  const updated: HighlightRange[] = [];
  const deleted: string[] = [];
  // 代表は最も先頭側。createdAt を保つため id を引き継ぐ。
  const sortedAbsorbed = [...absorbed].sort((a, b) => a.start - b.start);

  if (sortedAbsorbed.length === 0) {
    created.push({ start, end, color: next.color });
  } else {
    const survivor = sortedAbsorbed[0];
    updated.push({ ...survivor, start, end });

    for (const range of absorbed) {
      if (range !== survivor) {
        deleted.push(range.annotationId);
      }
    }
  }

  for (const range of existing) {
    if (absorbed.includes(range) || range.end <= start || range.start >= end) {
      continue;
    }

    const hasLeft = range.start < start;
    const hasRight = range.end > end;

    if (hasLeft && hasRight) {
      updated.push({ ...range, end: start });
      created.push({
        start: end,
        end: range.end,
        color: range.color,
        sourceAnnotationId: range.annotationId,
      });
    } else if (hasLeft) {
      updated.push({ ...range, end: start });
    } else if (hasRight) {
      updated.push({ ...range, start: end });
    } else {
      deleted.push(range.annotationId);
    }
  }

  return { created, updated, deleted };
};
