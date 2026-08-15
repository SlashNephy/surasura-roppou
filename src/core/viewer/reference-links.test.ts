import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";

import { buildArticleLinkEntries, segmentReferenceLinks } from "./reference-links";
import type { ArticleLinkContext } from "./reference-links";

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

describe("segmentReferenceLinks", () => {
  const articles = buildArticleLinkEntries(lawNodes);

  const linkTexts = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    segmentReferenceLinks(text, { articles, ...context })
      .filter((segment) => segment.kind === "link")
      .map((segment) => segment.text);

  it.each([
    {
      name: "links an absolute article reference",
      text: "第15条の規定による。",
      context: { currentArticleNumber: "16" },
      expected: ["第15条"],
    },
    {
      name: "links an article and paragraph reference as one span",
      text: "第15条第2項の審判",
      context: { currentArticleNumber: "16" },
      expected: ["第15条第2項"],
    },
    {
      name: "links every occurrence of the same reference",
      text: "第15条及び第15条",
      context: { currentArticleNumber: "16" },
      expected: ["第15条", "第15条"],
    },
    {
      name: "links a kanji numbered reference in original text",
      text: "第十五条の規定による。",
      context: { currentArticleNumber: "16" },
      expected: ["第十五条"],
    },
    {
      name: "links the previous article",
      text: "前条の規定",
      context: { currentArticleNumber: "16" },
      expected: ["前条"],
    },
    {
      name: "links the next article",
      text: "次条の規定",
      context: { currentArticleNumber: "15" },
      expected: ["次条"],
    },
    {
      name: "links the previous paragraph",
      text: "前項の請求により",
      context: { currentArticleNumber: "15", currentParagraphNumber: "2" },
      expected: ["前項"],
    },
    {
      name: "does not link the previous article of the first article",
      text: "前条の規定",
      context: { currentArticleNumber: "15" },
      expected: [],
    },
    {
      name: "does not link the previous paragraph of the first paragraph",
      text: "前項の請求により",
      context: { currentArticleNumber: "15", currentParagraphNumber: "1" },
      expected: [],
    },
    {
      name: "does not link an article outside the law",
      text: "第900条の規定",
      context: { currentArticleNumber: "15" },
      expected: [],
    },
    {
      name: "does not link a paragraph outside the article",
      text: "第15条第9項",
      context: { currentArticleNumber: "16" },
      expected: [],
    },
    {
      name: "does not link a reference carrying a law name",
      text: "商法第15条の規定",
      context: { currentArticleNumber: "16" },
      expected: [],
    },
    {
      name: "does not link a self reference without a paragraph",
      text: "第15条の規定",
      context: { currentArticleNumber: "15" },
      expected: [],
    },
    {
      name: "does not link an item only reference",
      text: "第2号に掲げる",
      context: { currentArticleNumber: "15", currentParagraphNumber: "1" },
      expected: [],
    },
    {
      name: "does not link a reference carrying a law name outside the dictionary",
      text: "不正競争防止法第15条の規定",
      context: { currentArticleNumber: "16" },
      expected: [],
    },
    {
      name: "does not link a reference immediately after 附則",
      text: "附則第15条の規定",
      context: { currentArticleNumber: "16" },
      expected: [],
    },
    {
      name: "does not link a paragraph reference immediately after 条",
      text: "同条第2項の規定",
      context: { currentArticleNumber: "16", currentParagraphNumber: "1" },
      expected: [],
    },
    {
      name: "does not link a reference carrying a single-character law abbreviation",
      text: "商第15条の規定",
      context: { currentArticleNumber: "16" },
      expected: [],
    },
    {
      name: "does not link a reference carrying a multi-character law abbreviation",
      text: "民訴第15条の規定",
      context: { currentArticleNumber: "16" },
      expected: [],
    },
  ])("$name", ({ context, expected, text }) => {
    expect(linkTexts(text, context)).toEqual(expected);
  });

  it("keeps the surrounding text as plain segments", () => {
    expect(
      segmentReferenceLinks("前条の規定による。", { articles, currentArticleNumber: "16" }),
    ).toEqual([
      {
        kind: "link",
        text: "前条",
        target: { articleNumber: "15" },
        caption: { text: "補助開始の審判", offset: 2 },
      },
      { kind: "text", text: "の規定による。" },
    ]);
  });

  it("resolves a paragraph target for a relative paragraph reference", () => {
    expect(
      segmentReferenceLinks("前項の請求", {
        articles,
        currentArticleNumber: "15",
        currentParagraphNumber: "2",
      })[0],
    ).toEqual({
      kind: "link",
      text: "前項",
      target: { articleNumber: "15", paragraphNumber: "1" },
    });
  });

  it("places the caption right after the article part of the link text", () => {
    const [segment] = segmentReferenceLinks("第15条第2項の審判", {
      articles,
      currentArticleNumber: "16",
    });

    expect(segment).toEqual({
      kind: "link",
      text: "第15条第2項",
      target: { articleNumber: "15", paragraphNumber: "2" },
      caption: { text: "補助開始の審判", offset: 4 },
    });
  });
});
