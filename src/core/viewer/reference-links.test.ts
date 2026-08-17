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
      target: { articleNumber: "15" },
      caption: { text: "補助開始の審判", offset: 4 },
    });
  });

  it("omits the paragraph from the target of a reference crossing articles", () => {
    const [segment] = segmentReferenceLinks("第15条第2項の審判", {
      articles,
      currentArticleNumber: "16",
      currentParagraphNumber: "1",
    });

    expect(segment).toMatchObject({ kind: "link", target: { articleNumber: "15" } });
    expect(segment).not.toHaveProperty("target.paragraphNumber");
  });

  it("keeps the paragraph in the target of a reference inside the current article", () => {
    const [segment] = segmentReferenceLinks("第2項の請求", {
      articles,
      currentArticleNumber: "15",
      currentParagraphNumber: "1",
    });

    expect(segment).toEqual({
      kind: "link",
      text: "第2項",
      target: { articleNumber: "15", paragraphNumber: "2" },
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

  it("resolves an absolute reference to an underscore-formatted branch article number", () => {
    const [segment] = segmentReferenceLinks("第876条の9第1項の審判", {
      articles,
      currentArticleNumber: "12-2",
    });

    expect(segment).toMatchObject({ kind: "link", text: "第876条の9第1項" });
    expect(segment).toHaveProperty("target.articleNumber", "876_9");
  });

  it("resolves a kanji formatted reference to an underscore-formatted branch article number", () => {
    const [segment] = segmentReferenceLinks("第八百七十六条の九の規定による。", {
      articles,
      currentArticleNumber: "12-2",
    });

    expect(segment).toMatchObject({ kind: "link", text: "第八百七十六条の九" });
    expect(segment).toHaveProperty("target.articleNumber", "876_9");
  });

  it("still resolves a hyphen-formatted branch article number entry", () => {
    const [segment] = segmentReferenceLinks("第12条の2の規定による。", {
      articles,
      currentArticleNumber: "876_9",
    });

    expect(segment).toMatchObject({ kind: "link", text: "第12条の2" });
    expect(segment).toHaveProperty("target.articleNumber", "12-2");
  });
});

describe("segmentReferenceLinks with a multi paragraph article", () => {
  const articles = buildArticleLinkEntries(numberedLawNodes);

  const linkTexts = (text: string, context: Partial<ArticleLinkContext> = {}) =>
    segmentReferenceLinks(text, { articles, ...context })
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
      name: "does not link a bare paragraph following an article and paragraph suppressed by a law name",
      text: "商法第15条第1項及び第2項の規定による。",
      context: { currentArticleNumber: "4", currentParagraphNumber: "1" },
      expected: [],
    },
  ])("$name", ({ context, expected, text }) => {
    expect(linkTexts(text, context)).toEqual(expected);
  });

  it("resolves 前項 to the preceding paragraph of the current article when preceded by an article scoped reference", () => {
    const articles = buildArticleLinkEntries(numberedLawNodes);

    expect(
      segmentReferenceLinks("第2条の規定は、前項の場合について準用する。", {
        articles,
        currentArticleNumber: "4",
        currentParagraphNumber: "2",
      }),
    ).toEqual([
      {
        kind: "link",
        text: "第2条",
        target: { articleNumber: "2" },
        caption: { text: "定義", offset: 3 },
      },
      { kind: "text", text: "の規定は、" },
      {
        kind: "link",
        text: "前項",
        target: { articleNumber: "4", paragraphNumber: "1" },
      },
      { kind: "text", text: "の場合について準用する。" },
    ]);
  });
});
