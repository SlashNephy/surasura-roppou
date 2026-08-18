import type { LawNode, TextQuoteAnchor } from "@/core/domain";
import { describe, expect, it } from "vitest";

import { createTextQuoteAnchor, findAnchorNode, resolveTextQuoteAnchor } from "./text-anchor";

const target = { lawId: "322AC0000000125", article: "1", path: "Article:1" };
const anchorOf = (quote: string, prefix: string, suffix: string): TextQuoteAnchor => ({
  target,
  quote,
  prefix,
  suffix,
});

describe("createTextQuoteAnchor", () => {
  it("引用文と前後の文脈を切り出す", () => {
    expect(createTextQuoteAnchor("私権は、公共の福祉に適合する。", 4, 8)).toEqual({
      quote: "公共の福",
      prefix: "私権は、",
      suffix: "祉に適合する。",
    });
  });

  it("文頭・文末では文脈が空文字になる", () => {
    expect(createTextQuoteAnchor("あいう", 0, 3)).toEqual({
      quote: "あいう",
      prefix: "",
      suffix: "",
    });
  });
});

describe("resolveTextQuoteAnchor", () => {
  it("引用文が 1 箇所ならその位置を返す", () => {
    const plainText = "私権は、公共の福祉に適合する。";

    expect(resolveTextQuoteAnchor(plainText, anchorOf("公共", "私権は、", "の福"))).toEqual({
      start: 4,
      end: 6,
    });
  });

  it("引用文が複数箇所にあるとき前後の文脈が最も一致する候補を選ぶ", () => {
    const plainText = "甲は乙とする。丙は乙とする。";

    expect(resolveTextQuoteAnchor(plainText, anchorOf("乙", "丙は", "とする"))).toEqual({
      start: 9,
      end: 10,
    });
  });

  it("引用文が消えていれば undefined", () => {
    expect(resolveTextQuoteAnchor("まったく別の条文", anchorOf("公共", "", ""))).toBeUndefined();
  });

  it("空の引用文は undefined", () => {
    expect(resolveTextQuoteAnchor("あいう", anchorOf("", "", ""))).toBeUndefined();
  });
});

describe("findAnchorNode", () => {
  const nodes = [
    { id: "n1", path: "Article:1", type: "Article" },
    { id: "n2", path: "Article:1/Paragraph:1", type: "Paragraph" },
  ] as unknown as LawNode[];

  it("path で対象ノードを引く", () => {
    expect(findAnchorNode(nodes, { lawId: "x", path: "Article:1/Paragraph:1" })?.id).toBe("n2");
  });

  it("path が無い、または一致しなければ undefined", () => {
    expect(findAnchorNode(nodes, { lawId: "x" })).toBeUndefined();
    expect(findAnchorNode(nodes, { lawId: "x", path: "Article:9" })).toBeUndefined();
  });
});
