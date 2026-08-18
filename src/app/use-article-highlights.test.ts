import type { Annotation, LawNode } from "@/core/domain";
import { describe, expect, it } from "vitest";

import { buildHighlightMutations } from "./use-article-highlights";

const target = { lawId: "L", revisionId: "R", article: "1", path: "Article:1/Paragraph:1" };

const node = {
  id: "L:R:Article:1/Paragraph:1",
  path: "Article:1/Paragraph:1",
  plainText: "私権は、公共の福祉に適合しなければならない。",
} as unknown as LawNode;

const existing = (id: string, quote: string, color: Annotation["color"]): Annotation => ({
  id,
  target,
  anchors: [{ target, quote, prefix: "", suffix: "" }],
  color,
  tags: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});

const createNextId = () => {
  let count = 0;

  return () => {
    count += 1;

    return `new-${String(count)}`;
  };
};

const baseInput = { node, target, now: "2026-08-17T00:00:00.000Z" };

describe("buildHighlightMutations", () => {
  it("既存が無ければ新しい注釈を 1 件作る", () => {
    const result = buildHighlightMutations({
      ...baseInput,
      nextId: createNextId(),
      annotations: [],
      range: { start: 4, end: 9 },
      color: "yellow",
    });

    expect(result.deletes).toEqual([]);
    expect(result.puts).toHaveLength(1);
    expect(result.puts[0].color).toBe("yellow");
    expect(result.puts[0].anchors[0].quote).toBe("公共の福祉");
  });

  it("同色と重なるときはマージして createdAt を保つ", () => {
    const result = buildHighlightMutations({
      ...baseInput,
      nextId: createNextId(),
      annotations: [existing("old", "公共", "yellow")],
      range: { start: 6, end: 9 },
      color: "yellow",
    });

    expect(result.deletes).toEqual([]);
    expect(result.puts).toHaveLength(1);
    expect(result.puts[0].id).toBe("old");
    expect(result.puts[0].createdAt).toBe("2026-08-01T00:00:00.000Z");
    expect(result.puts[0].updatedAt).toBe("2026-08-17T00:00:00.000Z");
    expect(result.puts[0].anchors[0].quote).toBe("公共の福祉");
  });

  it("異色に完全に覆われた既存は削除される", () => {
    const result = buildHighlightMutations({
      ...baseInput,
      nextId: createNextId(),
      annotations: [existing("old", "公共", "yellow")],
      range: { start: 0, end: 12 },
      color: "pink",
    });

    expect(result.deletes).toEqual(["old"]);
  });

  it("他ノードの注釈は交差判定の対象にしない", () => {
    const otherTarget = { ...target, path: "Article:2/Paragraph:1" };
    const other: Annotation = {
      ...existing("other", "公共", "yellow"),
      target: otherTarget,
      anchors: [{ target: otherTarget, quote: "公共", prefix: "", suffix: "" }],
    };

    const result = buildHighlightMutations({
      ...baseInput,
      nextId: createNextId(),
      annotations: [other],
      range: { start: 4, end: 9 },
      color: "pink",
    });

    expect(result.deletes).toEqual([]);
    expect(result.puts).toHaveLength(1);
    expect(result.puts[0].id).not.toBe("other");
  });
});
