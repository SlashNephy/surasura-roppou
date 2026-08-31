import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";

import {
  buildArticleLinkEntries,
  buildHeadingLinkEntries,
  segmentReferenceLinks,
} from "./reference-links";
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

// 「前二条」「第N項」の誤リンクを識別できるようにするための専用フィクスチャ。
// 第二条を実在させ（「前二条」が第2条へ誤着地しうる状態）、第四条に項を 3 つ持たせて
// （裸の「第三項」が着地しうる状態）、修正前後で結果が変わることを保証する。
const numberedLawNodes: LawNode[] = [
  node({
    id: "chapter:1",
    type: "Chapter",
    path: "chapter:1",
    number: "1",
    title: "第一章　通則",
    children: ["article:2", "article:3", "article:4"],
  }),
  node({
    id: "article:2",
    type: "Article",
    path: "chapter:1/article:2",
    number: "2",
    title: "第二条",
    caption: "（定義）",
    children: ["article:2/paragraph:1", "article:2/paragraph:2"],
    parentId: "chapter:1",
  }),
  node({
    id: "article:2/paragraph:1",
    type: "Paragraph",
    path: "chapter:1/article:2/paragraph:1",
    number: "1",
    parentId: "article:2",
  }),
  node({
    id: "article:2/paragraph:2",
    type: "Paragraph",
    path: "chapter:1/article:2/paragraph:2",
    number: "2",
    parentId: "article:2",
  }),
  node({
    id: "article:3",
    type: "Article",
    path: "chapter:1/article:3",
    number: "3",
    title: "第三条",
    children: ["article:3/paragraph:1"],
    parentId: "chapter:1",
  }),
  node({
    id: "article:3/paragraph:1",
    type: "Paragraph",
    path: "chapter:1/article:3/paragraph:1",
    number: "1",
    parentId: "article:3",
  }),
  node({
    id: "article:4",
    type: "Article",
    path: "chapter:1/article:4",
    number: "4",
    title: "第四条",
    children: ["article:4/paragraph:1", "article:4/paragraph:2", "article:4/paragraph:3"],
    parentId: "chapter:1",
  }),
  node({
    id: "article:4/paragraph:1",
    type: "Paragraph",
    path: "chapter:1/article:4/paragraph:1",
    number: "1",
    parentId: "article:4",
  }),
  node({
    id: "article:4/paragraph:2",
    type: "Paragraph",
    path: "chapter:1/article:4/paragraph:2",
    number: "2",
    parentId: "article:4",
  }),
  node({
    id: "article:4/paragraph:3",
    type: "Paragraph",
    path: "chapter:1/article:4/paragraph:3",
    number: "3",
    parentId: "article:4",
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
  const headings = buildHeadingLinkEntries(lawNodes);

  const linkTexts = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    segmentReferenceLinks(text, { articles, headings, ...context })
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
      name: "does not link a reference carrying a law name ending in に関する法律",
      text: "行政機関の保有する情報の公開に関する法律第15条の規定",
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
  ])("$name", ({ context, expected, text }) => {
    expect(linkTexts(text, context)).toEqual(expected);
  });

  it("keeps the surrounding text as plain segments", () => {
    expect(
      segmentReferenceLinks("前条の規定による。", {
        articles,
        headings,
        currentArticleNumber: "16",
      }),
    ).toEqual([
      {
        kind: "link",
        text: "前条",
        target: { kind: "article", articleNumber: "15" },
        caption: { text: "補助開始の審判", offset: 2 },
      },
      { kind: "text", text: "の規定による。" },
    ]);
  });

  it("resolves a paragraph target for a relative paragraph reference", () => {
    expect(
      segmentReferenceLinks("前項の請求", {
        articles,
        headings,
        currentArticleNumber: "15",
        currentParagraphNumber: "2",
      })[0],
    ).toEqual({
      kind: "link",
      text: "前項",
      target: { kind: "article", articleNumber: "15", paragraphNumber: "1" },
    });
  });

  it("places the caption right after the article part of the link text", () => {
    const [segment] = segmentReferenceLinks("第15条第2項の審判", {
      articles,
      headings,
      currentArticleNumber: "16",
    });

    expect(segment).toEqual({
      kind: "link",
      text: "第15条第2項",
      target: { kind: "article", articleNumber: "15" },
      caption: { text: "補助開始の審判", offset: 4 },
    });
  });

  it("omits the paragraph from the target of a reference crossing articles", () => {
    const [segment] = segmentReferenceLinks("第15条第2項の審判", {
      articles,
      headings,
      currentArticleNumber: "16",
      currentParagraphNumber: "1",
    });

    expect(segment).toMatchObject({
      kind: "link",
      target: { kind: "article", articleNumber: "15" },
    });
    expect(segment).not.toHaveProperty("target.paragraphNumber");
  });

  it("keeps the paragraph in the target of a reference inside the current article", () => {
    const [segment] = segmentReferenceLinks("第2項の請求", {
      articles,
      headings,
      currentArticleNumber: "15",
      currentParagraphNumber: "1",
    });

    expect(segment).toEqual({
      kind: "link",
      text: "第2項",
      target: { kind: "article", articleNumber: "15", paragraphNumber: "2" },
    });
  });
});

