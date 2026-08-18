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

  it("前後の文脈は contextLength (32文字) で打ち切る", () => {
    const plainText = `${"a".repeat(40)}Q${"b".repeat(40)}`;

    expect(createTextQuoteAnchor(plainText, 40, 41)).toEqual({
      quote: "Q",
      prefix: "a".repeat(32),
      suffix: "b".repeat(32),
    });
  });

  it("start が負のときは 0 に丸める（slice の負数インデックス解釈を避ける）", () => {
    expect(createTextQuoteAnchor("あいう", -1, 2)).toEqual({
      quote: "あい",
      prefix: "",
      suffix: "う",
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

  it("候補が複数あってどれも文脈が一致しない（score 0）なら undefined", () => {
    const plainText = "犬が乙になる。猫も乙になる。";

    expect(
      resolveTextQuoteAnchor(plainText, anchorOf("乙", "様々な地", "犬が化ける")),
    ).toBeUndefined();
  });

  it("出現が1箇所だけなら文脈が一致しなくても（score 0 でも）解決する", () => {
    const plainText = "犬が乙になる。";

    expect(resolveTextQuoteAnchor(plainText, anchorOf("乙", "様々な地", "犬が化ける"))).toEqual({
      start: 2,
      end: 3,
    });
  });

  it("複数候補が同点（score > 0）のときは先頭が勝つ", () => {
    const plainText = "甲は乙とする。甲は乙とする。";

    expect(resolveTextQuoteAnchor(plainText, anchorOf("乙", "甲は", "とする"))).toEqual({
      start: 2,
      end: 3,
    });
  });
});

describe("findAnchorNode", () => {
  const nodes: Pick<LawNode, "id" | "path" | "type">[] = [
    { id: "n1", path: "Article:1", type: "Article" },
    { id: "n2", path: "Article:1/Paragraph:1", type: "Paragraph" },
  ];

  it("path で対象ノードを引く", () => {
    expect(findAnchorNode(nodes, { lawId: "x", path: "Article:1/Paragraph:1" })?.id).toBe("n2");
  });

  it("path が無い、または一致しなければ undefined", () => {
    expect(findAnchorNode(nodes, { lawId: "x" })).toBeUndefined();
    expect(findAnchorNode(nodes, { lawId: "x", path: "Article:9" })).toBeUndefined();
  });
});
