import { describe, expect, it } from "vitest";

import {
  clearHighlights,
  type HighlightRegistryLike,
  highlightNameByColor,
  paintHighlights,
  type PaintedRange,
} from "./highlight-registry";

const createFakeRegistry = () => {
  const entries = new Map<string, Range[]>();
  const deleted: string[] = [];
  const registry: HighlightRegistryLike = {
    set(name, highlight) {
      entries.set(name, highlight as Range[]);
    },
    delete(name) {
      deleted.push(name);

      return entries.delete(name);
    },
  };

  return { registry, entries, deleted };
};

const createHighlight = (ranges: Range[]) => ranges;

const rangeFor = (text: string): Range => {
  const host = document.createElement("p");
  host.textContent = text;
  document.body.append(host);
  const range = document.createRange();
  range.selectNodeContents(host);

  return range;
};

describe("paintHighlights", () => {
  it("色ごとに 1 つの Highlight を登録する", () => {
    const { registry, entries } = createFakeRegistry();
    const painted: PaintedRange[] = [
      { annotationId: "a", color: "yellow", range: rangeFor("あ") },
      { annotationId: "b", color: "yellow", range: rangeFor("い") },
      { annotationId: "c", color: "pink", range: rangeFor("う") },
    ];

    paintHighlights(registry, createHighlight, painted);

    expect(entries.get(highlightNameByColor.yellow)).toHaveLength(2);
    expect(entries.get(highlightNameByColor.pink)).toHaveLength(1);
  });

  it("範囲が無い色は登録を消す", () => {
    const { registry, deleted } = createFakeRegistry();

    paintHighlights(registry, createHighlight, [
      { annotationId: "a", color: "yellow", range: rangeFor("あ") },
    ]);

    expect(deleted).toContain(highlightNameByColor.pink);
    expect(deleted).toContain(highlightNameByColor.cyan);
    expect(deleted).toContain(highlightNameByColor.orange);
    expect(deleted).not.toContain(highlightNameByColor.yellow);
  });
});

describe("clearHighlights", () => {
  it("4 色すべての登録を消す", () => {
    const { registry, deleted } = createFakeRegistry();

    clearHighlights(registry);

    expect(deleted).toHaveLength(4);
    expect(new Set(deleted)).toEqual(new Set(Object.values(highlightNameByColor)));
  });
});
