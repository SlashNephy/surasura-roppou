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
): { start: number; end: number; absorbed: HighlightRange[]; absorbedSet: Set<HighlightRange> } => {
  let start = next.start;
  let end = next.end;
  const absorbed: HighlightRange[] = [];
  const absorbedSet = new Set<HighlightRange>();
  let changed = true;

  while (changed) {
    changed = false;

    for (const range of existing) {
      if (range.color !== next.color || absorbedSet.has(range)) {
        continue;
      }

      if (range.end < start || range.start > end) {
        continue;
      }

      absorbed.push(range);
      absorbedSet.add(range);
      start = Math.min(start, range.start);
      end = Math.max(end, range.end);
      changed = true;
    }
  }

  return { start, end, absorbed, absorbedSet };
};

// 塗った範囲が既存と重なるとき、新しい色が勝ち、既存は削られる。
// 結果として「同一ノード内でハイライトは互いに重ならない」不変条件が保たれる。
//
// 前提: existing は互いに重ならないこと（呼び出し側が保証する）。existing 同士が
// 重なっていると、この関数の出力も重なりうる。
// 前提: existing は単一の本文ノード内の範囲のみであること。座標は plainText 空間
// （node.plainText 上のオフセット）であること。複数ノードにまたがる範囲を渡さないこと、
// 座標を plainText 空間へ揃えることは、いずれも呼び出し側の責務である。
export const applyHighlight = (
  existing: HighlightRange[],
  next: { start: number; end: number; color: HighlightColor },
): ApplyHighlightResult => {
  // 幅 0 の塗り（クリックのみの選択など）は不可視かつヒットテスト不能な注釈を
  // 生み出すうえ、後続の trim ループの境界条件（<=）に引っかからず永久に残る。
  // 何もしない。
  if (next.start >= next.end) {
    return { created: [], updated: [], deleted: [] };
  }

  const { start, end, absorbed, absorbedSet } = absorbSameColor(existing, next);
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
    if (absorbedSet.has(range) || range.end <= start || range.start >= end) {
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
