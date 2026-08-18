import { describe, expect, it } from "vitest";

import type { LawNode, LawNodeType } from "@/core/domain";
import { structuredLawTextFixture } from "@/test/fixtures/egovLawText";

import { type EgovLawTextNode, normalizeEgovLawText } from "./lawText";

const lawTextNode = (
  tag: string,
  children: (EgovLawTextNode | string)[] = [],
  attr: EgovLawTextNode["attr"] = {},
): EgovLawTextNode => ({ tag, attr, children });

const normalizeLawBody = (children: EgovLawTextNode[]): LawNode[] =>
  normalizeEgovLawText(
    lawTextNode("Law", [lawTextNode("LawBody", children)]),
    "TEST_LAW",
    "TEST_REVISION",
  );

const article = (title: string, children: EgovLawTextNode[] = [paragraph()]): EgovLawTextNode =>
  lawTextNode("Article", [lawTextNode("ArticleTitle", [title]), ...children]);

const paragraph = (children: (EgovLawTextNode | string)[] = [paragraphSentence("本文。")]) =>
  lawTextNode("Paragraph", children);

const numberedParagraph = (
  title: string,
  children: EgovLawTextNode[] = [paragraphSentence("本文。")],
) => paragraph([lawTextNode("ParagraphNum", [title]), ...children]);

const paragraphSentence = (text: string) =>
  lawTextNode("ParagraphSentence", [lawTextNode("Sentence", [text])]);

const item = (title: string, children: EgovLawTextNode[] = [itemSentence("本文。")]) =>
  lawTextNode("Item", [lawTextNode("ItemTitle", [title]), ...children]);

const itemSentence = (text: string) =>
  lawTextNode("ItemSentence", [lawTextNode("Sentence", [text])]);

// e-Gov 法令データの号の細分は Subitem1・Subitem2 のように階層番号付きのタグで表される。
const subitem = (
  level: number,
  title: string,
  num: string | undefined,
  children: EgovLawTextNode[] = [],
) =>
  lawTextNode(
    `Subitem${String(level)}`,
    [
      lawTextNode(`Subitem${String(level)}Title`, [title]),
      lawTextNode(`Subitem${String(level)}Sentence`, [
        lawTextNode("Sentence", [`${title}の本文。`]),
      ]),
      ...children,
    ],
    num === undefined ? {} : { Num: num },
  );

const appdxTable = (title: string) =>
  lawTextNode("AppdxTable", [
    lawTextNode("AppdxTableTitle", [title]),
    lawTextNode("TableStruct", ["別表の本文。"]),
  ]);

const findNode = (nodes: LawNode[], type: LawNodeType, path: string): LawNode => {
  const node = nodes.find((candidate) => candidate.type === type && candidate.path === path);

  expect(node).toBeDefined();
  if (node === undefined) {
    throw new Error(`Expected ${type} node at ${path}`);
  }

  return node;
};

