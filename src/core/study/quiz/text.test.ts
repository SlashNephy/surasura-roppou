import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";
import { createQuizLawNodes, findQuizArticle } from "@/test/fixtures/quizNodes";

import {
  collectParagraphTexts,
  formatArticleLabel,
  isDeletedArticle,
  splitSentences,
} from "./text";

const toMap = (nodes: LawNode[]) => new Map(nodes.map((node) => [node.id, node]));

describe("collectParagraphTexts", () => {
  it("returns paragraph bodies with the leading paragraph number stripped", () => {
    const nodes = createQuizLawNodes([
      {
        number: "1",
        title: "第一条",
        paragraphs: [
          "私権は、公共の福祉に適合しなければならない。",
          "権利の濫用は、これを許さない。",
        ],
      },
    ]);
    const article = findQuizArticle(nodes, "1");

    expect(collectParagraphTexts(article, toMap(nodes))).toEqual([
      "私権は、公共の福祉に適合しなければならない。",
      "権利の濫用は、これを許さない。",
    ]);
  });

  it("falls back to the article plainText without caption and title when there are no paragraphs", () => {
    const article = {
      id: "law:rev:article:1",
      lawId: "law",
      revisionId: "rev",
      type: "Article",
      path: "article:1",
      number: "1",
      title: "第一条",
      caption: "（基本原則）",
      rawText: "第一条 私権は、公共の福祉に適合しなければならない。",
      plainText: "（基本原則） 第一条 私権は、公共の福祉に適合しなければならない。",
      children: [],
    } satisfies LawNode;

    expect(collectParagraphTexts(article, new Map())).toEqual([
      "私権は、公共の福祉に適合しなければならない。",
    ]);
  });
});

describe("splitSentences", () => {
  it.each([
    {
      name: "splits on 。 and keeps the terminator",
      text: "所有権を取得する。ただし、この限りでない。",
      expected: ["所有権を取得する。", "ただし、この限りでない。"],
    },
    {
      name: "returns a single sentence as-is",
      text: "これを許さない。",
      expected: ["これを許さない。"],
    },
    { name: "ignores empty segments", text: "。", expected: [] },
  ])("$name", ({ text, expected }) => {
    expect(splitSentences(text)).toEqual(expected);
  });
});

describe("isDeletedArticle", () => {
  it("treats a 削除-only article as deleted", () => {
    const nodes = createQuizLawNodes([{ number: "2", title: "第二条", paragraphs: ["削除"] }]);

    expect(isDeletedArticle(findQuizArticle(nodes, "2"), toMap(nodes))).toBe(true);
  });

  it("treats a normal article as not deleted", () => {
    const nodes = createQuizLawNodes([
      { number: "1", title: "第一条", paragraphs: ["権利の濫用は、これを許さない。"] },
    ]);

    expect(isDeletedArticle(findQuizArticle(nodes, "1"), toMap(nodes))).toBe(false);
  });
});

describe("formatArticleLabel", () => {
  it("prefers the original article title", () => {
    const nodes = createQuizLawNodes([{ number: "709", title: "第七百九条", paragraphs: ["a。"] }]);

    expect(formatArticleLabel(findQuizArticle(nodes, "709"))).toBe("第七百九条");
  });

  it("builds a label from the number when the title is missing", () => {
    const article = {
      id: "law:rev:article:1",
      lawId: "law",
      revisionId: "rev",
      type: "Article",
      path: "article:1",
      number: "1",
      rawText: "a。",
      plainText: "a。",
      children: [],
    } satisfies LawNode;

    expect(formatArticleLabel(article)).toBe("第1条");
  });
});