// e-Gov API の Num 属性は枝番を "_" で表記する（例: 876_9）が、reference-parser の
// readBranches は "-" で連結する（876-9）。実データの LawNode.number はアンダースコア
// 表記のため、このフィクスチャもそれに合わせる（ハイフン表記のフィクスチャでは
// 実データで起きている不一致を再現できない）。
const branchNumberLawNodes: LawNode[] = [
  node({
    id: "chapter:1",
    type: "Chapter",
    path: "chapter:1",
    number: "1",
    title: "第一章　通則",
    children: ["article:876_9", "article:12-2"],
  }),
  node({
    id: "article:876_9",
    type: "Article",
    path: "chapter:1/article:876_9",
    number: "876_9",
    title: "第八百七十六条の九",
    caption: "（審判前の保全処分）",
    children: ["article:876_9/paragraph:1"],
    parentId: "chapter:1",
  }),
  node({
    id: "article:876_9/paragraph:1",
    type: "Paragraph",
    path: "chapter:1/article:876_9/paragraph:1",
    number: "1",
    parentId: "article:876_9",
  }),
  node({
    id: "article:12-2",
    type: "Article",
    path: "chapter:1/article:12-2",
    number: "12-2",
    title: "第十二条の二",
    parentId: "chapter:1",
  }),
];

describe("segmentReferenceLinks with branch article numbers", () => {
  const articles = buildArticleLinkEntries(branchNumberLawNodes);
  const headings = buildHeadingLinkEntries(branchNumberLawNodes);

  it("resolves an absolute reference to an underscore-formatted branch article number", () => {
    const [segment] = segmentReferenceLinks("第876条の9第1項の審判", {
      articles,
      headings,
      currentArticleNumber: "12-2",
    });

    expect(segment).toMatchObject({ kind: "link", text: "第876条の9第1項" });
    expect(segment).toHaveProperty("target.articleNumber", "876_9");
  });

  it("resolves a kanji formatted reference to an underscore-formatted branch article number", () => {
    const [segment] = segmentReferenceLinks("第八百七十六条の九の規定による。", {
      articles,
      headings,
      currentArticleNumber: "12-2",
    });

    expect(segment).toMatchObject({ kind: "link", text: "第八百七十六条の九" });
    expect(segment).toHaveProperty("target.articleNumber", "876_9");
  });

  it("still resolves a hyphen-formatted branch article number entry", () => {
    const [segment] = segmentReferenceLinks("第12条の2の規定による。", {
      articles,
      headings,
      currentArticleNumber: "876_9",
    });

    expect(segment).toMatchObject({ kind: "link", text: "第12条の2" });
    expect(segment).toHaveProperty("target.articleNumber", "12-2");
  });
});

