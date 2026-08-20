import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";

import {
  allowsArticleUrlTargets,
  articleAnchorId,
  chapterAnchorId,
  buildLawTableOfContents,
  computeChildArticleContext,
  paragraphAnchorId,
  partAnchorId,
} from "./lawToc";

const node = (overrides: Partial<LawNode> & Pick<LawNode, "id" | "path" | "type">): LawNode => ({
  lawId: "129AC0000000089",
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  rawText: "",
  plainText: "",
  children: [],
  ...overrides,
});

describe("lawToc", () => {
  it("builds a nested table of contents from heading and article nodes", () => {
    const toc = buildLawTableOfContents([
      node({
        id: "part:1",
        type: "Part",
        path: "part:1",
        title: "第一編　総則",
        children: ["chapter:1"],
      }),
      node({
        id: "chapter:1",
        type: "Chapter",
        path: "part:1/chapter:1",
        title: "第一章　通則",
        parentId: "part:1",
        children: ["article:1", "paragraph:ignored"],
      }),
      node({
        id: "article:1",
        type: "Article",
        path: "part:1/chapter:1/article:1",
        number: "1",
        title: "第一条",
        parentId: "chapter:1",
      }),
      node({
        id: "paragraph:ignored",
        type: "Paragraph",
        path: "part:1/chapter:1/paragraph:ignored",
        plainText: "目次には出さない本文。",
        parentId: "chapter:1",
      }),
    ]);

    expect(toc).toEqual([
      {
        id: "part:1",
        title: "第一編　総則",
        type: "Part",
        depth: 1,
        children: [
          {
            id: "chapter:1",
            title: "第一章　通則",
            type: "Chapter",
            depth: 2,
            children: [
              {
                id: "article:1",
                title: "第一条",
                type: "Article",
                depth: 3,
                articleNumber: "1",
                children: [],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("only exposes article numbers for URL-addressable main body articles", () => {
    const toc = buildLawTableOfContents([
      node({
        id: "article:1",
        type: "Article",
        path: "article:1",
        number: "1",
        title: "第一条",
      }),
      node({
        id: "supplementary:1",
        type: "SupplementaryProvision",
        path: "supplementary-provision:1",
        title: "附　則",
        children: ["supplementary:article:1"],
      }),
      node({
        id: "supplementary:article:1",
        type: "Article",
        path: "supplementary-provision:1/article:1",
        number: "1",
        title: "第一条",
        parentId: "supplementary:1",
      }),
    ]);

    expect(toc).toEqual([
      {
        id: "article:1",
        title: "第一条",
        type: "Article",
        depth: 1,
        articleNumber: "1",
        children: [],
      },
      {
        id: "supplementary:1",
        title: "附　則",
        type: "SupplementaryProvision",
        depth: 1,
        children: [
          {
            id: "supplementary:article:1",
            title: "第一条",
            type: "Article",
            depth: 2,
            children: [],
          },
        ],
      },
    ]);
  });

  it("includes an article caption in the table of contents item", () => {
    const toc = buildLawTableOfContents([
      node({
        id: "article:264",
        type: "Article",
        path: "article:264",
        number: "264",
        title: "第二百六十四条",
        caption: "（親告罪）",
      }),
    ]);

    expect(toc).toEqual([
      {
        id: "article:264",
        title: "第二百六十四条",
        caption: "（親告罪）",
        type: "Article",
        depth: 1,
        articleNumber: "264",
        children: [],
      },
    ]);
  });

  it.each([
    {
      name: "returns an empty table of contents for empty input",
      nodes: [],
      expected: [],
    },
    {
      name: "keeps flattened depth when a non-TOC node contains an article",
      nodes: [
        node({
          id: "paragraph:1",
          type: "Paragraph",
          path: "paragraph:1",
          children: ["article:1"],
        }),
        node({
          id: "article:1",
          type: "Article",
          path: "paragraph:1/article:1",
          number: "1",
          title: "第一条",
          parentId: "paragraph:1",
        }),
      ],
      expected: [
        {
          id: "article:1",
          title: "第一条",
          type: "Article",
          depth: 1,
          articleNumber: "1",
          children: [],
        },
      ],
    },
    {
      name: "keeps child depth relative to emitted TOC nodes only",
      nodes: [
        node({
          id: "chapter:1",
          type: "Chapter",
          path: "chapter:1",
          title: "第一章",
          children: ["paragraph:1"],
        }),
        node({
          id: "paragraph:1",
          type: "Paragraph",
          path: "chapter:1/paragraph:1",
          parentId: "chapter:1",
          children: ["article:1"],
        }),
        node({
          id: "article:1",
          type: "Article",
          path: "chapter:1/paragraph:1/article:1",
          number: "1",
          title: "第一条",
          parentId: "paragraph:1",
        }),
      ],
      expected: [
        {
          id: "chapter:1",
          title: "第一章",
          type: "Chapter",
          depth: 1,
          children: [
            {
              id: "article:1",
              title: "第一条",
              type: "Article",
              depth: 2,
              articleNumber: "1",
              children: [],
            },
          ],
        },
      ],
    },
  ] satisfies {
    name: string;
    nodes: LawNode[];
    expected: ReturnType<typeof buildLawTableOfContents>;
  }[])("$name", ({ expected, nodes }) => {
    expect(buildLawTableOfContents(nodes)).toEqual(expected);
  });

  it.each([
    ["1", "a1"],
    ["709", "a709"],
    ["798-2", "a798-2"],
  ])("builds an article anchor id for article %s", (articleNumber, expected) => {
    expect(articleAnchorId(articleNumber)).toBe(expected);
  });

  it.each([
    ["15", "2", "a15-p2"],
    ["798-2", "1", "a798-2-p1"],
  ])(
    "builds a paragraph anchor id for article %s paragraph %s",
    (articleNumber, paragraphNumber, expected) => {
      expect(paragraphAnchorId(articleNumber, paragraphNumber)).toBe(expected);
    },
  );

  it.each([
    ["1", "pt1"],
    ["4", "pt4"],
  ])("builds a part anchor id for part %s", (partNumber, expected) => {
    expect(partAnchorId(partNumber)).toBe(expected);
  });

  it.each([
    // 章番号は編ごとにリセットするため、編を持つ法令では編番号まで含めて一意にする。
    ["4", "2", "pt4-ch2"],
    [undefined, "2", "ch2"],
  ])("builds a chapter anchor id for part %s chapter %s", (partNumber, chapterNumber, expected) => {
    expect(chapterAnchorId(partNumber, chapterNumber)).toBe(expected);
  });

  it.each([
    ["Part", true],
    ["Chapter", true],
    ["Article", true],
    ["SupplementaryProvision", false],
    ["AppdxTable", false],
    ["AppdxStyle", false],
  ] satisfies [LawNode["type"], boolean][])(
    "returns whether %s allows article URL targets",
    (nodeType, expected) => {
      expect(allowsArticleUrlTargets(nodeType)).toBe(expected);
    },
  );

  it.each([
    [true, "Part", true],
    [true, "SupplementaryProvision", false],
    [false, "Part", false],
  ] satisfies [boolean, LawNode["type"], boolean][])(
    "computes child article context from parent context %s and node type %s",
    (parentContext, nodeType, expected) => {
      expect(computeChildArticleContext(parentContext, nodeType)).toBe(expected);
    },
  );
});
