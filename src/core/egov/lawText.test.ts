import { describe, expect, it } from "vitest";

import { structuredLawTextFixture } from "@/test/fixtures/egovLawText";

import { normalizeEgovLawText } from "./lawText";

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

  it("keeps branched legal numbers and kana subitem labels distinct", () => {
    const nodes = normalizeEgovLawText(
      {
        tag: "Law",
        attr: {},
        children: [
          {
            tag: "LawBody",
            attr: {},
            children: [
              {
                tag: "Article",
                attr: {},
                children: [
                  { tag: "ArticleTitle", attr: {}, children: ["第十二条の二の三"] },
                  {
                    tag: "Paragraph",
                    attr: {},
                    children: [
                      { tag: "ParagraphNum", attr: {}, children: ["第一項の二"] },
                      {
                        tag: "Item",
                        attr: {},
                        children: [
                          { tag: "ItemTitle", attr: {}, children: ["第一号の二"] },
                          {
                            tag: "Subitem",
                            attr: {},
                            children: [
                              { tag: "SubitemTitle", attr: {}, children: ["イ"] },
                              {
                                tag: "SubitemSentence",
                                attr: {},
                                children: [{ tag: "Sentence", attr: {}, children: ["イの本文。"] }],
                              },
                            ],
                          },
                          {
                            tag: "Subitem",
                            attr: {},
                            children: [
                              { tag: "SubitemTitle", attr: {}, children: ["ロ"] },
                              {
                                tag: "SubitemSentence",
                                attr: {},
                                children: [{ tag: "Sentence", attr: {}, children: ["ロの本文。"] }],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                tag: "Article",
                attr: {},
                children: [
                  { tag: "ArticleTitle", attr: {}, children: ["第十二条の三"] },
                  {
                    tag: "Paragraph",
                    attr: {},
                    children: [{ tag: "ParagraphSentence", attr: {}, children: ["別条の本文。"] }],
                  },
                ],
              },
              {
                tag: "Article",
                attr: {},
                children: [
                  { tag: "ArticleTitle", attr: {}, children: ["第一〇条"] },
                  {
                    tag: "Paragraph",
                    attr: {},
                    children: [{ tag: "ParagraphSentence", attr: {}, children: ["十条の本文。"] }],
                  },
                ],
              },
              {
                tag: "Article",
                attr: {},
                children: [
                  { tag: "ArticleTitle", attr: {}, children: ["第一二条"] },
                  {
                    tag: "Paragraph",
                    attr: {},
                    children: [
                      { tag: "ParagraphSentence", attr: {}, children: ["十二条の本文。"] },
                    ],
                  },
                ],
              },
              {
                tag: "Article",
                attr: {},
                children: [
                  { tag: "ArticleTitle", attr: {}, children: ["第二〇条"] },
                  {
                    tag: "Paragraph",
                    attr: {},
                    children: [
                      { tag: "ParagraphSentence", attr: {}, children: ["二十条の本文。"] },
                    ],
                  },
                ],
              },
              {
                tag: "AppdxTable",
                attr: {},
                children: [
                  { tag: "AppdxTableTitle", attr: {}, children: ["別表第一の二"] },
                  { tag: "TableStruct", attr: {}, children: ["別表の本文。"] },
                ],
              },
            ],
          },
        ],
      },
      "TEST_LAW",
      "TEST_REVISION",
    );

    expect(nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "Article", number: "12-2-3", path: "article:12-2-3" }),
        expect.objectContaining({ type: "Article", number: "12-3", path: "article:12-3" }),
        expect.objectContaining({ type: "Article", number: "10", path: "article:10" }),
        expect.objectContaining({ type: "Article", number: "12", path: "article:12" }),
        expect.objectContaining({ type: "Article", number: "20", path: "article:20" }),
        expect.objectContaining({
          type: "Paragraph",
          number: "1-2",
          path: "article:12-2-3/paragraph:1-2",
        }),
        expect.objectContaining({
          type: "Item",
          number: "1-2",
          path: "article:12-2-3/paragraph:1-2/item:1-2",
        }),
        expect.objectContaining({
          type: "Subitem",
          number: "イ",
          path: "article:12-2-3/paragraph:1-2/item:1-2/subitem:イ",
        }),
        expect.objectContaining({
          type: "Subitem",
          number: "ロ",
          path: "article:12-2-3/paragraph:1-2/item:1-2/subitem:ロ",
        }),
        expect.objectContaining({
          type: "AppdxTable",
          number: "1-2",
          path: "appdx-table:1-2",
        }),
      ]),
    );
  });
});
