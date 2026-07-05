import { describe, expect, it } from "vitest";

import {
  createJsonFetchStub,
  createTextFetchStub,
  fixedTestNow as now,
  lawDataFixture,
  lawRevisionsFixture,
  lawsFixture,
} from "@/test/fixtures/egov";

import { createEgovLawRepository } from "./repository";

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

  it("fetches law text as JSON and normalizes structural nodes", async () => {
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
        plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
        normalizedText: "第一条 私権は、公共の福祉に適合しなければならない。",
        children: [
          "129AC0000000089:129AC0000000089_20260624_508AC0000000045:part:1/chapter:1/article:1/paragraph:1",
        ],
      }),
      expect.objectContaining({
        type: "Paragraph",
        path: "part:1/chapter:1/article:1/paragraph:1",
        number: "1",
        rawText: "私権は、公共の福祉に適合しなければならない。",
        plainText: "私権は、公共の福祉に適合しなければならない。",
        normalizedText: "私権は、公共の福祉に適合しなければならない。",
      }),
      expect.objectContaining({
        type: "Article",
        path: "part:1/chapter:1/article:2",
        rawText: "第二条権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。",
        plainText: "第二条 権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。",
        normalizedText: "第二条 権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。",
        children: [
          "129AC0000000089:129AC0000000089_20260624_508AC0000000045:part:1/chapter:1/article:2/paragraph:1",
        ],
      }),
      expect.objectContaining({
        type: "Paragraph",
        path: "part:1/chapter:1/article:2/paragraph:1",
        rawText: "権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。",
        plainText: "権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。",
        normalizedText: "権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。",
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

    await expect(repository.getLaw("missing")).rejects.toMatchObject({
      name: "EgovApiError",
      status: 404,
      code: "400001",
      message: "指定された法令IDが存在しません。",
      payload: {
        code: "400001",
        message: "指定された法令IDが存在しません。",
      },
      url: "https://laws.e-gov.go.jp/api/2/law_data/missing?law_full_text_format=json&response_format=json",
    });
  });

  it("raises an API error with request context when the response is not JSON", async () => {
    const { fetcher } = createTextFetchStub("<html>Bad Gateway</html>", 502);
    const repository = createEgovLawRepository({ fetcher, now });

    await expect(repository.getLaw("129AC0000000089")).rejects.toMatchObject({
      name: "EgovApiError",
      status: 502,
      code: "502",
      message:
        "e-Gov API returned invalid JSON from https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089?law_full_text_format=json&response_format=json",
      url: "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089?law_full_text_format=json&response_format=json",
    });
  });
});
