import { deleteDB, openDB } from "idb";
import type { IDBPDatabase, IDBPTransaction, StoreNames } from "idb";

import { buildArticleReferenceKey } from "@/core/domain";
import type {
  Annotation,
  Bookmark,
  CardSchedule,
  Collection,
  ISODateString,
  Law,
  LawNode,
  LawReferenceTarget,
  LawRevision,
  OcrSession,
  ReviewLog,
  StudyCard,
  StudySession,
} from "@/core/domain";

import {
  surasuraDatabaseName,
  surasuraDatabaseVersion,
  type StoredLawNode,
  type SurasuraDatabase,
  type TargetIndexes,
} from "./schema";

export { surasuraDatabaseName, surasuraDatabaseVersion } from "./schema";
export type { SavedLawRecord, SurasuraDatabase } from "./schema";

type NowProvider = () => Date;

export interface StorageRepositoryOptions {
  databaseName?: string;
  now?: NowProvider;
}

export interface LawDocumentInput {
  law: Law;
  revision: LawRevision;
  nodes: LawNode[];
}

export interface SavedLawDocument extends LawDocumentInput {
  savedAt: ISODateString;
}

export interface SavedLawSummary {
  law: Law;
  revision: LawRevision;
  nodeCount: number;
  savedAt: ISODateString;
  updatedAt: ISODateString;
}

export interface LawScopedQuery {
  lawId?: string;
}

// 出題キューの 1 項目。カード本文と導出スケジュールを結合して返す。
export interface DueStudyCard {
  card: StudyCard;
  schedule: CardSchedule;
}

export interface StorageRepository {
  saveLawDocument(document: LawDocumentInput): Promise<void>;
  getLawDocument(lawId: string): Promise<SavedLawDocument | undefined>;
  listSavedLaws(): Promise<SavedLawSummary[]>;
  deleteLawDocument(lawId: string): Promise<void>;
  putBookmark(bookmark: Bookmark): Promise<void>;
  listBookmarks(query?: LawScopedQuery): Promise<Bookmark[]>;
  putCollection(collection: Collection): Promise<void>;
  listCollections(): Promise<Collection[]>;
  putAnnotation(annotation: Annotation): Promise<void>;
  listAnnotations(query?: LawScopedQuery): Promise<Annotation[]>;
  putStudyCard(card: StudyCard): Promise<void>;
  listStudyCards(query?: LawScopedQuery): Promise<StudyCard[]>;
  listDueStudyCards(dueAtOrBefore: ISODateString): Promise<DueStudyCard[]>;
  listReviewLogs(cardId?: string): Promise<ReviewLog[]>;
  putStudySession(session: StudySession): Promise<void>;
  listStudySessions(): Promise<StudySession[]>;
  putOcrSession(session: OcrSession): Promise<void>;
  listOcrSessions(): Promise<OcrSession[]>;
  close(): Promise<void>;
}

