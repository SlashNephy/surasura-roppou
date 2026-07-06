import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import type {
  Annotation,
  Bookmark,
  Collection,
  Law,
  LawNode,
  LawRevision,
  OcrSession,
  StudyCard,
  StudySession,
} from "@/core/domain";

import {
  createStorageRepository as originalCreateStorageRepository,
  deleteSurasuraDatabase,
  openSurasuraDatabase,
  surasuraDatabaseVersion,
} from "./repository";
import type { StorageRepository, StorageRepositoryOptions } from "./repository";

const fixedNow = () => new Date("2026-07-06T00:00:00.000Z");
const openedRepositories: StorageRepository[] = [];
const openedDatabaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(openedRepositories.splice(0).map((repository) => repository.close()));
  await Promise.all(openedDatabaseNames.splice(0).map((name) => deleteSurasuraDatabase(name)));
});

describe("StorageRepository", () => {
  it("persists a law document as metadata, revision, saved marker, and ordered nodes", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({ databaseName, now: fixedNow });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    await expect(repository.getLawDocument(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode, paragraphNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });
    await expect(repository.listSavedLaws()).resolves.toEqual([
      {
        law,
        revision,
        nodeCount: 2,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
      },
    ]);
  });

  it("preserves first saved time when a law document is refreshed", async () => {
    let currentTime = new Date("2026-07-06T00:00:00.000Z");
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: () => currentTime,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode] });

    currentTime = new Date("2026-07-07T00:00:00.000Z");
    await repository.saveLawDocument({ law, revision, nodes: [articleNode, paragraphNode] });

    await expect(repository.listSavedLaws()).resolves.toEqual([
      {
        law,
        revision,
        nodeCount: 2,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
    ]);
  });

  it("replaces previous revision nodes when a saved law is refreshed with another revision", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({
      databaseName,
      now: fixedNow,
    });
    const nextRevision = {
      ...revision,
      revisionId: "129AC0000000089_20260701_0000000000000",
      effectiveDate: "2026-07-01",
    } satisfies LawRevision;
    const nextNode = {
      ...articleNode,
      id: "129AC0000000089:129AC0000000089_20260701_0000000000000:article:1",
      revisionId: nextRevision.revisionId,
    } satisfies LawNode;

    await repository.saveLawDocument({ law, revision, nodes: [articleNode] });
    await repository.saveLawDocument({ law, revision: nextRevision, nodes: [nextNode] });

    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(
        database.getAllFromIndex("lawNodes", "by-law-revision", [law.lawId, revision.revisionId]),
      ).resolves.toEqual([]);
      await expect(database.get("lawRevisions", revision.revisionId)).resolves.toBeUndefined();
      await expect(
        database.getAllFromIndex("lawNodes", "by-law-revision", [
          law.lawId,
          nextRevision.revisionId,
        ]),
      ).resolves.toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("lists saved laws from newest to oldest", async () => {
    let currentTime = new Date("2026-07-06T00:00:00.000Z");
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: () => currentTime,
    });
    const olderLaw = {
      ...law,
      lawId: "129AC0000000088",
      title: "旧法",
      aliases: ["旧法"],
    } satisfies Law;
    const olderRevision = {
      ...revision,
      lawId: olderLaw.lawId,
      revisionId: "129AC0000000088_20260401_0000000000000",
    } satisfies LawRevision;
    const olderNode = {
      ...articleNode,
      id: "129AC0000000088:129AC0000000088_20260401_0000000000000:article:1",
      lawId: olderLaw.lawId,
      revisionId: olderRevision.revisionId,
    } satisfies LawNode;

    await repository.saveLawDocument({
      law: olderLaw,
      revision: olderRevision,
      nodes: [olderNode],
    });

    currentTime = new Date("2026-07-07T00:00:00.000Z");
    await repository.saveLawDocument({ law, revision, nodes: [articleNode] });

    await expect(repository.listSavedLaws()).resolves.toEqual([
      {
        law,
        revision,
        nodeCount: 1,
        savedAt: "2026-07-07T00:00:00.000Z",
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
      {
        law: olderLaw,
        revision: olderRevision,
        nodeCount: 1,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
      },
    ]);
  });

  it("keeps user bookmark, collection, annotation, and study records queryable by their public contract", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.putBookmark(bookmark);
    await repository.putCollection(collection);
    await repository.putAnnotation(annotation);
    await repository.putStudyCard(studyCard);
    await repository.putStudySession(studySession);

    await expect(repository.listBookmarks()).resolves.toEqual([bookmark]);
    await expect(repository.listBookmarks({ lawId: law.lawId })).resolves.toEqual([bookmark]);
    await expect(repository.listBookmarks({ lawId: "not-matching-law" })).resolves.toEqual([]);
    await expect(repository.listCollections()).resolves.toEqual([collection]);
    await expect(repository.listAnnotations({ lawId: law.lawId })).resolves.toEqual([annotation]);
    await expect(repository.listAnnotations({ lawId: "not-matching-law" })).resolves.toEqual([]);
    await expect(repository.listDueStudyCards("2026-07-07T00:00:00.000Z")).resolves.toEqual([
      studyCard,
    ]);
    await expect(repository.listStudySessions()).resolves.toEqual([studySession]);
  });

  it("returns only due study cards at or before the requested timestamp", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });
    const futureStudyCard = {
      ...studyCard,
      id: "card-2",
      dueAt: "2026-07-08T00:00:00.000Z",
    } satisfies StudyCard;

    await repository.putStudyCard(studyCard);
    await repository.putStudyCard(futureStudyCard);

    await expect(repository.listDueStudyCards("2026-07-06T00:00:00.000Z")).resolves.toEqual([
      studyCard,
    ]);
  });

  it("records OCR sessions without requiring image blob persistence", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.putOcrSession(ocrSession);

    await expect(repository.listOcrSessions()).resolves.toEqual([ocrSession]);
  });

  it("deletes a saved law and its structural nodes without deleting user-owned notes", async () => {
    const databaseName = createDatabaseName();
    const repository = createStorageRepository({
      databaseName,
      now: fixedNow,
    });

    await repository.saveLawDocument({ law, revision, nodes: [articleNode] });
    await repository.putBookmark(bookmark);

    await repository.deleteLawDocument(law.lawId);

    await expect(repository.getLawDocument(law.lawId)).resolves.toBeUndefined();
    await expect(repository.listBookmarks({ lawId: law.lawId })).resolves.toEqual([bookmark]);

    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(
        database.getAllFromIndex("lawNodes", "by-law-revision", [law.lawId, revision.revisionId]),
      ).resolves.toEqual([]);
      await expect(database.get("laws", law.lawId)).resolves.toBeUndefined();
      await expect(database.get("lawRevisions", revision.revisionId)).resolves.toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("exposes schema version 1 for the first offline storage migration", () => {
    expect(surasuraDatabaseVersion).toBe(1);
  });

  it("closes the cached connection and can reopen on later operations", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: fixedNow,
    });

    await repository.putCollection(collection);
    await repository.close();

    await repository.putCollection({ ...collection, id: "collection-2", title: "再オープン" });

    await expect(repository.listCollections()).resolves.toEqual([
      collection,
      { ...collection, id: "collection-2", title: "再オープン" },
    ]);
  });
});

