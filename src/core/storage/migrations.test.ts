import "fake-indexeddb/auto";

import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import { deleteSurasuraDatabase, openSurasuraDatabase } from "./repository";

const openedDatabaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(openedDatabaseNames.splice(0).map((name) => deleteSurasuraDatabase(name)));
});

let databaseSequence = 0;

const createDatabaseName = () => {
  databaseSequence += 1;
  const name = `surasura-migration-test-${String(databaseSequence)}`;
  openedDatabaseNames.push(name);

  return name;
};

// v2 リリース当時のスキーマを固定的に再現する。
// repository.ts の現行コードを流用しない: 将来ストア定義が変わっても、
// 移行テストは「当時の形の DB」から始まらなければ意味がないため。
const seedVersion2Database = async (
  databaseName: string,
  records: {
    studyCards?: Record<string, unknown>[];
    studySessions?: Record<string, unknown>[];
  },
) => {
  const database = await openDB(databaseName, 2, {
    upgrade(db) {
      const laws = db.createObjectStore("laws", { keyPath: "lawId" });
      laws.createIndex("by-title", "title");
      laws.createIndex("by-updated-at", "updatedAt");

      const lawRevisions = db.createObjectStore("lawRevisions", { keyPath: "revisionId" });
      lawRevisions.createIndex("by-law-id", "lawId");
      lawRevisions.createIndex("by-effective-date", "effectiveDate");

      const lawNodes = db.createObjectStore("lawNodes", { keyPath: "id" });
      lawNodes.createIndex("by-law-revision", ["lawId", "revisionId"]);

      const savedLaws = db.createObjectStore("savedLaws", { keyPath: "lawId" });
      savedLaws.createIndex("by-saved-at", "savedAt");
      savedLaws.createIndex("by-updated-at", "updatedAt");

      const bookmarks = db.createObjectStore("bookmarks", { keyPath: "id" });
      bookmarks.createIndex("by-law-id", "lawId");
      bookmarks.createIndex("by-target-key", "targetKey");
      bookmarks.createIndex("by-updated-at", "updatedAt");

      const collections = db.createObjectStore("collections", { keyPath: "id" });
      collections.createIndex("by-updated-at", "updatedAt");

      const annotations = db.createObjectStore("annotations", { keyPath: "id" });
      annotations.createIndex("by-law-id", "lawId");
      annotations.createIndex("by-target-key", "targetKey");
      annotations.createIndex("by-updated-at", "updatedAt");

      const studyCards = db.createObjectStore("studyCards", { keyPath: "id" });
      studyCards.createIndex("by-due-at", "dueAt");
      studyCards.createIndex("by-law-id", "lawId");
      studyCards.createIndex("by-target-key", "targetKey");
      studyCards.createIndex("by-updated-at", "updatedAt");

      const studySessions = db.createObjectStore("studySessions", { keyPath: "id" });
      studySessions.createIndex("by-started-at", "startedAt");

      const ocrSessions = db.createObjectStore("ocrSessions", { keyPath: "id" });
      ocrSessions.createIndex("by-created-at", "createdAt");
      ocrSessions.createIndex("by-updated-at", "updatedAt");

      const lawCatalog = db.createObjectStore("lawCatalog", { keyPath: "lawId" });
      lawCatalog.createIndex("by-title", "title");
      lawCatalog.createIndex("by-cached-at", "cachedAt");

      const searchPostings = db.createObjectStore("searchPostings", {
        keyPath: ["lawId", "bigram"],
      });
      searchPostings.createIndex("by-bigram", "bigram");
      searchPostings.createIndex("by-law-id", "lawId");
    },
  });

  for (const card of records.studyCards ?? []) {
    await database.put("studyCards", card);
  }

  for (const session of records.studySessions ?? []) {
    await database.put("studySessions", session);
  }

  database.close();
};

const legacyStudyCard = {
  id: "card-1",
  source: "manual",
  target: { lawId: "129AC0000000089", revisionId: "rev-1", article: "1" },
  lawId: "129AC0000000089",
  targetKey: "law:129AC0000000089/revision:rev-1/article:1",
  type: "fill_blank",
  question: "私権は、（　　）に適合しなければならない。",
  answer: "公共の福祉",
  tags: [],
  dueAt: "2026-07-06T00:00:00.000Z",
  intervalDays: 1,
  ease: 2.5,
  mistakes: 0,
  lastReviewedAt: "2026-07-05T00:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-05T00:00:00.000Z",
};