export const createStorageRepository = (
  options: StorageRepositoryOptions = {},
): StorageRepository => {
  const databaseName = options.databaseName ?? surasuraDatabaseName;
  const now = options.now ?? (() => new Date());
  let databasePromise: Promise<IDBPDatabase<SurasuraDatabase>> | undefined;
  const getDatabase = () => {
    databasePromise ??= openSurasuraDatabase(databaseName);
    return databasePromise;
  };
  const withDatabase = async <T>(
    operation: (database: IDBPDatabase<SurasuraDatabase>) => Promise<T>,
  ): Promise<T> => {
    const database = await getDatabase();
    return operation(database);
  };

  return {
    async saveLawDocument(document) {
      await withDatabase(async (db) => {
        const updatedAt = now().toISOString();
        const tx = db.transaction(["laws", "lawRevisions", "lawNodes", "savedLaws"], "readwrite");
        const nodes = tx.objectStore("lawNodes");
        const lawRevisions = tx.objectStore("lawRevisions");
        const savedLaws = tx.objectStore("savedLaws");
        const existingSavedLaw = await savedLaws.get(document.law.lawId);
        const replacedRevisionId = existingSavedLaw?.revisionId ?? document.revision.revisionId;
        const existingNodeKeys = await nodes
          .index("by-law-revision")
          .getAllKeys([document.law.lawId, replacedRevisionId]);

        for (const key of existingNodeKeys) {
          void nodes.delete(key);
        }

        void tx.objectStore("laws").put(document.law);
        if (replacedRevisionId !== document.revision.revisionId) {
          void lawRevisions.delete(replacedRevisionId);
        }

        void lawRevisions.put(document.revision);

        for (const [sortOrder, node] of document.nodes.entries()) {
          void nodes.put({
            id: node.id,
            lawId: node.lawId,
            revisionId: node.revisionId,
            sortOrder,
            node,
          });
        }

        void savedLaws.put({
          lawId: document.law.lawId,
          revisionId: document.revision.revisionId,
          nodeCount: document.nodes.length,
          savedAt: existingSavedLaw?.savedAt ?? updatedAt,
          updatedAt,
        });
        await tx.done;
      });
    },

    async getLawDocument(lawId) {
      return withDatabase(async (db) => {
        const tx = db.transaction(["savedLaws", "laws", "lawRevisions", "lawNodes"], "readonly");
        const savedLaw = await tx.objectStore("savedLaws").get(lawId);

        if (savedLaw === undefined) {
          return undefined;
        }

        const [law, revision, storedNodes] = await Promise.all([
          tx.objectStore("laws").get(savedLaw.lawId),
          tx.objectStore("lawRevisions").get(savedLaw.revisionId),
          tx
            .objectStore("lawNodes")
            .index("by-law-revision")
            .getAll([savedLaw.lawId, savedLaw.revisionId]),
        ]);
        await tx.done;

        if (law === undefined || revision === undefined) {
          return undefined;
        }

        return {
          law,
          revision,
          nodes: toOrderedNodes(storedNodes),
          savedAt: savedLaw.savedAt,
        };
      });
    },

    async listSavedLaws() {
      return withDatabase(async (db) => {
        const tx = db.transaction(["savedLaws", "laws", "lawRevisions"], "readonly");
        const savedLaws = tx.objectStore("savedLaws");
        const laws = tx.objectStore("laws");
        const lawRevisions = tx.objectStore("lawRevisions");
        const summaries: SavedLawSummary[] = [];

        for await (const cursor of savedLaws.index("by-saved-at").iterate(null, "prev")) {
          const savedLaw = cursor.value;
          const [law, revision] = await Promise.all([
            laws.get(savedLaw.lawId),
            lawRevisions.get(savedLaw.revisionId),
          ]);

          if (law === undefined || revision === undefined) {
            continue;
          }

          summaries.push({
            law,
            revision,
            nodeCount: savedLaw.nodeCount,
            savedAt: savedLaw.savedAt,
            updatedAt: savedLaw.updatedAt,
          });
        }
        await tx.done;

        return summaries;
      });
    },

    async deleteLawDocument(lawId) {
      await withDatabase(async (db) => {
        const tx = db.transaction(["laws", "lawRevisions", "lawNodes", "savedLaws"], "readwrite");
        const savedLaws = tx.objectStore("savedLaws");
        const savedLaw = await savedLaws.get(lawId);

        if (savedLaw === undefined) {
          await tx.done;
          return;
        }

        const nodes = tx.objectStore("lawNodes");
        const nodeKeys = await nodes
          .index("by-law-revision")
          .getAllKeys([savedLaw.lawId, savedLaw.revisionId]);

        for (const key of nodeKeys) {
          void nodes.delete(key);
        }

        await savedLaws.delete(lawId);
        void tx.objectStore("laws").delete(savedLaw.lawId);
        void tx.objectStore("lawRevisions").delete(savedLaw.revisionId);
        await tx.done;
      });
    },

    async putBookmark(bookmark) {
      await withDatabase(async (db) => {
        await db.put("bookmarks", withTargetIndexes(bookmark));
      });
    },

    async listBookmarks(query = {}) {
      return withDatabase(async (db) => {
        const records =
          query.lawId === undefined
            ? await db.getAll("bookmarks")
            : await db.getAllFromIndex("bookmarks", "by-law-id", query.lawId);

        return records.map(stripTargetIndexes);
      });
    },

    async putCollection(collection) {
      await withDatabase(async (db) => {
        await db.put("collections", collection);
      });
    },

    async listCollections() {
      return withDatabase((db) => db.getAll("collections"));
    },

    async putAnnotation(annotation) {
      await withDatabase(async (db) => {
        await db.put("annotations", withTargetIndexes(annotation));
      });
    },

    async listAnnotations(query = {}) {
      return withDatabase(async (db) => {
        const records =
          query.lawId === undefined
            ? await db.getAll("annotations")
            : await db.getAllFromIndex("annotations", "by-law-id", query.lawId);

        return records.map(stripTargetIndexes);
      });
    },

    async putStudyCard(card) {
      await withDatabase(async (db) => {
        await db.put("studyCards", withTargetIndexes(card));
      });
    },

    async listStudyCards(query = {}) {
      return withDatabase(async (db) => {
        const records =
          query.lawId === undefined
            ? await db.getAll("studyCards")
            : await db.getAllFromIndex("studyCards", "by-law-id", query.lawId);

        return records.map(stripTargetIndexes);
      });
    },

    async listDueStudyCards(dueAtOrBefore) {
      return withDatabase(async (db) => {
        // by-due-at インデックスはキー昇順で返るため、そのまま出題順（dueAt 昇順）になる。
        const schedules = await db.getAllFromIndex(
          "cardSchedules",
          "by-due-at",
          IDBKeyRange.upperBound(dueAtOrBefore),
        );
        const dueCards: DueStudyCard[] = [];

        for (const schedule of schedules) {
          const record = await db.get("studyCards", schedule.cardId);

          // スケジュールだけが残った孤児（想定外の不整合）は出題キューから除く。
          if (record !== undefined) {
            dueCards.push({ card: stripTargetIndexes(record), schedule });
          }
        }

        return dueCards;
      });
    },

    async listReviewLogs(cardId) {
      return withDatabase((db) =>
        cardId === undefined
          ? db.getAll("reviewLogs")
          : db.getAllFromIndex("reviewLogs", "by-card-id", cardId),
      );
    },

    async putStudySession(session) {
      await withDatabase(async (db) => {
        await db.put("studySessions", session);
      });
    },

    async listStudySessions() {
      return withDatabase((db) => db.getAll("studySessions"));
    },

    async putOcrSession(session) {
      await withDatabase(async (db) => {
        await db.put("ocrSessions", session);
      });
    },

    async listOcrSessions() {
      return withDatabase((db) => db.getAll("ocrSessions"));
    },

    async close() {
      if (databasePromise === undefined) {
        return;
      }

      const database = await databasePromise;
      database.close();
      databasePromise = undefined;
    },
  };
};

