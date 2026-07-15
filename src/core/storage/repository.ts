import { deleteDB, openDB } from "idb";
import type { IDBPDatabase, IDBPTransaction, StoreNames } from "idb";

import { fixedIntervalScheduler } from "@/core/study";
import { migrateRecordsToVersion3 } from "./migrations";
import type {
  Annotation,
  Bookmark,
  CardSchedule,
  Collection,
  ISODateString,
  Law,
  LawNode,
  LawRevision,
  OcrSession,
  ReviewLog,
  StudyCard,
  StudySession,
} from "@/core/domain";

import type { SavedDataExport } from "./export-data";
import { importSavedDataIntoDatabase } from "./import-saved-data";
import type { SavedDataImportResult } from "./import-data";
import {
  surasuraDatabaseName,
  surasuraDatabaseVersion,
  type StoredLawNode,
  type SurasuraDatabase,
} from "./schema";
import { stripTargetIndexes, withTargetIndexes } from "./stored-record";

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
  getStudyCard(cardId: string): Promise<StudyCard | undefined>;
  listStudyCards(query?: LawScopedQuery): Promise<StudyCard[]>;
  deleteStudyCard(cardId: string): Promise<void>;
  listDueStudyCards(dueAtOrBefore: ISODateString): Promise<DueStudyCard[]>;
  // 未学習カード(= cardSchedules に行がないカード)を createdAt 昇順で返す。
  listUnscheduledStudyCards(): Promise<StudyCard[]>;
  listReviewLogs(cardId?: string): Promise<ReviewLog[]>;
  recordReview(log: ReviewLog): Promise<CardSchedule>;
  putStudySession(session: StudySession): Promise<void>;
  listStudySessions(): Promise<StudySession[]>;
  importSavedData(data: SavedDataExport): Promise<SavedDataImportResult>;
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

    async getStudyCard(cardId) {
      return withDatabase(async (db) => {
        const record = await db.get("studyCards", cardId);

        return record === undefined ? undefined : stripTargetIndexes(record);
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

    async deleteStudyCard(cardId) {
      await withDatabase(async (db) => {
        // カードに紐づくログとスケジュールも同一トランザクションで消す。
        // 孤児ログは再計算先を失い、export しても import 先で整合しないため。
        const tx = db.transaction(["studyCards", "reviewLogs", "cardSchedules"], "readwrite");
        const logKeys = await tx.objectStore("reviewLogs").index("by-card-id").getAllKeys(cardId);

        for (const key of logKeys) {
          void tx.objectStore("reviewLogs").delete(key);
        }

        void tx.objectStore("cardSchedules").delete(cardId);
        void tx.objectStore("studyCards").delete(cardId);
        await tx.done;
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

    async listUnscheduledStudyCards() {
      return withDatabase(async (db) => {
        // カード総数は個人利用で高々数千件の想定のため、メモリ内の差集合で賄う
        // (examPinned フィルタと同じ整理。boolean は IndexedDB のインデックスにできない)。
        const [records, scheduledIds] = await Promise.all([
          db.getAll("studyCards"),
          db.getAllKeys("cardSchedules"),
        ]);
        const scheduled = new Set<string>(scheduledIds);

        return records
          .filter((record) => !scheduled.has(record.id))
          .map(stripTargetIndexes)
          .sort((left, right) =>
            // 古く作ったカードから覚える。同時刻でも順序が決定的になるよう id を第 2 キーにする。
            left.createdAt === right.createdAt
              ? left.id.localeCompare(right.id)
              : left.createdAt.localeCompare(right.createdAt),
          );
      });
    },

    async listReviewLogs(cardId) {
      return withDatabase((db) =>
        cardId === undefined
          ? db.getAll("reviewLogs")
          : db.getAllFromIndex("reviewLogs", "by-card-id", cardId),
      );
    },

    async recordReview(log) {
      return withDatabase(async (db) => {
        // 追記と再計算を同一トランザクションで行い、ログとスケジュールのずれを防ぐ。
        const tx = db.transaction(["reviewLogs", "cardSchedules"], "readwrite");

        await tx.objectStore("reviewLogs").put(log);

        const history = await tx.objectStore("reviewLogs").index("by-card-id").getAll(log.cardId);
        const schedule = fixedIntervalScheduler(history, now());

        await tx.objectStore("cardSchedules").put(schedule);
        await tx.done;

        return schedule;
      });
    },

    async putStudySession(session) {
      await withDatabase(async (db) => {
        await db.put("studySessions", session);
      });
    },

    async listStudySessions() {
      return withDatabase((db) => db.getAll("studySessions"));
    },

    async importSavedData(data) {
      return withDatabase((db) => importSavedDataIntoDatabase(db, data, now().toISOString()));
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

        // ストア新設と同じ versionchange トランザクション内で旧レコードを変換する。
        // idb の upgrade コールバックは async 非対応（void 型）のため void で発火する。
        // IDB のトランザクション自動コミットは未完了リクエストがある間は発生しないため、
        // 移行完了まで versionchange トランザクションは維持される。
        if (oldVersion > 0) {
          void migrateRecordsToVersion3(transaction).catch((error: unknown) => {
            // 予期しない移行例外は versionchange トランザクションを abort して openDB の reject へ流す（スペック 8 章）。
            console.error("study data migration failed", error);
            try {
              transaction.abort();
            } catch {
              // トランザクションが既に終了していると abort は InvalidStateError を投げるが、その場合は既に失敗経路にある。
            }
          });
        }
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

export type VersionChangeTransaction = IDBPTransaction<
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
