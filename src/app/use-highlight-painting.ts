import { type RefObject, useEffect, useRef } from "react";

import type { Annotation, LawNode } from "@/core/domain";
import {
  type AlignmentSegment,
  alignTexts,
  clearHighlights,
  createNodeTextRange,
  displayTextOf,
  findAnchorNode,
  findLawNodeElement,
  type HighlightRegistryLike,
  type PaintedRange,
  paintHighlights,
  resolveTextQuoteAnchor,
  toDisplayRange,
} from "@/core/viewer";

interface HighlightPaintingOptions {
  containerRef: RefObject<HTMLElement | null>;
  nodes: LawNode[];
  annotations: Annotation[];
  enabled: boolean;
  // テストからフェイクを差し込むための注入点。既定はブラウザの実装。
  registry?: HighlightRegistryLike;
  createHighlight?: (ranges: Range[]) => unknown;
}

// 引用文のうち、アラインメントで display 側に対応が取れた文字数を数える。
const alignedLengthIn = (
  segments: AlignmentSegment[],
  sourceStart: number,
  sourceEnd: number,
): number =>
  segments.reduce((total, segment) => {
    const start = Math.max(segment.sourceStart, sourceStart);
    const end = Math.min(segment.sourceStart + segment.length, sourceEnd);

    return total + Math.max(0, end - start);
  }, 0);

// 保存された引用文アンカーを、いま描画されている DOM 上の Range に変換する。
// 表示文字列と plainText の差はアラインメントで吸収する。
//
// 本文要素の子は単一の Text ノードとは限らない（条文参照は <a>、ルビ対象語は
// <ruby><rt> に分割される）ため、`element.firstChild` を Text ノード扱いしては
// いけない。表示文字列の取得は `displayTextOf(element)`、表示文字列上の範囲から
// DOM Range を作るのは `createNodeTextRange(element, start, end)` を使う。
export const buildPaintedRanges = (
  root: ParentNode,
  nodes: LawNode[],
  annotations: Annotation[],
): PaintedRange[] => {
  const painted: PaintedRange[] = [];

  for (const annotation of annotations) {
    const color = annotation.color;

    if (color === undefined) {
      continue;
    }

    for (const anchor of annotation.anchors) {
      const node = findAnchorNode(nodes, anchor.target);

      if (node === undefined) {
        continue;
      }

      const element = findLawNodeElement(root, node.id);

      if (element === undefined) {
        continue;
      }

      const sourceRange = resolveTextQuoteAnchor(node.plainText, anchor);

      if (sourceRange === undefined) {
        continue;
      }

      const displayText = displayTextOf(element);
      const alignment = alignTexts(node.plainText, displayText);
      const displayRange = toDisplayRange(alignment, sourceRange.start, sourceRange.end);

      if (displayRange === undefined) {
        continue;
      }

      // 引用文が本文から失われていても、たまたま散らばった共通文字が拾われて
      // 無関係な範囲へ写ることがある（toDisplayRange は置換をまたぐと範囲を広げるため、
      // 幅の比較では区別できない）。引用文の過半数が display 側に生き残っている
      // ことを要求し、根拠の薄い復元を捨てる。readable 変換（漢数字 → 算用数字）を
      // またぐ引用文は大半の文字が残るため通る。
      const aligned = alignedLengthIn(alignment.segments, sourceRange.start, sourceRange.end);

      if (aligned * 2 <= sourceRange.end - sourceRange.start) {
        continue;
      }

      const range = createNodeTextRange(element, displayRange.start, displayRange.end);

      if (range === undefined) {
        continue;
      }

      painted.push({ annotationId: annotation.id, color, range });
    }
  }

  return painted;
};

const browserRegistry = (): HighlightRegistryLike | undefined => {
  const css = (globalThis as { CSS?: { highlights?: unknown } }).CSS;

  return css?.highlights as HighlightRegistryLike | undefined;
};

const browserHighlight = (ranges: Range[]): unknown =>
  new (globalThis as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight(
    ...ranges,
  );

export const useHighlightPainting = ({
  annotations,
  containerRef,
  createHighlight,
  enabled,
  nodes,
  registry,
}: HighlightPaintingOptions): RefObject<PaintedRange[]> => {
  // 構築結果は ref で返す。読むのは pointerup のヒットテストだけで、レンダーには
  // 使わないため、state にすると無駄な再レンダーと再購読を招く。
  // （レンダー中の ref 読みは react-hooks/refs に反するので、構築も effect の中で行う。）
  const paintedRef = useRef<PaintedRange[]>([]);

  // React が再レンダーで Text ノードを差し替えると、古い Range は例外も出さずに
  // 描画されなくなる。差分更新はせず、依存が変わるたび全部作り直す。
  useEffect(() => {
    const activeRegistry = registry ?? browserRegistry();
    const root = containerRef.current;

    if (!enabled || root === null) {
      paintedRef.current = [];

      if (activeRegistry !== undefined) {
        clearHighlights(activeRegistry);
      }

      return;
    }

    const painted = buildPaintedRanges(root, nodes, annotations);
    paintedRef.current = painted;

    if (activeRegistry === undefined) {
      return;
    }

    paintHighlights(activeRegistry, createHighlight ?? browserHighlight, painted);

    return () => {
      paintedRef.current = [];
      clearHighlights(activeRegistry);
    };
  }, [annotations, containerRef, createHighlight, enabled, nodes, registry]);

  return paintedRef;
};
