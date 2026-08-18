interface CaretPosition {
  node: Node;
  offset: number;
}

interface CaretCapableDocument {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

// 座標から文字位置を得る。caretPositionFromPoint が標準だが、
// Safari は長らく caretRangeFromPoint のみだったため両対応にする。
// caretPositionFromPoint が使える環境では、それが null を返しても
// caretRangeFromPoint へはフォールバックしない。null は「その座標に文字が無い」
// という意味であり、API 自体の非対応とは別の状態だからである。
export const caretPositionAt = (
  document: Document,
  x: number,
  y: number,
): CaretPosition | undefined => {
  const capable = document as CaretCapableDocument;

  if (typeof capable.caretPositionFromPoint === "function") {
    const position = capable.caretPositionFromPoint(x, y);

    return position === null ? undefined : { node: position.offsetNode, offset: position.offset };
  }

  if (typeof capable.caretRangeFromPoint === "function") {
    const range = capable.caretRangeFromPoint(x, y);

    return range === null ? undefined : { node: range.startContainer, offset: range.startOffset };
  }

  return undefined;
};
