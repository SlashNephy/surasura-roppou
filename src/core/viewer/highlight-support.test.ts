import { describe, expect, it } from "vitest";

import { isHighlightSupported } from "./highlight-support";

// isHighlightSupported は typeof でしか見ないため、本体は空でなければ何でもよい。
function Highlight() {
  return undefined;
}

const supportedView = {
  CSS: { highlights: {} },
  Highlight,
  document: { caretPositionFromPoint: () => undefined },
};

describe("isHighlightSupported", () => {
  it("描画とヒットテストが両方揃っていれば true", () => {
    expect(isHighlightSupported(supportedView)).toBe(true);
  });

  it("caretRangeFromPoint だけでも true", () => {
    expect(
      isHighlightSupported({
        ...supportedView,
        document: { caretRangeFromPoint: () => undefined },
      }),
    ).toBe(true);
  });

  it("CSS.highlights が無ければ false", () => {
    expect(isHighlightSupported({ ...supportedView, CSS: {} })).toBe(false);
  });

  it("Highlight コンストラクタが無ければ false", () => {
    expect(isHighlightSupported({ ...supportedView, Highlight: undefined })).toBe(false);
  });

  it("ヒットテスト手段が無ければ false", () => {
    expect(isHighlightSupported({ ...supportedView, document: {} })).toBe(false);
  });
});
