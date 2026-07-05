import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";

import { articleAnchorId, buildLawTableOfContents } from "./lawToc";

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

  it.each([
    ["1", "article-1"],
    ["709", "article-709"],
  ])("builds an article anchor id for article %s", (articleNumber, expected) => {
    expect(articleAnchorId(articleNumber)).toBe(expected);
  });
});
