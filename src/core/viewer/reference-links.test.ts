import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";

import { buildArticleLinkEntries } from "./reference-links";

const node = (overrides: Partial<LawNode> & Pick<LawNode, "id" | "path" | "type">): LawNode => ({
  lawId: "129AC0000000089",
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  rawText: "",
  plainText: "",
  children: [],
  ...overrides,
});

const lawNodes: LawNode[] = [
  node({
    id: "chapter:1",
    type: "Chapter",
    path: "chapter:1",
    number: "1",
    title: "第一章　通則",
    children: ["article:15", "article:16"],
  }),
  node({
    id: "article:15",
    type: "Article",
    path: "chapter:1/article:15",
    number: "15",
    title: "第十五条",
    caption: "（補助開始の審判）",
    children: ["article:15/paragraph:1", "article:15/paragraph:2"],
    parentId: "chapter:1",
  }),
  node({
    id: "article:15/paragraph:1",
    type: "Paragraph",
    path: "chapter:1/article:15/paragraph:1",
    number: "1",
    parentId: "article:15",
  }),
  node({
    id: "article:15/paragraph:2",
    type: "Paragraph",
    path: "chapter:1/article:15/paragraph:2",
    number: "2",
    parentId: "article:15",
  }),
  node({
    id: "article:16",
    type: "Article",
    path: "chapter:1/article:16",
    number: "16",
    title: "第十六条",
    children: ["article:16/paragraph:1"],
    parentId: "chapter:1",
  }),
  node({
    id: "article:16/paragraph:1",
    type: "Paragraph",
    path: "chapter:1/article:16/paragraph:1",
    number: "1",
    parentId: "article:16",
  }),
  node({
    id: "supplementary:1",
    type: "SupplementaryProvision",
    path: "supplementary-provision:1",
    title: "附　則",
    children: ["supplementary:1/article:1"],
  }),
  node({
    id: "supplementary:1/article:1",
    type: "Article",
    path: "supplementary-provision:1/article:1",
    number: "1",
    title: "第一条",
    parentId: "supplementary:1",
  }),
];

describe("buildArticleLinkEntries", () => {
  it("collects url addressable articles in document order", () => {
    expect(buildArticleLinkEntries(lawNodes).map((entry) => entry.articleNumber)).toEqual([
      "15",
      "16",
    ]);
  });

  it("strips the parentheses around a caption", () => {
    expect(buildArticleLinkEntries(lawNodes)[0].caption).toBe("補助開始の審判");
  });

  it("omits the caption when the article has none", () => {
    expect(buildArticleLinkEntries(lawNodes)[1].caption).toBeUndefined();
  });

  it("collects article-direct paragraph numbers", () => {
    expect(buildArticleLinkEntries(lawNodes)[0].paragraphNumbers).toEqual(["1", "2"]);
  });
});