describe("segmentReferenceLinks with a multi paragraph article", () => {
  const articles = buildArticleLinkEntries(numberedLawNodes);
  const headings = buildHeadingLinkEntries(numberedLawNodes);

  const linkTexts = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    segmentReferenceLinks(text, { articles, headings, ...context })
      .filter((segment) => segment.kind === "link")
      .map((segment) => segment.text);

  it.each([
    {
      name: "does not link the number inside 前二項",
      text: "前二項の規定は、前条の場合について準用する。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "3" },
      expected: ["前条"],
    },
    {
      name: "does not link the number inside 前三項",
      text: "前三項の規定にかかわらず、その効力を妨げない。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "3" },
      expected: [],
    },
    {
      name: "does not link the number inside 前二条",
      text: "前二条の規定により債務を負担した者",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: [],
    },
    {
      name: "does not link the number inside 次の二条",
      text: "次の二条に規定する場合を除く。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: [],
    },
    {
      name: "does not link a bare paragraph after an article scoped reference in the same sentence",
      text: "第2条第2項及び第3項の規定による。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: ["第2条第2項"],
    },
    {
      name: "does not link a bare paragraph after a relative article reference in the same sentence",
      text: "前条第1項又は第2項の規定による。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: ["前条第1項"],
    },
    {
      name: "links a bare paragraph in a sentence carrying no article scoped reference",
      text: "前項の規定は、第1項の場合には適用しない。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "2" },
      expected: ["前項", "第1項"],
    },
    {
      name: "resets the article scope at a sentence boundary",
      text: "第2条の規定による。第2項の場合はこの限りでない。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: ["第2条", "第2項"],
    },
    {
      name: "does not link a paragraph reference landing on the current paragraph itself",
      text: "第1項第3号に掲げるもの",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: [],
    },
    {
      name: "links a paragraph reference landing on another paragraph of the current article",
      text: "第3項に掲げるもの",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: ["第3項"],
    },
    {
      name: "links 前項 even after an article scoped reference earlier in the sentence",
      text: "第2条の規定は、前項の場合について準用する。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "2" },
      expected: ["第2条", "前項"],
    },
    {
      name: "links a bare numbered paragraph separated from an article scoped reference by prose",
      text: "第2条の規定は、第1項の場合には適用しない。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "2" },
      expected: ["第2条", "第1項"],
    },
    {
      name: "links a bare paragraph after the prose following an article and paragraph reference",
      text: "第2条第2項の審判を受けた者に対しては、第1項の期間内に催告する。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "3" },
      expected: ["第2条第2項", "第1項"],
    },
    {
      name: "does not link a bare paragraph listed with 、 after an article scoped reference",
      text: "第2条第1項、第2項の規定による。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "3" },
      expected: ["第2条第1項"],
    },
    {
      name: "does not link any bare paragraph of a three item list after an article scoped reference",
      text: "第2条第1項、第2項及び第3項の規定による。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: ["第2条第1項"],
    },
    {
      name: "does not link any bare paragraph of a three item list following 同条",
      text: "同条第1項、第2項及び第3項の規定による。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: [],
    },
    {
      name: "does not link a bare paragraph joined by から・まで after an article scoped reference",
      text: "第2条第1項から第3項までの規定による。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: ["第2条第1項"],
    },
    {
      name: "does not link a bare paragraph following a paragraph suppressed by 同条",
      text: "同条第2項及び第3項の規定による。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: [],
    },
    {
      name: "does not link a bare paragraph following a cross law article and paragraph reference",
      text: "商法第15条第1項及び第2項の規定による。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: ["商法第15条第1項"],
    },
  ])("$name", ({ context, expected, text }) => {
    expect(linkTexts(text, context)).toEqual(expected);
  });

  it("resolves 前項 to the preceding paragraph of the current article when preceded by an article scoped reference", () => {
    const articles = buildArticleLinkEntries(numberedLawNodes);
    const headings = buildHeadingLinkEntries(numberedLawNodes);

    expect(
      segmentReferenceLinks("第2条の規定は、前項の場合について準用する。", {
        articles,
        headings,
        currentArticleNumber: "4",
        currentParagraphNumber: "2",
      }),
    ).toEqual([
      {
        kind: "link",
        text: "第2条",
        target: { kind: "article", articleNumber: "2" },
        caption: { text: "定義", offset: 3 },
      },
      { kind: "text", text: "の規定は、" },
      {
        kind: "link",
        text: "前項",
        target: { kind: "article", articleNumber: "4", paragraphNumber: "1" },
      },
      { kind: "text", text: "の場合について準用する。" },
    ]);
  });
});