describe("v2 -> v3 migration", () => {
  it("strips schedule fields from study cards and fills examPinned", async () => {
    const databaseName = createDatabaseName();
    await seedVersion2Database(databaseName, { studyCards: [legacyStudyCard] });

    const database = await openSurasuraDatabase(databaseName);
    try {
      const record = await database.get("studyCards", "card-1");

      expect(record).toEqual({
        id: "card-1",
        source: "manual",
        target: legacyStudyCard.target,
        lawId: legacyStudyCard.lawId,
        targetKey: legacyStudyCard.targetKey,
        type: "fill_blank",
        question: legacyStudyCard.question,
        answer: legacyStudyCard.answer,
        tags: [],
        examPinned: false,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
      });
      expect([...database.transaction("studyCards").store.indexNames]).not.toContain("by-due-at");
    } finally {
      database.close();
    }
  });

  it("converts legacy session results into review logs and derives schedules", async () => {
    const databaseName = createDatabaseName();
    await seedVersion2Database(databaseName, {
      studyCards: [legacyStudyCard],
      studySessions: [
        {
          id: "session-1",
          startedAt: "2026-07-05T00:00:00.000Z",
          finishedAt: "2026-07-05T00:10:00.000Z",
          cardIds: ["card-1"],
          results: [
            {
              cardId: "card-1",
              answeredAt: "2026-07-05T00:04:00.000Z",
              rating: "good",
              elapsedMs: 1200,
              wasCorrect: true,
            },
            {
              cardId: "card-1",
              answeredAt: "2026-07-05T00:09:00.000Z",
              rating: "good",
              elapsedMs: 800,
              wasCorrect: true,
            },
          ],
        },
      ],
    });

    const database = await openSurasuraDatabase(databaseName);
    try {
      await expect(database.getAll("reviewLogs")).resolves.toEqual([
        {
          id: "legacy-session-1-0",
          cardId: "card-1",
          sessionId: "session-1",
          grade: "good",
          reviewedAt: "2026-07-05T00:04:00.000Z",
          durationMs: 1200,
          scheduler: "legacy-import",
        },
        {
          id: "legacy-session-1-1",
          cardId: "card-1",
          sessionId: "session-1",
          grade: "good",
          reviewedAt: "2026-07-05T00:09:00.000Z",
          durationMs: 800,
          scheduler: "legacy-import",
        },
      ]);
      // good good で卒業して最後の回答の 1 日後が期限（fixed-interval@1 での再計算）。
      await expect(database.get("cardSchedules", "card-1")).resolves.toEqual({
        cardId: "card-1",
        dueAt: "2026-07-06T00:09:00.000Z",
        intervalDays: 1,
        lapses: 0,
        reviews: 2,
        recentMistakeRate: 0,
        derivedFrom: "legacy-session-1-1",
      });
      await expect(database.get("studySessions", "session-1")).resolves.toEqual({
        id: "session-1",
        startedAt: "2026-07-05T00:00:00.000Z",
        finishedAt: "2026-07-05T00:10:00.000Z",
        cardIds: ["card-1"],
      });
    } finally {
      database.close();
    }
  });

  it("skips broken results but keeps the rest", async () => {
    const databaseName = createDatabaseName();
    await seedVersion2Database(databaseName, {
      studyCards: [legacyStudyCard],
      studySessions: [
        {
          id: "session-1",
          startedAt: "2026-07-05T00:00:00.000Z",
          cardIds: ["card-1"],
          results: [
            {
              cardId: "card-1",
              answeredAt: "2026-07-05T00:04:00.000Z",
              rating: "invalid-rating",
              elapsedMs: 1200,
              wasCorrect: false,
            },
            {
              cardId: "card-1",
              answeredAt: "2026-07-05T00:09:00.000Z",
              rating: "easy",
              elapsedMs: 800,
              wasCorrect: true,
            },
          ],
        },
      ],
    });

    const database = await openSurasuraDatabase(databaseName);
    try {
      const logs = await database.getAll("reviewLogs");

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ id: "legacy-session-1-1", grade: "easy" });

      // easy 即卒業で 3 日後。壊れたログを除いた履歴から再計算されている。
      await expect(database.get("cardSchedules", "card-1")).resolves.toMatchObject({
        cardId: "card-1",
        dueAt: "2026-07-08T00:09:00.000Z",
        intervalDays: 3,
        reviews: 1,
      });
    } finally {
      database.close();
    }
  });

  it("creates the new stores on a fresh install", async () => {
    const databaseName = createDatabaseName();

    const database = await openSurasuraDatabase(databaseName);
    try {
      expect([...database.objectStoreNames]).toEqual(
        expect.arrayContaining(["studyCards", "reviewLogs", "cardSchedules"]),
      );
      expect([...database.transaction("reviewLogs").store.indexNames]).toEqual(
        expect.arrayContaining(["by-card-id", "by-reviewed-at"]),
      );
      expect([...database.transaction("cardSchedules").store.indexNames]).toEqual(
        expect.arrayContaining(["by-due-at"]),
      );
    } finally {
      database.close();
    }
  });
});
