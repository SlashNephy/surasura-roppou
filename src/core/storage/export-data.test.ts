import { describe, expect, it, vi } from "vitest";

import type {
  Annotation,
  Bookmark,
  Collection,
  Law,
  LawNode,
  LawRevision,
  ReviewLog,
  StudyCard,
  StudySession,
} from "@/core/domain";
import type { SavedLawSummary, StorageRepository } from "@/core/storage";
import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";

import { createSavedDataExport } from "./export-data";

const law = {
  lawId: "129AC0000000089",
  title: "民法",
  aliases: [],
  source: "egov",
} satisfies Law;

const revision = {
  lawId: law.lawId,
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  fetchedAt: "2026-07-05T00:00:00.000Z",
} satisfies LawRevision;

const article = {
  id: "article:1",
  lawId: law.lawId,
  revisionId: revision.revisionId,
  type: "Article",
  path: "article:1",
  number: "1",
  title: "第一条",
  rawText: "第一条　私権は、公共の福祉に適合しなければならない。",
  plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
  children: [],
} satisfies LawNode;

const bookmark = {
  id: "bookmark-1",
  target: { lawId: law.lawId, article: "1" },
  title: "民法1条",
  tags: ["民法"],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies Bookmark;

const collection = {
  id: "collection-1",
  title: "民法総則",
  bookmarkIds: [bookmark.id],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies Collection;

const annotation = {
  id: "annotation-1",
  target: { lawId: law.lawId, article: "1" },
  note: "基本原則として確認する。",
  tags: ["民法"],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies Annotation;

const studyCard = {
  id: "study-card-1",
  source: "bookmark",
  target: { lawId: law.lawId, article: "1" },
  type: "article_number",
  question: "私権の基本原則は何条か。",
  answer: "民法1条",
  tags: ["民法"],
  examPinned: false,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies StudyCard;

const studySession = {
  id: "study-session-1",
  startedAt: "2026-07-06T00:00:00.000Z",
  cardIds: [studyCard.id],
} satisfies StudySession;

const reviewLog = {
  id: "review-log-1",
  cardId: studyCard.id,
  grade: "good",
  reviewedAt: "2026-07-06T00:04:00.000Z",
  durationMs: 1200,
  scheduler: "fixed-interval@1",
} satisfies ReviewLog;

describe("createSavedDataExport", () => {
  it.each([
    {
      exportedAt: "2026-07-07T00:00:00.000Z",
    },
  ])("exports saved law documents and saved metadata", async ({ exportedAt }) => {
    const storage = createMemoryStorageRepository({
      annotations: [annotation],
      bookmarks: [bookmark],
      collections: [collection],
      savedLawDocument: createSavedLawDocument({
        law,
        nodes: [article],
        revision,
        savedAt: "2026-07-06T00:00:00.000Z",
      }),
      studyCards: [studyCard],
      reviewLogs: [reviewLog],
      studySessions: [studySession],
    });

    await expect(createSavedDataExport(storage.repository, exportedAt)).resolves.toEqual({
      annotations: [annotation],
      bookmarks: [bookmark],
      collections: [collection],
      exportedAt,
      savedLaws: [
        {
          law,
          nodes: [article],
          revision,
          savedAt: "2026-07-06T00:00:00.000Z",
        },
      ],
      studyCards: [studyCard],
      reviewLogs: [reviewLog],
      studySessions: [studySession],
      version: 2,
    });
  });

  it("skips stale saved law summaries whose document body is unavailable", async () => {
    const summary = {
      law,
      revision,
      nodeCount: 1,
      savedAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    } satisfies SavedLawSummary;
    const repository = {
      ...createMemoryStorageRepository().repository,
      getLawDocument: vi.fn<StorageRepository["getLawDocument"]>(() => Promise.resolve(undefined)),
      listSavedLaws: vi.fn<StorageRepository["listSavedLaws"]>(() => Promise.resolve([summary])),
    };

    await expect(
      createSavedDataExport(repository, "2026-07-07T00:00:00.000Z"),
    ).resolves.toMatchObject({
      bookmarks: [],
      collections: [],
      savedLaws: [],
      version: 2,
    });
    expect(repository.getLawDocument).toHaveBeenCalledWith(law.lawId);
  });

  it("continues exporting user metadata when a saved law document fails to load", async () => {
    const summary = {
      law,
      revision,
      nodeCount: 1,
      savedAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    } satisfies SavedLawSummary;
    const repository = {
      ...createMemoryStorageRepository({
        annotations: [annotation],
        bookmarks: [bookmark],
        collections: [collection],
        studyCards: [studyCard],
        studySessions: [studySession],
      }).repository,
      getLawDocument: vi.fn<StorageRepository["getLawDocument"]>(() =>
        Promise.reject(new Error("IndexedDB read failed")),
      ),
      listSavedLaws: vi.fn<StorageRepository["listSavedLaws"]>(() => Promise.resolve([summary])),
    };

    await expect(
      createSavedDataExport(repository, "2026-07-07T00:00:00.000Z"),
    ).resolves.toMatchObject({
      annotations: [annotation],
      bookmarks: [bookmark],
      collections: [collection],
      savedLaws: [],
      studyCards: [studyCard],
      studySessions: [studySession],
      version: 2,
    });
    expect(repository.getLawDocument).toHaveBeenCalledWith(law.lawId);
  });

  it("loads saved law documents one at a time to limit export memory usage", async () => {
    const secondLaw = {
      ...law,
      lawId: "322AC0000000049",
      title: "刑法",
    } satisfies Law;
    const firstSummary = {
      law,
      revision,
      nodeCount: 1,
      savedAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    } satisfies SavedLawSummary;
    const secondSummary = {
      law: secondLaw,
      revision: { ...revision, lawId: secondLaw.lawId },
      nodeCount: 1,
      savedAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    } satisfies SavedLawSummary;
    let resolveFirstDocument: (
      document: Awaited<ReturnType<StorageRepository["getLawDocument"]>>,
    ) => void = () => undefined;
    const firstDocument = new Promise<Awaited<ReturnType<StorageRepository["getLawDocument"]>>>(
      (resolve) => {
        resolveFirstDocument = resolve;
      },
    );
    const repository = {
      ...createMemoryStorageRepository().repository,
      getLawDocument: vi.fn<StorageRepository["getLawDocument"]>((lawId) => {
        if (lawId === law.lawId) {
          return firstDocument;
        }

        return Promise.resolve(
          createSavedLawDocument({
            law: secondLaw,
            nodes: [article],
            revision: { ...revision, lawId: secondLaw.lawId },
          }),
        );
      }),
      listSavedLaws: vi.fn<StorageRepository["listSavedLaws"]>(() =>
        Promise.resolve([firstSummary, secondSummary]),
      ),
    };

    const exportPromise = createSavedDataExport(repository, "2026-07-07T00:00:00.000Z");

    await vi.waitFor(() => {
      expect(repository.getLawDocument).toHaveBeenCalled();
    });
    expect(repository.getLawDocument).toHaveBeenCalledTimes(1);
    expect(repository.getLawDocument).toHaveBeenCalledWith(law.lawId);

    resolveFirstDocument(
      createSavedLawDocument({
        law,
        nodes: [article],
        revision,
      }),
    );

    const exported = await exportPromise;

    expect(exported.savedLaws.map((savedLaw) => savedLaw.law.lawId)).toEqual([
      law.lawId,
      secondLaw.lawId,
    ]);
    expect(repository.getLawDocument).toHaveBeenCalledTimes(2);
    expect(repository.getLawDocument).toHaveBeenLastCalledWith(secondLaw.lawId);
  });
});
