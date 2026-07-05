import { describe, expect, it } from "vitest";

import { createEgovLawRepository, EgovApiError } from "./repository";

const now = () => new Date("2026-07-05T00:00:00.000Z");

const lawsFixture = {
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

const lawDataFixture = {
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
                ],
              },
            ],
          },
        ],
      },
    ],
  },
};

const lawRevisionsFixture = {
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

describe("EgovLawRepository", () => {
  it("maps /laws responses into domain law summaries", async () => {
    const { calls, fetcher } = createJsonFetchStub(lawsFixture);
    const repository = createEgovLawRepository({ fetcher, now });

    const result = await repository.listLaws({ title: "民法", limit: 2 });

    expect(calls).toEqual([
      {
        input:
          "https://laws.e-gov.go.jp/api/2/laws?law_title=%E6%B0%91%E6%B3%95&limit=2&response_format=json",
        init: { headers: { accept: "application/json" } },
      },
    ]);
    expect(result).toEqual({
      totalCount: 11,
      count: 2,
      nextOffset: 2,
      laws: [
        {
          law: {
            lawId: "129AC0000000089",
            title: "民法",
            lawNumber: "明治二十九年法律第八十九号",
            lawType: "Act",
            aliases: ["民法", "民"],
            source: "egov",
            updatedAt: "2026-06-24T10:54:14+09:00",
          },
          revision: {
            lawId: "129AC0000000089",
            revisionId: "129AC0000000089_20260624_508AC0000000045",
            effectiveDate: "2026-06-24",
            fetchedAt: "2026-07-05T00:00:00.000Z",
            sourceUrl: "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089",
          },
          currentRevision: {
            lawId: "129AC0000000089",
            revisionId: "129AC0000000089_20260624_508AC0000000045",
            effectiveDate: "2026-06-24",
            fetchedAt: "2026-07-05T00:00:00.000Z",
            sourceUrl: "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089",
          },
        },
        {
          law: {
            lawId: "131AC0000000011",
            title: "民法施行法",
            lawNumber: "明治三十一年法律第十一号",
            lawType: "Act",
            aliases: [],
            source: "egov",
            updatedAt: "2025-10-01T00:03:31+09:00",
          },
          revision: {
            lawId: "131AC0000000011",
            revisionId: "131AC0000000011_20251001_505AC0000000053",
            effectiveDate: "2025-10-01",
            fetchedAt: "2026-07-05T00:00:00.000Z",
            sourceUrl: "https://laws.e-gov.go.jp/api/2/law_data/131AC0000000011",
          },
          currentRevision: {
            lawId: "131AC0000000011",
            revisionId: "131AC0000000011_20251001_505AC0000000053",
            effectiveDate: "2025-10-01",
            fetchedAt: "2026-07-05T00:00:00.000Z",
            sourceUrl: "https://laws.e-gov.go.jp/api/2/law_data/131AC0000000011",
          },
        },
      ],
    });
  });

  it("fetches law text as JSON and flattens structural nodes", async () => {
    const { calls, fetcher } = createJsonFetchStub(lawDataFixture);
    const repository = createEgovLawRepository({ fetcher, now });

    const document = await repository.getLaw("129AC0000000089");

    expect(calls).toEqual([
      {
        input:
          "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089?law_full_text_format=json&response_format=json",
        init: { headers: { accept: "application/json" } },
      },
    ]);
    expect(document.law).toMatchObject({
      lawId: "129AC0000000089",
      title: "民法",
      aliases: ["民法", "民"],
      source: "egov",
    });
    expect(document.revision).toEqual({
      lawId: "129AC0000000089",
      revisionId: "129AC0000000089_20260624_508AC0000000045",
      effectiveDate: "2026-06-24",
      fetchedAt: "2026-07-05T00:00:00.000Z",
      sourceUrl: "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089",
    });
    expect(document.nodes).toEqual([
      expect.objectContaining({
        type: "Part",
        path: "part:1",
        number: "1",
        title: "第一編　総則",
        children: ["129AC0000000089:129AC0000000089_20260624_508AC0000000045:part:1/chapter:1"],
      }),
      expect.objectContaining({
        type: "Chapter",
        path: "part:1/chapter:1",
        parentId: "129AC0000000089:129AC0000000089_20260624_508AC0000000045:part:1",
        title: "第一章　通則",
      }),
      expect.objectContaining({
        type: "Article",
        path: "part:1/chapter:1/article:1",
        number: "1",
        rawText: "第一条私権は、公共の福祉に適合しなければならない。",
        children: [
          "129AC0000000089:129AC0000000089_20260624_508AC0000000045:part:1/chapter:1/article:1/paragraph:1",
        ],
      }),
      expect.objectContaining({
        type: "Paragraph",
        path: "part:1/chapter:1/article:1/paragraph:1",
        number: "1",
        rawText: "私権は、公共の福祉に適合しなければならない。",
      }),
    ]);
    expect(document.raw).toEqual(lawDataFixture);
  });

  it("fetches law metadata from revision history", async () => {
    const { calls, fetcher } = createJsonFetchStub(lawRevisionsFixture);
    const repository = createEgovLawRepository({ fetcher, now });

    const metadata = await repository.getLawMetadata("129AC0000000089");

    expect(calls).toEqual([
      {
        input: "https://laws.e-gov.go.jp/api/2/law_revisions/129AC0000000089?response_format=json",
        init: { headers: { accept: "application/json" } },
      },
    ]);
    expect(metadata.law).toEqual({
      lawId: "129AC0000000089",
      title: "民法",
      lawNumber: "明治二十九年法律第八十九号",
      lawType: "Act",
      aliases: ["民法", "民"],
      source: "egov",
      updatedAt: "2026-06-26T15:30:33+09:00",
    });
    expect(metadata.revisions).toEqual([
      {
        lawId: "129AC0000000089",
        revisionId: "129AC0000000089_20290623_508AC0000000045",
        effectiveDate: "2029-06-23",
        fetchedAt: "2026-07-05T00:00:00.000Z",
        sourceUrl:
          "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089_20290623_508AC0000000045",
      },
      {
        lawId: "129AC0000000089",
        revisionId: "129AC0000000089_20260624_508AC0000000045",
        effectiveDate: "2026-06-24",
        fetchedAt: "2026-07-05T00:00:00.000Z",
        sourceUrl:
          "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089_20260624_508AC0000000045",
      },
    ]);
  });

  it("raises an API error with response details", async () => {
    const { fetcher } = createJsonFetchStub(
      {
        code: "400001",
        message: "指定された法令IDが存在しません。",
      },
      404,
    );
    const repository = createEgovLawRepository({ fetcher, now });

    await expect(repository.getLaw("missing")).rejects.toThrow(
      new EgovApiError(404, "400001", "指定された法令IDが存在しません。"),
    );
  });
});

interface FetchCall {
  input: RequestInfo | URL;
  init?: RequestInit;
}

const createJsonFetchStub = (
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
