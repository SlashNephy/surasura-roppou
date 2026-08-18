interface HighlightCapableView {
  CSS?: unknown;
  Highlight?: unknown;
  document?: unknown;
}

// 描画とヒットテストの両方が揃って初めて機能を出す。
// 片方でも欠けると「色は付くが消せない」状態になり、機能を隠すより悪い。
export const isHighlightSupported = (view: HighlightCapableView = globalThis): boolean => {
  const css = view.CSS;
  const document = view.document;

  if (typeof css !== "object" || css === null || !("highlights" in css)) {
    return false;
  }

  if (typeof view.Highlight !== "function") {
    return false;
  }

  if (typeof document !== "object" || document === null) {
    return false;
  }

  return "caretPositionFromPoint" in document || "caretRangeFromPoint" in document;
};