const createStorageRepository = (options: StorageRepositoryOptions): StorageRepository => {
  const repository = originalCreateStorageRepository(options);
  openedRepositories.push(repository);
  return repository;
};

const createDatabaseName = (): string => {
  const name = `surasura-roppou-test-${crypto.randomUUID()}`;
  openedDatabaseNames.push(name);
  return name;
};

const law = {
  lawId: "129AC0000000089",
  title: "民法",
  lawNumber: "明治二十九年法律第八十九号",
  lawType: "Act",
  aliases: ["民法", "民"],
  source: "egov",
  updatedAt: "2026-06-24T10:54:14+09:00",
} satisfies Law;

const revision = {
  lawId: law.lawId,
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  effectiveDate: "2026-06-24",
  fetchedAt: "2026-07-06T00:00:00.000Z",
  sourceUrl: "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089",
} satisfies LawRevision;

const articleNode = {
  id: "129AC0000000089:129AC0000000089_20260624_508AC0000000045:article:1",
  lawId: law.lawId,
  revisionId: revision.revisionId,
  type: "Article",
  path: "article:1",
  number: "1",
  title: "第一条",
  rawText: "第一条　私権は、公共の福祉に適合しなければならない。",
  plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
  normalizedText: "第一条 私権は、公共の福祉に適合しなければならない。",
  children: ["129AC0000000089:129AC0000000089_20260624_508AC0000000045:article:1/paragraph:1"],
} satisfies LawNode;

const paragraphNode = {
  id: "129AC0000000089:129AC0000000089_20260624_508AC0000000045:article:1/paragraph:1",
  lawId: law.lawId,
  revisionId: revision.revisionId,
  type: "Paragraph",
  path: "article:1/paragraph:1",
  number: "1",
  rawText: "私権は、公共の福祉に適合しなければならない。",
  plainText: "私権は、公共の福祉に適合しなければならない。",
  normalizedText: "私権は、公共の福祉に適合しなければならない。",
  children: [],
  parentId: articleNode.id,
} satisfies LawNode;

const bookmark = {
  id: "bookmark-1",
  target: { lawId: law.lawId, revisionId: revision.revisionId, article: "1" },
  title: "民法1条",
  note: "基本原則",
  tags: ["民法"],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies Bookmark;

const collection = {
  id: "collection-1",
  title: "総則",
  bookmarkIds: [bookmark.id],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies Collection;

const annotation = {
  id: "annotation-1",
  target: bookmark.target,
  targetText: "公共の福祉",
  note: "基本原則として確認する",
  tags: ["論点"],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies Annotation;

const studyCard = {
  id: "card-1",
  source: "bookmark",
  target: bookmark.target,
  type: "article_number",
  question: "私権の公共の福祉適合性は何条か。",
  answer: "民法1条",
  tags: ["民法"],
  dueAt: "2026-07-06T00:00:00.000Z",
  intervalDays: 1,
  ease: 2.5,
  mistakes: 0,
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies StudyCard;

const studySession = {
  id: "study-session-1",
  startedAt: "2026-07-06T00:00:00.000Z",
  finishedAt: "2026-07-06T00:05:00.000Z",
  cardIds: [studyCard.id],
  results: [
    {
      cardId: studyCard.id,
      answeredAt: "2026-07-06T00:04:00.000Z",
      rating: "good",
      elapsedMs: 1200,
      wasCorrect: true,
    },
  ],
} satisfies StudySession;

const ocrSession = {
  id: "ocr-session-1",
  sourceText: "民法第一条",
  detectedReferences: [
    {
      id: "detected-1",
      rawText: "民法第一条",
      normalizedText: "民法1条",
      lawAlias: "民法",
      article: "1",
      confidence: 0.92,
      source: { type: "ocr" },
      candidates: [
        {
          lawId: law.lawId,
          lawTitle: law.title,
          revisionId: revision.revisionId,
          article: "1",
          score: 0.95,
          reason: ["法令名が一致", "条番号が一致"],
        },
      ],
    },
  ],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
} satisfies OcrSession;
