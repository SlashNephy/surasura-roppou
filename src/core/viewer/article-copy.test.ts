import { describe, expect, it } from "vitest";

import type { Law, LawNode, LawRevision } from "@/core/domain";

import { buildArticleCopyText } from "./article-copy";

const law = {
  lawId: "129AC0000000089",
  title: "民法",
  lawNumber: "明治二十九年法律第八十九号",
  aliases: [],
  source: "egov",
} satisfies Law;

const revision = {
  lawId: law.lawId,
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  fetchedAt: "2026-07-05T00:00:00.000Z",
} satisfies LawRevision;

const article = {
  id: "article:1",
  lawId: law.lawId,
  revisionId: revision.revisionId,
  type: "Article",
  path: "article:1",
  number: "1",
  title: "第一条",
  rawText: "第一条　私権は、公共の福祉に適合しなければならない。",
  plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
  children: [],
} satisfies LawNode;

describe("buildArticleCopyText", () => {
  it.each([
    ["original", "第一条　私権は、公共の福祉に適合しなければならない。"],
    ["readable", "第1条 私権は、公共の福祉に適合しなければならない。"],
    [
      "source",
      [
        "第一条　私権は、公共の福祉に適合しなければならない。",
        "",
        "出典: 民法 第一条（e-Gov 法令検索、取得日: 2026-07-05）",
        "https://example.test/laws/129AC0000000089/articles/1",
      ].join("\n"),
    ],
    [
      "markdown",
      [
        "> 第一条　私権は、公共の福祉に適合しなければならない。",
        "",
        "[民法 第一条](https://example.test/laws/129AC0000000089/articles/1)",
      ].join("\n"),
    ],
    ["url", "https://example.test/laws/129AC0000000089/articles/1"],
  ] as const)("builds %s copy text", (format, expected) => {
    expect(
      buildArticleCopyText({ article, baseUrl: "https://example.test", format, law, revision }),
    ).toBe(expected);
  });

  it("uses the law URL when an article number is unavailable", () => {
    expect(
      buildArticleCopyText({
        article: { ...article, number: undefined },
        baseUrl: "https://example.test",
        format: "url",
        law,
        revision,
      }),
    ).toBe("https://example.test/laws/129AC0000000089");
  });
});