export const openSurasuraDatabase = async (
  databaseName = surasuraDatabaseName,
): Promise<IDBPDatabase<SurasuraDatabase>> =>
  openDB<SurasuraDatabase>(databaseName, surasuraDatabaseVersion, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        createVersion1Stores(database);
      }

      if (oldVersion < 2) {
        createVersion2Stores(database);
      }

      if (oldVersion < 3) {
        createVersion3Stores(database, transaction);
      }
    },
    blocked() {
      return undefined;
    },
    blocking(_currentVersion, _blockedVersion, event) {
      if (event.target instanceof IDBDatabase) {
        event.target.close();
      }
    },
  });

export const deleteSurasuraDatabase = async (
  databaseName = surasuraDatabaseName,
): Promise<void> => {
  await deleteDB(databaseName);
};

const createVersion1Stores = (database: IDBPDatabase<SurasuraDatabase>) => {
  const laws = database.createObjectStore("laws", { keyPath: "lawId" });
  laws.createIndex("by-title", "title");
  laws.createIndex("by-updated-at", "updatedAt");

  const lawRevisions = database.createObjectStore("lawRevisions", { keyPath: "revisionId" });
  lawRevisions.createIndex("by-law-id", "lawId");
  lawRevisions.createIndex("by-effective-date", "effectiveDate");

  const lawNodes = database.createObjectStore("lawNodes", { keyPath: "id" });
  lawNodes.createIndex("by-law-revision", ["lawId", "revisionId"]);

  const savedLaws = database.createObjectStore("savedLaws", { keyPath: "lawId" });
  savedLaws.createIndex("by-saved-at", "savedAt");
  savedLaws.createIndex("by-updated-at", "updatedAt");

  const bookmarks = database.createObjectStore("bookmarks", { keyPath: "id" });
  bookmarks.createIndex("by-law-id", "lawId");
  bookmarks.createIndex("by-target-key", "targetKey");
  bookmarks.createIndex("by-updated-at", "updatedAt");

  const collections = database.createObjectStore("collections", { keyPath: "id" });
  collections.createIndex("by-updated-at", "updatedAt");

  const annotations = database.createObjectStore("annotations", { keyPath: "id" });
  annotations.createIndex("by-law-id", "lawId");
  annotations.createIndex("by-target-key", "targetKey");
  annotations.createIndex("by-updated-at", "updatedAt");

  const studyCards = database.createObjectStore("studyCards", { keyPath: "id" });
  // v1 では by-due-at インデックスを作成する。v3 マイグレーションで削除される。
  (studyCards as unknown as IDBObjectStore).createIndex("by-due-at", "dueAt");
  studyCards.createIndex("by-law-id", "lawId");
  studyCards.createIndex("by-target-key", "targetKey");
  studyCards.createIndex("by-updated-at", "updatedAt");

  const studySessions = database.createObjectStore("studySessions", { keyPath: "id" });
  studySessions.createIndex("by-started-at", "startedAt");

  const ocrSessions = database.createObjectStore("ocrSessions", { keyPath: "id" });
  ocrSessions.createIndex("by-created-at", "createdAt");
  ocrSessions.createIndex("by-updated-at", "updatedAt");
};