const partedLawNodes: LawNode[] = [
  node({
    id: "part:1",
    type: "Part",
    path: "part:1",
    number: "1",
    title: "第一編　総則",
    children: ["part:1/chapter:1", "part:1/chapter:2"],
  }),
  node({
    id: "part:1/chapter:1",
    type: "Chapter",
    path: "part:1/chapter:1",
    number: "1",
    title: "第一章　通則",
    parentId: "part:1",
    children: ["article:1"],
  }),
  node({
    id: "article:1",
    type: "Article",
    path: "part:1/chapter:1/article:1",
    number: "1",
    title: "第一条",
    parentId: "part:1/chapter:1",
  }),
  node({
    id: "part:1/chapter:2",
    type: "Chapter",
    path: "part:1/chapter:2",
    number: "2",
    title: "第二章　人",
    parentId: "part:1",
  }),
  node({
    id: "part:4",
    type: "Part",
    path: "part:4",
    number: "4",
    title: "第四編　親族",
    children: ["part:4/chapter:1", "part:4/chapter:2"],
  }),
  node({
    id: "part:4/chapter:1",
    type: "Chapter",
    path: "part:4/chapter:1",
    number: "1",
    title: "第一章　総則",
    parentId: "part:4",
  }),
  node({
    id: "part:4/chapter:2",
    type: "Chapter",
    path: "part:4/chapter:2",
    number: "2",
    title: "第二章　婚姻",
    parentId: "part:4",
  }),
  node({
    id: "supplementary:1",
    type: "SupplementaryProvision",
    path: "supplementary-provision:1",
    title: "附　則",
    children: ["supplementary:1/chapter:1"],
  }),
  node({
    id: "supplementary:1/chapter:1",
    type: "Chapter",
    path: "supplementary-provision:1/chapter:1",
    number: "1",
    title: "第一章　経過措置",
    parentId: "supplementary:1",
  }),
];

// 編を持たない法令（日本国憲法など）。章番号だけで一意になる。
const chapterOnlyLawNodes: LawNode[] = [
  node({
    id: "chapter:1",
    type: "Chapter",
    path: "chapter:1",
    number: "1",
    title: "第一章　天皇",
  }),
  node({
    id: "chapter:3",
    type: "Chapter",
    path: "chapter:3",
    number: "3",
    title: "第三章　国民の権利及び義務",
  }),
];

describe("buildHeadingLinkEntries", () => {
  it("collects parts and chapters in document order", () => {
    expect(buildHeadingLinkEntries(partedLawNodes)).toEqual([
      { partNumber: "1", anchorId: "pt1" },
      { partNumber: "1", chapterNumber: "1", anchorId: "pt1-ch1" },
      { partNumber: "1", chapterNumber: "2", anchorId: "pt1-ch2" },
      { partNumber: "4", anchorId: "pt4" },
      { partNumber: "4", chapterNumber: "1", anchorId: "pt4-ch1" },
      { partNumber: "4", chapterNumber: "2", anchorId: "pt4-ch2" },
    ]);
  });

  it("omits chapters inside supplementary provisions", () => {
    expect(buildHeadingLinkEntries(partedLawNodes).map((entry) => entry.anchorId)).not.toContain(
      "ch1",
    );
  });

  it("keeps the part number out of the anchor id for a law without parts", () => {
    expect(buildHeadingLinkEntries(chapterOnlyLawNodes)).toEqual([
      { chapterNumber: "1", anchorId: "ch1" },
      { chapterNumber: "3", anchorId: "ch3" },
    ]);
  });
});

