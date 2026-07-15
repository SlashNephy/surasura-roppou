import { describe, expect, it, vi } from "vitest";

import { createEgovLawRepository } from "@/core/egov";
import type { LawDocument, LawListResult, LawMetadata, LawRepository } from "@/core/egov";
import type { StorageRepository } from "@/core/storage";
import { createJsonFetchStub, fixedTestNow as now, lawDataFixture } from "@/test/fixtures/egov";

import { loadLawViewerDocument } from "./law-viewer-loader";
import { offlineDemoLawId, sampleLawViewerDocument } from "./law-viewer-sample";

describe("loadLawViewerDocument", () => {
  it("loads an e-Gov law through the repository for the viewer", async () => {
    const { calls, fetcher } = createJsonFetchStub(lawDataFixture);
    const repository = createEgovLawRepository({ fetcher, now });

    const state = await loadLawViewerDocument(
      "129AC0000000089",
      repository,
      createStorageRepositoryStub(),
    );

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

  it("marks an online law as saved when it already exists in IndexedDB", async () => {
    const { fetcher } = createJsonFetchStub(lawDataFixture);
    const repository = createEgovLawRepository({ fetcher, now });
    const storageRepository = createStorageRepositoryStub({
      getLawDocument: vi.fn().mockResolvedValue({
        ...sampleLawViewerDocument,
        savedAt: "2026-07-06T00:00:00.000Z",
      }),
    });

    const state = await loadLawViewerDocument("129AC0000000089", repository, storageRepository);

    expect(state).toMatchObject({
      status: "ready",
      isSaved: true,
      loadedFromStorage: false,
      savedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("keeps loading the online law when saved storage lookup fails", async () => {
    const { fetcher } = createJsonFetchStub(lawDataFixture);
    const repository = createEgovLawRepository({ fetcher, now });
    const storageRepository = createStorageRepositoryStub({
      getLawDocument: vi.fn().mockRejectedValue(new Error("IndexedDB is unavailable")),
    });

    await expect(
      loadLawViewerDocument("129AC0000000089", repository, storageRepository),
    ).resolves.toMatchObject({
      status: "ready",
      law: { title: "民法" },
      isSaved: false,
      loadedFromStorage: false,
    });
  });

  it("falls back to a saved law document when the network request fails", async () => {
    const repository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (): Promise<LawDocument> => Promise.reject(new Error("network down")),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;
    const storageRepository = createStorageRepositoryStub({
      getLawDocument: vi.fn().mockResolvedValue({
        ...sampleLawViewerDocument,
        savedAt: "2026-07-06T00:00:00.000Z",
      }),
    });

    await expect(
      loadLawViewerDocument("129AC0000000089", repository, storageRepository),
    ).resolves.toMatchObject({
      status: "ready",
      isSaved: true,
      loadedFromStorage: true,
      savedAt: "2026-07-06T00:00:00.000Z",
      law: { title: "民法" },
    });
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

    await expect(
      loadLawViewerDocument("missing", repository, createStorageRepositoryStub()),
    ).resolves.toEqual({
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

  it("returns the offline unavailable state for the demo law ID", async () => {
    await expect(loadLawViewerDocument(offlineDemoLawId)).resolves.toEqual({
      status: "offline-unavailable",
      lawTitle: sampleLawViewerDocument.law.title,
    });
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

    await expect(
      loadLawViewerDocument("129AC0000000089", repository, createStorageRepositoryStub()),
    ).resolves.toEqual({
      status: "error",
      message: "法令を取得できませんでした。ネットワーク接続を確認してください。",
    });
  });

  it("maps non-EgovApiError failures to a retrieval error state", async () => {
    const repository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (): Promise<LawDocument> => Promise.reject(new Error("network down")),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;

    await expect(
      loadLawViewerDocument("129AC0000000089", repository, createStorageRepositoryStub()),
    ).resolves.toEqual({
      status: "error",
      message: "法令を取得できませんでした。ネットワーク接続を確認してください。",
    });
  });

  it("forwards the base date to the repository as an asof query", async () => {
    const { calls, fetcher } = createJsonFetchStub(lawDataFixture);
    const repository = createEgovLawRepository({ fetcher, now });

    const state = await loadLawViewerDocument(
      "129AC0000000089",
      repository,
      createStorageRepositoryStub(),
      "2020-06-01",
    );

    expect(calls).toEqual([
      {
        input:
          "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089?law_full_text_format=json&asof=2020-06-01&response_format=json",
        init: { headers: { accept: "application/json" } },
      },
    ]);
    expect(state).toMatchObject({ status: "ready", requestedAsOf: "2020-06-01" });
  });

  it("reports a base-date-specific error when the asof version is unavailable", async () => {
    const { fetcher } = createJsonFetchStub(
      {
        code: "400044",
        message: "法令の時点（asof）には2017-04-01以降を指定してください。",
      },
      400,
    );
    const repository = createEgovLawRepository({ fetcher, now });

    await expect(
      loadLawViewerDocument(
        "129AC0000000089",
        repository,
        createStorageRepositoryStub(),
        "2016-01-01",
      ),
    ).resolves.toEqual({
      status: "error",
      message: "指定した基準日にはこの法令の版が見つかりません。基準日を変更してください。",
    });
  });

  it("keeps the saved fallback and records the requested base date when offline", async () => {
    const repository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (): Promise<LawDocument> => Promise.reject(new Error("network down")),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;
    const storageRepository = createStorageRepositoryStub({
      getLawDocument: vi.fn().mockResolvedValue({
        ...sampleLawViewerDocument,
        savedAt: "2026-07-06T00:00:00.000Z",
      }),
    });

    await expect(
      loadLawViewerDocument("129AC0000000089", repository, storageRepository, "2020-06-01"),
    ).resolves.toMatchObject({
      status: "ready",
      loadedFromStorage: true,
      requestedAsOf: "2020-06-01",
    });
  });
});

const createStorageRepositoryStub = ({
  getLawDocument = vi.fn().mockResolvedValue(undefined),
}: {
  getLawDocument?: StorageRepository["getLawDocument"];
} = {}): StorageRepository => ({
  getLawDocument,
  saveLawDocument: vi.fn(),
  listSavedLaws: vi.fn(),
  deleteLawDocument: vi.fn(),
  putBookmark: vi.fn(),
  listBookmarks: vi.fn(),
  putCollection: vi.fn(),
  listCollections: vi.fn(),
  putAnnotation: vi.fn(),
  listAnnotations: vi.fn(),
  putStudyCard: vi.fn(),
  getStudyCard: vi.fn(),
  listStudyCards: vi.fn(),
  deleteStudyCard: vi.fn(),
  listDueStudyCards: vi.fn(),
  listUnscheduledStudyCards: vi.fn(),
  listReviewLogs: vi.fn(),
  recordReview: vi.fn(),
  putStudySession: vi.fn(),
  listStudySessions: vi.fn(),
  importSavedData: vi.fn(),
  putOcrSession: vi.fn(),
  listOcrSessions: vi.fn(),
  close: vi.fn(),
});
