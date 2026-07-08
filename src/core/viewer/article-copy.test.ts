import { describe, expect, it } from "vitest";

import type { Law, LawNode } from "@/core/domain";

import { buildArticleCopyText } from "./article-copy";

const law = {
  lawId: "129AC0000000089",
  title: "民法",
  lawNumber: "明治二十九年法律第八十九号",
  aliases: [],
  source: "egov",
} satisfies Law;

const node = (overrides: Partial<LawNode> & Pick<LawNode, "id" | "path" | "type">): LawNode => ({
  lawId: law.lawId,
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  rawText: "",
  plainText: "",
  children: [],
  ...overrides,
});

const article = node({
  id: "article:5",
  type: "Article",
  path: "part:1/chapter:2/article:5",
  number: "5",
  title: "第五条",
  caption: "（未成年者の法律行為）",
  rawText:
    "第五条（未成年者の法律行為）未成年者が法律行為をするには、その法定代理人の同意を得なければならない。ただし、単に権利を得、又は義務を免れる法律行為については、この限りでない。２前項の規定に反する法律行為は、取り消すことができる。３第一項の規定にかかわらず、法定代理人が目的を定めて処分を許した財産は、その目的の範囲内において、未成年者が自由に処分することができる。目的を定めないで処分を許した財産を処分するときも、同様とする。",
  plainText:
    "第五条（未成年者の法律行為） 未成年者が法律行為をするには、その法定代理人の同意を得なければならない。ただし、単に権利を得、又は義務を免れる法律行為については、この限りでない。 ２ 前項の規定に反する法律行為は、取り消すことができる。 ３ 第一項の規定にかかわらず、法定代理人が目的を定めて処分を許した財産は、その目的の範囲内において、未成年者が自由に処分することができる。目的を定めないで処分を許した財産を処分するときも、同様とする。",
  children: ["paragraph:5-1", "paragraph:5-2", "paragraph:5-3"],
});

const paragraph1 = node({
  id: "paragraph:5-1",
  type: "Paragraph",
  path: "part:1/chapter:2/article:5/paragraph:1",
  number: "1",
  rawText:
    "未成年者が法律行為をするには、その法定代理人の同意を得なければならない。ただし、単に権利を得、又は義務を免れる法律行為については、この限りでない。",
  plainText:
    "未成年者が法律行為をするには、その法定代理人の同意を得なければならない。ただし、単に権利を得、又は義務を免れる法律行為については、この限りでない。",
  parentId: article.id,
});

const paragraph2 = node({
  id: "paragraph:5-2",
  type: "Paragraph",
  path: "part:1/chapter:2/article:5/paragraph:2",
  number: "2",
  rawText: "２　前項の規定に反する法律行為は、取り消すことができる。",
  plainText: "２ 前項の規定に反する法律行為は、取り消すことができる。",
  parentId: article.id,
});

const paragraph3 = node({
  id: "paragraph:5-3",
  type: "Paragraph",
  path: "part:1/chapter:2/article:5/paragraph:3",
  number: "3",
  rawText:
    "３　第一項の規定にかかわらず、法定代理人が目的を定めて処分を許した財産は、その目的の範囲内において、未成年者が自由に処分することができる。目的を定めないで処分を許した財産を処分するときも、同様とする。",
  plainText:
    "３ 第一項の規定にかかわらず、法定代理人が目的を定めて処分を許した財産は、その目的の範囲内において、未成年者が自由に処分することができる。目的を定めないで処分を許した財産を処分するときも、同様とする。",
  parentId: article.id,
});

describe("buildArticleCopyText", () => {
  it("builds the unified article copy format", () => {
    expect(
      buildArticleCopyText({
        article,
        baseUrl: "http://localhost:5173",
        law,
        nodes: [article, paragraph1, paragraph2, paragraph3],
      }),
    ).toBe(
      [
        "第五条（未成年者の法律行為）",
        "",
        "未成年者が法律行為をするには、その法定代理人の同意を得なければならない。ただし、単に権利を得、又は義務を免れる法律行為については、この限りでない。",
        "２ 前項の規定に反する法律行為は、取り消すことができる。",
        "３ 第一項の規定にかかわらず、法定代理人が目的を定めて処分を許した財産は、その目的の範囲内において、未成年者が自由に処分することができる。目的を定めないで処分を許した財産を処分するときも、同様とする。",
        "",
        "http://localhost:5173/laws/129AC0000000089/articles/5",
      ].join("\n"),
    );
  });

  it("uses the law URL when an article number is unavailable", () => {
    expect(
      buildArticleCopyText({
        article: { ...article, number: undefined },
        baseUrl: "https://example.test",
        law,
        nodes: [article, paragraph1],
      }),
    ).toContain("https://example.test/laws/129AC0000000089");
  });

  it("falls back to article plain text when raw text and child nodes are unavailable", () => {
    expect(
      buildArticleCopyText({
        article: {
          ...article,
          children: [],
          rawText: "",
          plainText:
            "第五条（未成年者の法律行為） 未成年者が法律行為をするには、同意を得なければならない。",
        },
        baseUrl: "https://example.test",
        law,
        nodes: [],
      }),
    ).toContain("未成年者が法律行為をするには、同意を得なければならない。");
  });

  it.each([
    { text: "一般に代理権は、本人のために行使しなければならない。" },
    { text: "十分な注意を払って意思表示を確認する。" },
    { text: "二以上の意思表示があるときは、順序を確認する。" },
  ])("preserves unnumbered paragraph words that start with Japanese numerals", ({ text }) => {
    const numeralArticle = node({
      id: "article:10",
      type: "Article",
      path: "part:1/chapter:2/article:10",
      number: "10",
      title: "第十条",
      rawText: `第十条\u3000${text}`,
      plainText: `第十条 ${text}`,
      children: ["paragraph:10-1"],
    });
    const numeralParagraph = node({
      id: "paragraph:10-1",
      type: "Paragraph",
      path: "part:1/chapter:2/article:10/paragraph:1",
      number: "1",
      rawText: text,
      plainText: text,
      parentId: numeralArticle.id,
    });

    expect(
      buildArticleCopyText({
        article: numeralArticle,
        baseUrl: "https://example.test",
        law,
        nodes: [numeralArticle, numeralParagraph],
      }),
    ).toContain(text);
  });
});