describe("segmentReferenceLinks for part and chapter references", () => {
  const articles = buildArticleLinkEntries(partedLawNodes);
  const headings = buildHeadingLinkEntries(partedLawNodes);

  const firstSegment = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    segmentReferenceLinks(text, { articles, headings, ...context })[0];

  it("links a part reference to the part heading anchor", () => {
    expect(firstSegment("第4編（親族）の規定に従い", { currentPartNumber: "1" })).toEqual({
      kind: "link",
      text: "第4編",
      target: { kind: "heading", anchorId: "pt4" },
    });
  });

  it("resolves a bare chapter reference within the current part", () => {
    expect(
      firstSegment("第2章の規定", { currentPartNumber: "4", currentChapterNumber: "1" }),
    ).toMatchObject({ target: { kind: "heading", anchorId: "pt4-ch2" } });
  });

  it("resolves a chapter reference qualified by a part as a single link", () => {
    expect(firstSegment("第一編第二章の規定", { currentPartNumber: "4" })).toEqual({
      kind: "link",
      text: "第一編第二章",
      target: { kind: "heading", anchorId: "pt1-ch2" },
    });
  });

  it("resolves 前章 to the preceding chapter in document order", () => {
    expect(
      firstSegment("前章の規定", { currentPartNumber: "4", currentChapterNumber: "2" }),
    ).toMatchObject({ target: { kind: "heading", anchorId: "pt4-ch1" } });
  });

  it("resolves 次編 to the following part", () => {
    expect(firstSegment("次編の規定", { currentPartNumber: "1" })).toMatchObject({
      target: { kind: "heading", anchorId: "pt4" },
    });
  });

  it("does not link a chapter reference with no matching heading", () => {
    expect(firstSegment("第9章の規定", { currentPartNumber: "4" })).toEqual({
      kind: "text",
      text: "第9章の規定",
    });
  });

  it("does not link a chapter of another law named outside the alias dictionary", () => {
    expect(
      segmentReferenceLinks("国際連合憲章第7章の措置", { articles, headings }).every(
        (segment) => segment.kind === "text",
      ),
    ).toBe(true);
  });

  it("lands on the article when a reference names a part, a chapter and an article", () => {
    expect(firstSegment("第一編第一章第一条の規定", { currentArticleNumber: "2" })).toMatchObject({
      text: "第一編第一章第一条",
      target: { kind: "article", articleNumber: "1" },
    });
  });

  it("keeps a bare paragraph reference scoped to the current article after a part reference", () => {
    const links = segmentReferenceLinks("第4編の規定により、第2項の請求をする。", {
      articles: [{ articleNumber: "1", paragraphNumbers: ["1", "2"] }],
      headings,
      currentArticleNumber: "1",
      currentParagraphNumber: "1",
    }).filter((segment) => segment.kind === "link");

    expect(links).toEqual([
      { kind: "link", text: "第4編", target: { kind: "heading", anchorId: "pt4" } },
      {
        kind: "link",
        text: "第2項",
        target: { kind: "article", articleNumber: "1", paragraphNumber: "2" },
      },
    ]);
  });
});

describe("segmentReferenceLinks for a law without parts", () => {
  const articles = buildArticleLinkEntries(chapterOnlyLawNodes);
  const headings = buildHeadingLinkEntries(chapterOnlyLawNodes);

  it("resolves a chapter reference without a part context", () => {
    expect(segmentReferenceLinks("第3章の規定", { articles, headings })[0]).toEqual({
      kind: "link",
      text: "第3章",
      target: { kind: "heading", anchorId: "ch3" },
    });
  });
});

describe("segmentReferenceLinks at the boundaries of the heading order", () => {
  const articles = buildArticleLinkEntries(partedLawNodes);
  const headings = buildHeadingLinkEntries(partedLawNodes);

  it("does not link 前編 in the first part", () => {
    expect(
      segmentReferenceLinks("前編の規定", { articles, headings, currentPartNumber: "1" }),
    ).toEqual([{ kind: "text", text: "前編の規定" }]);
  });

  it("does not link 次章 in the last chapter of the law", () => {
    expect(
      segmentReferenceLinks("次章の規定", {
        articles,
        headings,
        currentPartNumber: "4",
        currentChapterNumber: "2",
      }),
    ).toEqual([{ kind: "text", text: "次章の規定" }]);
  });
});