const createVersion2Stores = (database: IDBPDatabase<SurasuraDatabase>) => {
  const lawCatalog = database.createObjectStore("lawCatalog", { keyPath: "lawId" });
  lawCatalog.createIndex("by-title", "title");
  lawCatalog.createIndex("by-cached-at", "cachedAt");

  const searchPostings = database.createObjectStore("searchPostings", {
    keyPath: ["lawId", "bigram"],
  });
  searchPostings.createIndex("by-bigram", "bigram");
  searchPostings.createIndex("by-law-id", "lawId");
};

type VersionChangeTransaction = IDBPTransaction<
  SurasuraDatabase,
  ArrayLike<StoreNames<SurasuraDatabase>>,
  "versionchange"
>;

const createVersion3Stores = (
  database: IDBPDatabase<SurasuraDatabase>,
  transaction: VersionChangeTransaction,
) => {
  const reviewLogs = database.createObjectStore("reviewLogs", { keyPath: "id" });
  reviewLogs.createIndex("by-card-id", "cardId");
  reviewLogs.createIndex("by-reviewed-at", "reviewedAt");

  const cardSchedules = database.createObjectStore("cardSchedules", { keyPath: "cardId" });
  cardSchedules.createIndex("by-due-at", "dueAt");

  // 期限は cardSchedules に一本化するため、v1 で作った studyCards の by-due-at は捨てる。
  // v3 スキーマからは除去済みなので、型チェックを回避して raw IDB を使う。
  (transaction.objectStore("studyCards") as unknown as IDBObjectStore).deleteIndex("by-due-at");
};

const toOrderedNodes = (records: StoredLawNode[]): LawNode[] =>
  records.sort((left, right) => left.sortOrder - right.sortOrder).map((record) => record.node);

const withTargetIndexes = <T extends { id: string; target: LawReferenceTarget }>(
  record: T,
): T & TargetIndexes => ({
  ...record,
  lawId: record.target.lawId,
  targetKey: buildArticleReferenceKey(record.target),
});

const stripTargetIndexes = <T extends { id: string }>(record: T & TargetIndexes): T => {
  const { lawId, targetKey, ...publicRecord } = record;
  void lawId;
  void targetKey;
  return publicRecord as unknown as T;
};
