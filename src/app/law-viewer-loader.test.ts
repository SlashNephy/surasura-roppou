import { describe, expect, it } from "vitest";

import { createEgovLawRepository } from "@/core/egov";
import { createJsonFetchStub, fixedTestNow as now, lawDataFixture } from "@/test/fixtures/egov";

import { loadLawViewerDocument } from "./law-viewer-loader";

describe("loadLawViewerDocument", () => {
  it("loads an e-Gov law through the repository for the viewer", async () => {
    const { calls, fetcher } = createJsonFetchStub(lawDataFixture);
    const repository = createEgovLawRepository({ fetcher, now });

    const state = await loadLawViewerDocument("129AC0000000089", repository);

    expect(calls).toEqual([
      {
        input:
          "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089?law_full_text_format=json&response_format=json",
        init: { headers: { accept: "application/json" } },
      },
    ]);
    expect(state).toMatchObject({
      status: "ready",
      law: {
        lawId: "129AC0000000089",
        title: "民法",
        source: "egov",
      },
      revision: {
        lawId: "129AC0000000089",
        revisionId: "129AC0000000089_20260624_508AC0000000045",
      },
      isSaved: false,
    });

    if (state.status !== "ready") {
      throw new Error("Expected ready state");
    }

    expect(state.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Article",
          number: "1",
          plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
        }),
      ]),
    );
  });

  it("maps repository failures to the viewer error state", async () => {
    const { fetcher } = createJsonFetchStub(
      {
        code: "400001",
        message: "指定された法令IDが存在しません。",
      },
      404,
    );
    const repository = createEgovLawRepository({ fetcher, now });

    await expect(loadLawViewerDocument("missing", repository)).resolves.toEqual({
      status: "error",
      message: "法令が見つかりません。",
    });
  });

  it("does not request the repository when the law ID is empty", async () => {
    const { calls, fetcher } = createJsonFetchStub(lawDataFixture);
    const repository = createEgovLawRepository({ fetcher, now });

    await expect(loadLawViewerDocument("", repository)).resolves.toEqual({
      status: "error",
      message: "法令が見つかりません。",
    });
    expect(calls).toEqual([]);
  });

  it("maps temporary API failures to a retrieval error state", async () => {
    const { fetcher } = createJsonFetchStub(
      {
        code: "500001",
        message: "Internal Server Error",
      },
      500,
    );
    const repository = createEgovLawRepository({ fetcher, now });

    await expect(loadLawViewerDocument("129AC0000000089", repository)).resolves.toEqual({
      status: "error",
      message: "法令を取得できませんでした。ネットワーク接続を確認してください。",
    });
  });
});
