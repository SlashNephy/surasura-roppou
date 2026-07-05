export const structuredLawTextFixture = {
  tag: "Law",
  attr: { LawType: "Act" },
  children: [
    {
      tag: "LawBody",
      attr: {},
      children: [
        {
          tag: "Part",
          attr: { Num: 1 },
          children: [
            { tag: "PartTitle", attr: {}, children: ["第一編　総則"] },
            {
              tag: "Chapter",
              attr: { Num: "1" },
              children: [
                { tag: "ChapterTitle", attr: {}, children: ["第一章　通則"] },
                {
                  tag: "Article",
                  attr: {},
                  children: [
                    { tag: "ArticleTitle", attr: {}, children: ["第十二条の二"] },
                    {
                      tag: "Paragraph",
                      attr: {},
                      children: [
                        {
                          tag: "ParagraphNum",
                          attr: {},
                          children: ["２"],
                        },
                        {
                          tag: "ParagraphSentence",
                          attr: {},
                          children: [
                            {
                              tag: "Sentence",
                              attr: {},
                              children: ["この法律は、試験用の本文を定める。"],
                            },
                          ],
                        },
                        {
                          tag: "Item",
                          attr: {},
                          children: [
                            { tag: "ItemTitle", attr: {}, children: ["一"] },
                            {
                              tag: "ItemSentence",
                              attr: {},
                              children: [
                                {
                                  tag: "Sentence",
                                  attr: {},
                                  children: ["第一号の本文。"],
                                },
                              ],
                            },
                          ],
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
          tag: "SupplProvision",
          attr: {},
          children: [
            { tag: "SupplProvisionLabel", attr: {}, children: ["附　則"] },
            {
              tag: "Article",
              attr: {},
              children: [
                { tag: "ArticleTitle", attr: {}, children: ["第一条"] },
                {
                  tag: "Paragraph",
                  attr: {},
                  children: [
                    {
                      tag: "ParagraphSentence",
                      attr: {},
                      children: [
                        {
                          tag: "Sentence",
                          attr: {},
                          children: ["この法律は、公布の日から施行する。"],
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
          tag: "AppdxTable",
          attr: { Num: "1" },
          children: [
            { tag: "AppdxTableTitle", attr: {}, children: ["別表第一"] },
            {
              tag: "TableStruct",
              attr: {},
              children: [
                {
                  tag: "Table",
                  attr: {},
                  children: [
                    {
                      tag: "TableRow",
                      attr: {},
                      children: [
                        {
                          tag: "TableColumn",
                          attr: {},
                          children: ["項目"],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