describe("segmentReferenceLinks for cross law references", () => {
  const articles = buildArticleLinkEntries(lawNodes);
  const headings = buildHeadingLinkEntries(lawNodes);

  const links = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    segmentReferenceLinks(text, { articles, headings, ...context }).filter(
      (segment) => segment.kind === "link",
    );

  it.each([
    {
      name: "links a reference carrying an official law name",
      text: "商法第15条の規定",
      expected: [
        {
          text: "商法第15条",
          target: { kind: "article", lawId: "132AC0000000048", articleNumber: "15" },
        },
      ],
    },
    {
      name: "keeps the paragraph and the item on a cross law target",
      text: "商法第15条第2項第3号の規定",
      expected: [
        {
          text: "商法第15条第2項第3号",
          target: {
            kind: "article",
            lawId: "132AC0000000048",
            articleNumber: "15",
            paragraphNumber: "2",
            itemNumber: "3",
          },
        },
      ],
    },
    {
      name: "links a branch article of another law",
      text: "商法第15条の2の規定",
      expected: [
        {
          text: "商法第15条の2",
          target: { kind: "article", lawId: "132AC0000000048", articleNumber: "15-2" },
        },
      ],
    },
    {
      name: "links a cabinet order outside the dictionary through its law number",
      text: "労働基準法施行令（昭和二十二年政令第二十一号）第1条の規定",
      expected: [
        {
          text: "労働基準法施行令（昭和二十二年政令第二十一号）第1条",
          target: { kind: "article", lawId: "322CO0000000021", articleNumber: "1" },
        },
      ],
    },
  ])("$name", ({ expected, text }) => {
    expect(links(text, { currentArticleNumber: "16" })).toEqual(
      expected.map((link) => ({ kind: "link", ...link })),
    );
  });

  const noLinkTexts = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    segmentReferenceLinks(text, { articles, headings, ...context })
      .filter((segment) => segment.kind === "link")
      .map((segment) => segment.text);

  it.each([
    {
      name: "does not link the current law article when an act outside the dictionary carries a law number",
      text: "原子力災害対策特別措置法（平成11年法律第156号）第15条の規定",
    },
    {
      name: "does not link an act outside the dictionary without a law number",
      text: "不正競争防止法第15条の規定",
    },
    {
      name: "does not link a law name matched only by an abbreviation",
      text: "民訴第15条の規定",
    },
    {
      name: "does not link a law name prefixed by a kanji",
      text: "旧商法第15条の規定",
    },
    {
      name: "does not link a relative reference carrying a law name",
      text: "商法前条の規定",
    },
  ])("$name", ({ text }) => {
    expect(noLinkTexts(text, { currentArticleNumber: "16" })).toEqual([]);
  });

  it("does not link a bare article enumerated after 同法", () => {
    // 同法は直前に名指しした法令を指すため、列挙で続く裸の条もその法令の条を指す。
    // 現在の法令の条へ解決してはならない。
    expect(noLinkTexts("同法第798条及び第15条の規定", { currentArticleNumber: "16" })).toEqual([]);
  });

  it("keeps a bare paragraph reference out of the current article after a cross law reference", () => {
    expect(noLinkTexts("商法第15条第1項及び第2項の規定", { currentArticleNumber: "16" })).toEqual([
      "商法第15条第1項",
    ]);
  });

  it("does not extend the cross law span over the preceding link", () => {
    expect(
      noLinkTexts("第15条及び労働基準法施行令（昭和二十二年政令第二十一号）第1条", {
        currentArticleNumber: "16",
      }),
    ).toEqual(["第15条", "労働基準法施行令（昭和二十二年政令第二十一号）第1条"]);
  });

  it("does not swallow a reference that failed to link into a following cross law link", () => {
    // 「不正競争防止法第15条」は辞書外かつ法令番号を伴わないためリンクにならない。
    // このリンク化されなかった参照を、後続の政令へのリンクが飲み込んではならない。
    expect(
      noLinkTexts("不正競争防止法第15条及び労働基準法施行令（昭和二十二年政令第二十一号）第1条", {
        currentArticleNumber: "16",
      }),
    ).toEqual(["労働基準法施行令（昭和二十二年政令第二十一号）第1条"]);
  });
});

describe("segmentReferenceLinks for bare articles enumerated after a cross law reference", () => {
  const articles = buildArticleLinkEntries(numberedLawNodes);
  const headings = buildHeadingLinkEntries(numberedLawNodes);

  const linkTexts = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    segmentReferenceLinks(text, { articles, headings, ...context })
      .filter((segment) => segment.kind === "link")
      .map((segment) => segment.text);

  it.each([
    {
      name: "does not link a bare article enumerated after a cross law reference",
      text: "商法第798条及び第2条の規定",
      expected: ["商法第798条"],
    },
    {
      name: "does not link any bare article in a list opened by a cross law reference",
      text: "商法第798条、第2条及び第3条の規定",
      expected: ["商法第798条"],
    },
    {
      name: "does not link a bare article enumerated after a law name outside the dictionary",
      text: "不正競争防止法第798条及び第2条の規定",
      expected: [],
    },
    {
      name: "still links bare articles enumerated without a law name",
      text: "第2条及び第3条の規定",
      expected: ["第2条", "第3条"],
    },
    {
      name: "still links a bare article separated from a cross law reference by prose",
      text: "商法第798条の規定により、第2条の規定は適用しない。",
      expected: ["商法第798条", "第2条"],
    },
    {
      name: "still links a bare article enumerated after 同条",
      text: "同条及び第2条の規定",
      expected: ["第2条"],
    },
    {
      name: "starts a new sentence scope after a cross law reference",
      text: "商法第798条の規定。第2条及び第3条の規定",
      expected: ["商法第798条", "第2条", "第3条"],
    },
  ])("$name", ({ expected, text }) => {
    expect(linkTexts(text, { currentArticleNumber: "4" })).toEqual(expected);
  });
});

