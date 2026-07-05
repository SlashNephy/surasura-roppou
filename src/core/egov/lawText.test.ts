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

const subitem = (title: string) =>
  lawTextNode("Subitem", [
    lawTextNode("SubitemTitle", [title]),
    lawTextNode("SubitemSentence", [lawTextNode("Sentence", [`${title}の本文。`])]),
  ]);

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
      children: [article("第一条", [paragraph([item("第一号", [subitem("イ"), subitem("ロ")])])])],
      expected: [
        { type: "Subitem", number: "イ", path: "article:1/paragraph:1/item:1/subitem:イ" },
        { type: "Subitem", number: "ロ", path: "article:1/paragraph:1/item:1/subitem:ロ" },
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

  it("builds plainText without ruby readings or inline spaces", () => {
    const nodes = normalizeLawBody([
      article("第一条", [
        paragraph([
          lawTextNode("ParagraphNum"),
          lawTextNode("ParagraphSentence", [
            lawTextNode("Sentence", [
              "この法律は、",
              lawTextNode("Ruby", [
                lawTextNode("RubyTo", ["公布"]),
                lawTextNode("RubyChar", ["こうふ"]),
              ]),
              "の日から施行する。",
            ]),
          ]),
        ]),
      ]),
    ]);
    const paragraphNode = findNode(nodes, "Paragraph", "article:1/paragraph:1");

    expect(paragraphNode).toEqual(
      expect.objectContaining({
        number: "1",
        rawText: "この法律は、公布こうふの日から施行する。",
        plainText: "この法律は、公布の日から施行する。",
        normalizedText: "この法律は、公布の日から施行する。",
      }),
    );
    expect(paragraphNode).not.toHaveProperty("title");
  });
});