describe("normalizeEgovLawText", () => {
  it("builds stable LawNode entries from e-Gov structural law text", () => {
    const nodes = normalizeEgovLawText(structuredLawTextFixture, "TEST_LAW", "TEST_REVISION");

    expect(nodes).toEqual([
      expect.objectContaining({
        id: "TEST_LAW:TEST_REVISION:part:1",
        type: "Part",
        path: "part:1",
        number: "1",
        title: "第一編　総則",
        rawText:
          "第一編　総則第一章　通則第十二条の二２この法律は、試験用の本文を定める。一第一号の本文。",
        plainText:
          "第一編　総則 第一章　通則 第十二条の二 ２ この法律は、試験用の本文を定める。 一 第一号の本文。",
        normalizedText:
          "第一編　総則 第一章　通則 第十二条の二 ２ この法律は、試験用の本文を定める。 一 第一号の本文。",
      }),
      expect.objectContaining({
        id: "TEST_LAW:TEST_REVISION:part:1/chapter:1",
        type: "Chapter",
        path: "part:1/chapter:1",
        parentId: "TEST_LAW:TEST_REVISION:part:1",
        number: "1",
        title: "第一章　通則",
      }),
      expect.objectContaining({
        id: "TEST_LAW:TEST_REVISION:part:1/chapter:1/article:12-2",
        type: "Article",
        path: "part:1/chapter:1/article:12-2",
        number: "12-2",
        title: "第十二条の二",
        children: ["TEST_LAW:TEST_REVISION:part:1/chapter:1/article:12-2/paragraph:2"],
      }),
      expect.objectContaining({
        id: "TEST_LAW:TEST_REVISION:part:1/chapter:1/article:12-2/paragraph:2",
        type: "Paragraph",
        path: "part:1/chapter:1/article:12-2/paragraph:2",
        number: "2",
        plainText: "２ この法律は、試験用の本文を定める。 一 第一号の本文。",
        children: ["TEST_LAW:TEST_REVISION:part:1/chapter:1/article:12-2/paragraph:2/item:1"],
      }),
      expect.objectContaining({
        id: "TEST_LAW:TEST_REVISION:part:1/chapter:1/article:12-2/paragraph:2/item:1",
        type: "Item",
        path: "part:1/chapter:1/article:12-2/paragraph:2/item:1",
        number: "1",
        title: "一",
        rawText: "一第一号の本文。",
        plainText: "一 第一号の本文。",
      }),
      expect.objectContaining({
        id: "TEST_LAW:TEST_REVISION:supplementary-provision:1",
        type: "SupplementaryProvision",
        path: "supplementary-provision:1",
        title: "附　則",
        children: ["TEST_LAW:TEST_REVISION:supplementary-provision:1/article:1"],
      }),
      expect.objectContaining({
        id: "TEST_LAW:TEST_REVISION:supplementary-provision:1/article:1",
        type: "Article",
        path: "supplementary-provision:1/article:1",
        number: "1",
        plainText: "第一条 この法律は、公布の日から施行する。",
      }),
      expect.objectContaining({
        id: "TEST_LAW:TEST_REVISION:supplementary-provision:1/article:1/paragraph:1",
        type: "Paragraph",
        path: "supplementary-provision:1/article:1/paragraph:1",
        parentId: "TEST_LAW:TEST_REVISION:supplementary-provision:1/article:1",
        number: "1",
        plainText: "この法律は、公布の日から施行する。",
      }),
      expect.objectContaining({
        id: "TEST_LAW:TEST_REVISION:appdx-table:1",
        type: "AppdxTable",
        path: "appdx-table:1",
        number: "1",
        title: "別表第一",
        rawText: "別表第一項目",
        plainText: "別表第一 項目",
      }),
    ]);
  });

  it.each([
    {
      name: "article branches",
      children: [article("第十二条の二の三"), article("第十二条の三")],
      expected: [
        { type: "Article", number: "12-2-3", path: "article:12-2-3" },
        { type: "Article", number: "12-3", path: "article:12-3" },
      ],
    },
    {
      name: "article branches with repeated 第 prefixes",
      children: [article("第十二条の二の第三")],
      expected: [{ type: "Article", number: "12-2-3", path: "article:12-2-3" }],
    },
    {
      name: "positional kanji article numbers",
      children: [article("第一〇条"), article("第一二条"), article("第二〇条")],
      expected: [
        { type: "Article", number: "10", path: "article:10" },
        { type: "Article", number: "12", path: "article:12" },
        { type: "Article", number: "20", path: "article:20" },
      ],
    },
    {
      name: "paragraph branches",
      children: [article("第一条", [numberedParagraph("第一項の二"), numberedParagraph("第二項")])],
      expected: [
        { type: "Paragraph", number: "1-2", path: "article:1/paragraph:1-2" },
        { type: "Paragraph", number: "2", path: "article:1/paragraph:2" },
      ],
    },
    {
      name: "item branches",
      children: [article("第一条", [paragraph([item("第一号の二"), item("第二号")])])],
      expected: [
        { type: "Item", number: "1-2", path: "article:1/paragraph:1/item:1-2" },
        { type: "Item", number: "2", path: "article:1/paragraph:1/item:2" },
      ],
    },
    {
      name: "kana subitem labels",
      children: [
        article("第一条", [
          paragraph([item("第一号", [subitem(1, "イ", "1"), subitem(1, "ロ", "2")])]),
        ]),
      ],
      expected: [
        { type: "Subitem", number: "1", path: "article:1/paragraph:1/item:1/subitem:1" },
        { type: "Subitem", number: "2", path: "article:1/paragraph:1/item:1/subitem:2" },
      ],
    },
    {
      name: "kana subitem labels without Num attributes",
      children: [
        article("第一条", [
          paragraph([item("第一号", [subitem(1, "イ", undefined), subitem(1, "ロ", undefined)])]),
        ]),
      ],
      expected: [
        { type: "Subitem", number: "イ", path: "article:1/paragraph:1/item:1/subitem:イ" },
        { type: "Subitem", number: "ロ", path: "article:1/paragraph:1/item:1/subitem:ロ" },
      ],
    },
    {
      name: "deepest subitem level",
      children: [
        article("第一条", [
          paragraph([
            item("第一号", [
              subitem(1, "イ", "1", [
                subitem(2, "(1)", "1", [
                  subitem(3, "(i)", "1", [
                    subitem(4, "ｲ", "1", [
                      subitem(5, "(a)", "1", [
                        subitem(6, "a", "1", [
                          subitem(7, "A", "1", [
                            subitem(8, "①", "1", [subitem(9, "㋐", "1", [subitem(10, "㊀", "1")])]),
                          ]),
                        ]),
                      ]),
                    ]),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ]),
      ],
      expected: [
        {
          type: "Subitem",
          number: "1",
          path: `article:1/paragraph:1/item:1${"/subitem:1".repeat(10)}`,
        },
      ],
    },
    {
      name: "nested subitem levels",
      children: [
        article("第一条", [
          paragraph([item("第一号", [subitem(1, "イ", "1", [subitem(2, "(1)", "1")])])]),
        ]),
      ],
      expected: [
        { type: "Subitem", number: "1", path: "article:1/paragraph:1/item:1/subitem:1" },
        {
          type: "Subitem",
          number: "1",
          path: "article:1/paragraph:1/item:1/subitem:1/subitem:1",
        },
      ],
    },
    {
      name: "appendix table branches",
      children: [appdxTable("別表第一の二"), appdxTable("別表第二")],
      expected: [
        { type: "AppdxTable", number: "1-2", path: "appdx-table:1-2" },
        { type: "AppdxTable", number: "2", path: "appdx-table:2" },
      ],
    },
  ] satisfies {
    name: string;
    children: EgovLawTextNode[];
    expected: { type: LawNodeType; number: string; path: string }[];
  }[])("normalizes $name", ({ children, expected }) => {
    const nodes = normalizeLawBody(children);

    for (const entry of expected) {
      expect(nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: entry.type,
            number: entry.number,
            path: entry.path,
          }),
        ]),
      );
    }
  });

  it("keeps subitem levels as nested nodes carrying their own titles", () => {
    const nodes = normalizeLawBody([
      article("第一条", [
        paragraph([item("第一号", [subitem(1, "イ", "1", [subitem(2, "(1)", "1")])])]),
      ]),
    ]);
    const outer = findNode(nodes, "Subitem", "article:1/paragraph:1/item:1/subitem:1");
    const inner = findNode(nodes, "Subitem", "article:1/paragraph:1/item:1/subitem:1/subitem:1");

    expect(outer).toEqual(
      expect.objectContaining({
        title: "イ",
        plainText: "イ イの本文。 (1) (1)の本文。",
        children: [inner.id],
      }),
    );
    expect(inner).toEqual(
      expect.objectContaining({
        title: "(1)",
        plainText: "(1) (1)の本文。",
        parentId: outer.id,
      }),
    );
  });

  it("builds text without ruby readings or inline spaces", () => {
    const nodes = normalizeLawBody([
      article("第一条", [
        paragraph([
          lawTextNode("ParagraphNum"),
          lawTextNode("ParagraphSentence", [
            lawTextNode("Sentence", [
              "運送品がその性質又は",
              // e-Gov 法令 API v2 のルビは Ruby 直下に地の文と Rt（読み）が並ぶ。
              lawTextNode("Ruby", ["瑕疵", lawTextNode("Rt", ["かし"])]),
              "によって滅失したとき。",
            ]),
          ]),
        ]),
      ]),
    ]);
    const paragraphNode = findNode(nodes, "Paragraph", "article:1/paragraph:1");

    expect(paragraphNode).toEqual(
      expect.objectContaining({
        number: "1",
        rawText: "運送品がその性質又は瑕疵によって滅失したとき。",
        plainText: "運送品がその性質又は瑕疵によって滅失したとき。",
        normalizedText: "運送品がその性質又は瑕疵によって滅失したとき。",
        rubyAnnotations: [{ base: "瑕疵", text: "かし" }],
      }),
    );
    expect(paragraphNode).not.toHaveProperty("title");
  });

  it("keeps ruby annotations on the node that owns the text", () => {
    const nodes = normalizeLawBody([
      lawTextNode("Article", [
        lawTextNode("ArticleCaption", [
          "（定期",
          lawTextNode("Ruby", ["傭", lawTextNode("Rt", ["よう"])]),
          "船契約）",
        ]),
        lawTextNode("ArticleTitle", ["第一条"]),
        paragraph([
          lawTextNode("ParagraphSentence", [
            lawTextNode("Sentence", [
              lawTextNode("Ruby", ["艤", lawTextNode("Rt", ["ぎ"])]),
              "装した船舶。",
            ]),
          ]),
        ]),
      ]),
    ]);

    // 条見出しのルビは条ノード、本文のルビは項ノードが持つ。
    // 章や編に法令全体のルビが積み上がらないよう、収集はノード境界で止まる。
    expect(findNode(nodes, "Article", "article:1")).toEqual(
      expect.objectContaining({ rubyAnnotations: [{ base: "傭", text: "よう" }] }),
    );
    expect(findNode(nodes, "Paragraph", "article:1/paragraph:1")).toEqual(
      expect.objectContaining({ rubyAnnotations: [{ base: "艤", text: "ぎ" }] }),
    );
  });

  it("omits rubyAnnotations when the node has no ruby", () => {
    const nodes = normalizeLawBody([article("第一条")]);

    expect(findNode(nodes, "Article", "article:1")).not.toHaveProperty("rubyAnnotations");
  });

  it("extracts the article caption into caption", () => {
    const nodes = normalizeLawBody([
      lawTextNode("Article", [
        lawTextNode("ArticleCaption", ["（基本原則）"]),
        lawTextNode("ArticleTitle", ["第一条"]),
        paragraph(),
      ]),
    ]);
    const articleNode = findNode(nodes, "Article", "article:1");

    expect(articleNode).toEqual(
      expect.objectContaining({ title: "第一条", caption: "（基本原則）" }),
    );
  });

  it("omits caption when the article has no caption", () => {
    const nodes = normalizeLawBody([article("第一条")]);

    expect(findNode(nodes, "Article", "article:1")).not.toHaveProperty("caption");
  });
  it("separates sibling columns with an ideographic space", () => {
    const nodes = normalizeLawBody([
      article("第二条", [
        paragraph([
          lawTextNode("ParagraphSentence", [lawTextNode("Sentence", ["この法律において…"])]),
          lawTextNode("Item", [
            lawTextNode("ItemTitle", ["四"]),
            lawTextNode("ItemSentence", [
              lawTextNode("Column", [lawTextNode("Sentence", ["不利益処分"])], { Num: 1 }),
              lawTextNode("Column", [lawTextNode("Sentence", ["行政庁が、法令に基づき、…"])], {
                Num: 2,
              }),
            ]),
          ]),
        ]),
      ]),
    ]);

    expect(findNode(nodes, "Item", "article:2/paragraph:1/item:4")).toEqual(
      expect.objectContaining({
        rawText: "四不利益処分\u3000行政庁が、法令に基づき、…",
        plainText: "四 不利益処分\u3000行政庁が、法令に基づき、…",
        normalizedText: "四 不利益処分\u3000行政庁が、法令に基づき、…",
      }),
    );
  });

  it("does not add a separator when the sentence has a single column", () => {
    const nodes = normalizeLawBody([
      article("第一条", [
        paragraph([
          lawTextNode("ParagraphSentence", [
            lawTextNode("Column", [lawTextNode("Sentence", ["単一の欄の本文。"])], { Num: 1 }),
          ]),
        ]),
      ]),
    ]);

    expect(findNode(nodes, "Paragraph", "article:1/paragraph:1")).toEqual(
      expect.objectContaining({
        rawText: "単一の欄の本文。",
        plainText: "単一の欄の本文。",
      }),
    );
  });
});