describe("segmentReferenceLinks for 同 references", () => {
  const articles = buildArticleLinkEntries(numberedLawNodes);
  const headings = buildHeadingLinkEntries(numberedLawNodes);

  const links = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    segmentReferenceLinks(text, { articles, headings, ...context }).filter(
      (segment) => segment.kind === "link",
    );

  const linkTexts = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    links(text, context).map((segment) => segment.text);

  it.each([
    {
      name: "resolves 同条 to the article named earlier in the sentence",
      text: "第2条第1項の規定による宣言があった時から同条第2項の規定による解除まで",
      context: { currentArticleNumber: "4" },
      expected: [
        {
          kind: "link",
          text: "第2条第1項",
          target: { kind: "article", articleNumber: "2" },
          caption: { text: "定義", offset: 3 },
        },
        { kind: "link", text: "同条第2項", target: { kind: "article", articleNumber: "2" } },
      ],
    },
    {
      name: "resolves 同項 to the paragraph named earlier, not to the nearest article",
      // 「第3条」は項を名指ししていないため先行詞にならない。同項は第2条第1項を指す。
      text: "第2条第1項の許可（第3条の規定により読み替えて適用される同項の承認を含む。）",
      context: { currentArticleNumber: "4" },
      expected: [
        {
          kind: "link",
          text: "第2条第1項",
          target: { kind: "article", articleNumber: "2" },
          caption: { text: "定義", offset: 3 },
        },
        { kind: "link", text: "第3条", target: { kind: "article", articleNumber: "3" } },
        { kind: "link", text: "同項", target: { kind: "article", articleNumber: "2" } },
      ],
    },
    {
      name: "resolves 同項 through a relative article reference",
      text: "前条第1項の計画に従い、同項に規定する業務を行う",
      context: { currentArticleNumber: "3" },
      expected: [
        {
          kind: "link",
          text: "前条第1項",
          target: { kind: "article", articleNumber: "2" },
          caption: { text: "定義", offset: 2 },
        },
        { kind: "link", text: "同項", target: { kind: "article", articleNumber: "2" } },
      ],
    },
    {
      name: "resolves 同項 to the other law named earlier in the sentence",
      text: "商法第798条第1項の規定により、同項に規定する者は",
      context: { currentArticleNumber: "4" },
      expected: [
        {
          kind: "link",
          text: "商法第798条第1項",
          target: {
            kind: "article",
            lawId: "132AC0000000048",
            articleNumber: "798",
            paragraphNumber: "1",
          },
        },
        {
          kind: "link",
          text: "同項",
          target: {
            kind: "article",
            lawId: "132AC0000000048",
            articleNumber: "798",
            paragraphNumber: "1",
          },
        },
      ],
    },
    {
      name: "resolves 同法 with an article to the law named earlier in the sentence",
      text: "商法第798条の規定に基づき同法第15条に規定する",
      context: { currentArticleNumber: "4" },
      expected: [
        {
          kind: "link",
          text: "商法第798条",
          target: { kind: "article", lawId: "132AC0000000048", articleNumber: "798" },
        },
        {
          kind: "link",
          text: "同法第15条",
          target: { kind: "article", lawId: "132AC0000000048", articleNumber: "15" },
        },
      ],
    },
    {
      name: "resolves 同号 to the article and paragraph named earlier (item is not tracked for self-law targets)",
      // 自法令経路では itemNumber が resolveTarget に渡らないため、同号は項レベルで
      // 着地する（第1号と第2号を区別しない）。挙動を変えず、現状を固定するテスト。
      text: "第2条第1項第1号の規定（同号の要件を満たすとき）",
      context: { currentArticleNumber: "2", currentParagraphNumber: "2" },
      expected: [
        {
          kind: "link",
          text: "第2条第1項第1号",
          target: { kind: "article", articleNumber: "2", paragraphNumber: "1" },
        },
        {
          kind: "link",
          text: "同号",
          target: { kind: "article", articleNumber: "2", paragraphNumber: "1" },
        },
      ],
    },
    {
      name: "resolves 同条第2項 to a paragraph in the current article, whose bare article reference lands on the current position",
      // 「第2条」は現在位置（第2条第1項）そのものへ着地するためリンクにならないが、
      // 条自体は実在するため先行詞としては有効。同条第2項は同じ条の別の項なので
      // ページ内アンカーへ着地できる（#278 finding 1 の回帰）。
      text: "第2条の規定により同条第2項の規定を適用する",
      context: { currentArticleNumber: "2", currentParagraphNumber: "1" },
      expected: [
        {
          kind: "link",
          text: "同条第2項",
          target: { kind: "article", articleNumber: "2", paragraphNumber: "2" },
        },
      ],
    },
  ])("$name", ({ context, expected, text }) => {
    expect(links(text, context)).toEqual(expected);
  });

  it.each([
    {
      name: "does not link 同項 whose antecedent is an unresolvable law",
      // 「規制法」は辞書外で法令番号も伴わないため解決できない。
      // 同項が自法令の第1項へ落ちてはならない。
      text: "規制法第2条第1項の許可（規制法第3条により読み替えて適用される同項の承認）",
      expected: [],
    },
    {
      name: "does not link 同条 with no antecedent",
      text: "同条第2項の規定",
      expected: [],
    },
    {
      name: "does not link 同項 with no antecedent",
      text: "同項に規定する",
      expected: [],
    },
    {
      name: "does not link a bare 同法",
      text: "商法第798条の規定及び同法の規定",
      expected: ["商法第798条"],
    },
    {
      name: "drops the antecedent at a sentence boundary",
      text: "第2条第1項の規定による。同項に規定する者は",
      expected: ["第2条第1項"],
    },
    {
      name: "does not link 同条 to an article suppressed as part of a cross-law enumeration",
      // 「第15条」は商法の列挙として抑止される。記録しないと、同条が
      // 抑止された第15条ではなく先行の第798条へ誤って結び付いてしまう。
      text: "商法第798条及び第15条の規定に基づき同条の規定を準用する",
      expected: ["商法第798条"],
    },
    {
      name: "does not let an unresolved self-law reference leave a stale antecedent",
      // 「第2条第99項」は存在しない項のため解決できない。記録しないと、同項が
      // 前方の第2条第1項へ誤って結び付いてしまう。
      text: "第2条第1項の規定による許可（第2条第99項の規定により読み替えて適用される同項の承認を含む。）",
      expected: ["第2条第1項"],
    },
    {
      name: "does not let an unresolved 同条 reference leave a stale paragraph antecedent",
      // 「同条第99項」は存在しない項のため解決できない。無効化しないと、同項が
      // 前方の第2条第1項へ誤って結び付いてしまう。
      text: "第2条第1項の規定による許可（同条第99項の規定により読み替えて適用される同項の承認を含む。）",
      expected: ["第2条第1項"],
    },
    {
      name: "does not link 同条第2項 whose antecedent article does not exist",
      // 「第99条」はフィクスチャに実在しないため、同条は先行詞として解決できない。
      text: "第99条の規定により同条第2項の規定を適用する",
      expected: [],
    },
  ])("$name", ({ expected, text }) => {
    expect(linkTexts(text, { currentArticleNumber: "4" })).toEqual(expected);
  });
});

describe("segmentReferenceLinks with resolved law numbers", () => {
  const articles = buildArticleLinkEntries(lawNodes);
  const headings = buildHeadingLinkEntries(lawNodes);

  const linkTexts = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    segmentReferenceLinks(text, { articles, headings, ...context })
      .filter((segment) => segment.kind === "link")
      .map((segment) => segment.text);

  const lawIdByLawNumber = new Map([["Heisei/11/法律/156", "411AC0000000156"]]);

  it("links an act once its law number is resolved", () => {
    expect(
      segmentReferenceLinks("原子力災害対策特別措置法（平成11年法律第156号）第2条の規定", {
        articles,
        headings,
        currentArticleNumber: "16",
        lawIdByLawNumber,
      }).filter((segment) => segment.kind === "link"),
    ).toEqual([
      {
        kind: "link",
        text: "原子力災害対策特別措置法（平成11年法律第156号）第2条",
        target: { kind: "article", lawId: "411AC0000000156", articleNumber: "2" },
      },
    ]);
  });

  it("keeps the act unlinked without the resolved law number", () => {
    expect(
      linkTexts("原子力災害対策特別措置法（平成11年法律第156号）第2条の規定", {
        currentArticleNumber: "16",
      }),
    ).toEqual([]);
  });
});
