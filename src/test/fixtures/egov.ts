export const fixedTestNow = () => new Date("2026-07-05T00:00:00.000Z");

export const lawsFixture = {
  total_count: 11,
  count: 2,
  next_offset: 2,
  laws: [
    {
      law_info: {
        law_type: "Act",
        law_id: "129AC0000000089",
        law_num: "明治二十九年法律第八十九号",
        promulgation_date: "1896-04-27",
      },
      revision_info: {
        law_revision_id: "129AC0000000089_20260624_508AC0000000045",
        law_type: "Act",
        law_title: "民法",
        law_title_kana: "みんぽう",
        abbrev: "民法,民",
        updated: "2026-06-24T10:54:14+09:00",
        amendment_enforcement_date: "2026-06-24",
      },
      current_revision_info: {
        law_revision_id: "129AC0000000089_20260624_508AC0000000045",
        law_type: "Act",
        law_title: "民法",
        law_title_kana: "みんぽう",
        abbrev: "民法,民",
        updated: "2026-06-24T10:54:14+09:00",
        amendment_enforcement_date: "2026-06-24",
      },
    },
    {
      law_info: {
        law_type: "Act",
        law_id: "131AC0000000011",
        law_num: "明治三十一年法律第十一号",
        promulgation_date: "1898-06-21",
      },
      revision_info: {
        law_revision_id: "131AC0000000011_20251001_505AC0000000053",
        law_type: "Act",
        law_title: "民法施行法",
        law_title_kana: "みんぽうしこうほう",
        abbrev: null,
        updated: "2025-10-01T00:03:31+09:00",
        amendment_enforcement_date: "2025-10-01",
      },
      current_revision_info: {
        law_revision_id: "131AC0000000011_20251001_505AC0000000053",
        law_type: "Act",
        law_title: "民法施行法",
        law_title_kana: "みんぽうしこうほう",
        abbrev: null,
        updated: "2025-10-01T00:03:31+09:00",
        amendment_enforcement_date: "2025-10-01",
      },
    },
  ],
};

export const lawDataFixture = {
  law_info: {
    law_type: "Act",
    law_id: "129AC0000000089",
    law_num: "明治二十九年法律第八十九号",
    promulgation_date: "1896-04-27",
  },
  revision_info: {
    law_revision_id: "129AC0000000089_20260624_508AC0000000045",
    law_type: "Act",
    law_title: "民法",
    law_title_kana: "みんぽう",
    abbrev: "民法,民",
    updated: "2026-06-24T10:54:14+09:00",
    amendment_enforcement_date: "2026-06-24",
  },
  law_full_text: {
    tag: "Law",
    attr: { LawType: "Act" },
    children: [
      { tag: "LawNum", attr: {}, children: ["明治二十九年法律第八十九号"] },
      {
        tag: "LawBody",
        attr: {},
        children: [
          { tag: "LawTitle", attr: { Kana: "みんぽう", Abbrev: "民法,民" }, children: ["民法"] },
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
                    attr: { Num: "1" },
                    children: [
                      { tag: "ArticleTitle", attr: {}, children: ["第一条"] },
                      {
                        tag: "ParagraphGroup",
                        attr: {},
                        children: [
                          {
                            tag: "Paragraph",
                            attr: { Num: 1 },
                            children: [
                              {
                                tag: "ParagraphSentence",
                                attr: {},
                                children: [
                                  {
                                    tag: "Sentence",
                                    attr: {},
                                    children: ["私権は、公共の福祉に適合しなければならない。"],
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
                      { tag: "ArticleTitle", attr: {}, children: ["第二条"] },
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
                                children: [
                                  "権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。",
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
        ],
      },
    ],
  },
};

export const lawRevisionsFixture = {
  law_info: {
    law_type: "Act",
    law_id: "129AC0000000089",
    law_num: "明治二十九年法律第八十九号",
    promulgation_date: "1896-04-27",
  },
  revisions: [
    {
      law_revision_id: "129AC0000000089_20290623_508AC0000000045",
      law_type: "Act",
      law_title: "民法",
      law_title_kana: "みんぽう",
      abbrev: null,
      updated: "2026-06-26T15:30:33+09:00",
      amendment_enforcement_date: "2029-06-23",
    },
    {
      law_revision_id: "129AC0000000089_20260624_508AC0000000045",
      law_type: "Act",
      law_title: "民法",
      law_title_kana: "みんぽう",
      abbrev: "民法,民",
      updated: "2026-06-24T10:54:14+09:00",
      amendment_enforcement_date: "2026-06-24",
    },
  ],
};

export interface FetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

export const createJsonFetchStub = (
  payload: unknown,
  status = 200,
): { calls: FetchCall[]; fetcher: typeof fetch } => {
  const calls: FetchCall[] = [];
  const fetcher: typeof fetch = (input, init) => {
    calls.push(init === undefined ? { input } : { input, init });

    return Promise.resolve(new Response(JSON.stringify(payload), { status }));
  };

  return { calls, fetcher };
};

export const createTextFetchStub = (
  payload: string,
  status = 200,
): { calls: FetchCall[]; fetcher: typeof fetch } => {
  const calls: FetchCall[] = [];
  const fetcher: typeof fetch = (input, init) => {
    calls.push(init === undefined ? { input } : { input, init });

    return Promise.resolve(new Response(payload, { status }));
  };

  return { calls, fetcher };
};
