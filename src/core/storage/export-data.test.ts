import { describe, expect, it, vi } from "vitest";

import type {
  Annotation,
  Bookmark,
  Collection,
  Law,
  LawNode,
  LawRevision,
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
  dueAt: "2026-07-08T00:00:00.000Z",
  intervalDays: 1,
  ease: 2.5,
  mistakes: 0,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies StudyCard;

const studySession = {
  id: "study-session-1",
  startedAt: "2026-07-06T00:00:00.000Z",
  cardIds: [studyCard.id],
  results: [],
} satisfies StudySession;

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
      studySessions: [studySession],
      version: 1,
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
      version: 1,
    });
    expect(repository.getLawDocument).toHaveBeenCalledWith(law.lawId);
  });
});
