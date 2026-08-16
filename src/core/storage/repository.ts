import { deleteDB, openDB } from "idb";
import type { IDBPDatabase, IDBPTransaction, StoreNames } from "idb";

import { fixedIntervalScheduler } from "@/core/study";
import { deleteRevisionNodes, demoteOtherCurrentRevisions } from "./current-revision-slot";
import { migrateRecordsToVersion3, migrateSavedLawStores } from "./migrations";
import { comparePinnedLaws } from "./pinned-law-order";
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
  type PinnedLawRecord,
  type SavedLawRecord,
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

export interface SavedLawRevisionSummary {
  revision: LawRevision;
  isCurrent: boolean;
  nodeCount: number;
  savedAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SaveLawDocumentOptions {
  // 既定 true。基準日指定や版固定で取得した本文を保存するときだけ false にする。
  isCurrent?: boolean;
}

// saveLawDocument の結果。要求した isCurrent と実際に現行版スロットへ入ったかは一致しない
// ことがある（例: 現行版が 1 件も無い法令への isCurrent: false 保存は、空きスロットを
// 埋めるため現行版になる）。呼び出し側はこの結果を見て索引更新の要否を判断する。
export interface SaveLawDocumentResult {
  isCurrent: boolean;
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
  saveLawDocument(
    document: LawDocumentInput,
    options?: SaveLawDocumentOptions,
  ): Promise<SaveLawDocumentResult>;
  getLawDocument(lawId: string): Promise<SavedLawDocument | undefined>;
  getLawDocumentRevision(lawId: string, revisionId: string): Promise<SavedLawDocument | undefined>;
  listSavedLaws(): Promise<SavedLawSummary[]>;
  listSavedRevisions(lawId: string): Promise<SavedLawRevisionSummary[]>;
  deleteLawDocument(lawId: string): Promise<void>;
  deleteLawRevision(lawId: string, revisionId: string): Promise<void>;
  pinLaw(lawId: string): Promise<void>;
  unpinLaw(lawId: string): Promise<void>;
  isLawPinned(lawId: string): Promise<boolean>;
  listPinnedLaws(): Promise<PinnedLawRecord[]>;
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
    async saveLawDocument(document, options = {}) {
      return withDatabase(async (db) => {
        const updatedAt = now().toISOString();
        const tx = db.transaction(["laws", "lawRevisions", "lawNodes", "savedLaws"], "readwrite");
        const nodes = tx.objectStore("lawNodes");
        const savedLaws = tx.objectStore("savedLaws");
        const lawId = document.law.lawId;
        const revisionId = document.revision.revisionId;
        const existing = await savedLaws.get([lawId, revisionId]);
        // その法令に現行版が 1 件も無いなら、基準日指定の保存でも空きスロットを埋める。
        // 基準日を設定したまま使うユーザーは常に isCurrent: false で保存するため、これが無いと
        // by-law-current 索引が永久に空のままになり、getLawDocument によるオフライン
        // フォールバックが 1 件も引けなくなる（既存の現行版を奪うことはない）。
        const hasAnyCurrentRevision =
          (await savedLaws.index("by-law-current").count([lawId, 1])) > 0;
        // 既に現行版として保存済みの版は、基準日指定の取得で降格させない。
        const shouldBeCurrent =
          (options.isCurrent ?? true) || existing?.isCurrent === 1 || !hasAnyCurrentRevision;
        const isCurrent: 0 | 1 = shouldBeCurrent ? 1 : 0;

        // 同じ版を書き直すときだけ、その版のノードを消して入れ直す。
        await deleteRevisionNodes(nodes, lawId, revisionId);

        // 現行版スロットは 1 法令 1 件。旧現行版はフラグだけ降格し、履歴として残す。
        if (isCurrent === 1) {
          await demoteOtherCurrentRevisions(savedLaws, lawId, revisionId);
        }

        void tx.objectStore("laws").put(document.law);
        void tx.objectStore("lawRevisions").put(document.revision);

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
          lawId,
          revisionId,
          isCurrent,
          nodeCount: document.nodes.length,
          savedAt: existing?.savedAt ?? updatedAt,
          updatedAt,
        });
        await tx.done;

        // tx.done の後で返す。トランザクションが失敗した場合はここに到達せず reject される。
        return { isCurrent: shouldBeCurrent };
      });
    },

    async getLawDocument(lawId) {
      return withDatabase(async (db) => {
        const tx = db.transaction(["savedLaws", "laws", "lawRevisions", "lawNodes"], "readonly");
        const currentRecords = await tx
          .objectStore("savedLaws")
          .index("by-law-current")
          .getAll([lawId, 1]);
        const savedLaw = pickCurrentRecord(currentRecords);

        if (savedLaw === undefined) {
          return undefined;
        }

        const document = await readSavedDocument(tx, savedLaw);
        await tx.done;

        return document;
      });
    },

    async getLawDocumentRevision(lawId, revisionId) {
      return withDatabase(async (db) => {
        const tx = db.transaction(["savedLaws", "laws", "lawRevisions", "lawNodes"], "readonly");
        const savedLaw = await tx.objectStore("savedLaws").get([lawId, revisionId]);

        if (savedLaw === undefined) {
          return undefined;
        }

        const document = await readSavedDocument(tx, savedLaw);
        await tx.done;

        return document;
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

          // 一覧は法令単位。履歴版は listSavedRevisions で扱う。
          if (savedLaw.isCurrent !== 1) {
            continue;
          }

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

    async listSavedRevisions(lawId) {
      return withDatabase(async (db) => {
        const tx = db.transaction(["savedLaws", "lawRevisions"], "readonly");
        const records = await tx.objectStore("savedLaws").index("by-law-id").getAll(lawId);
        const lawRevisions = tx.objectStore("lawRevisions");
        const summaries: SavedLawRevisionSummary[] = [];

        for (const record of records) {
          const revision = await lawRevisions.get(record.revisionId);

          if (revision === undefined) {
            continue;
          }

          summaries.push({
            revision,
            isCurrent: record.isCurrent === 1,
            nodeCount: record.nodeCount,
            savedAt: record.savedAt,
            updatedAt: record.updatedAt,
          });
        }
        await tx.done;

        // 新しく保存したものから並べる（一覧の既定の並びと揃える）。
        // 同一トランザクションでの複数版保存やインポートでは savedAt が同値になりうるため、
        // 索引の返却順に依存しないよう revisionId を第 2 キーにして順序を決定的にする。
        return summaries.sort((left, right) =>
          left.savedAt === right.savedAt
            ? right.revision.revisionId.localeCompare(left.revision.revisionId)
            : right.savedAt.localeCompare(left.savedAt),
        );
      });
    },

    async deleteLawDocument(lawId) {
      await withDatabase(async (db) => {
        const tx = db.transaction(["laws", "lawRevisions", "lawNodes", "savedLaws"], "readwrite");
        const savedLaws = tx.objectStore("savedLaws");
        const records = await savedLaws.index("by-law-id").getAll(lawId);

        if (records.length === 0) {
          await tx.done;
          return;
        }

        const nodes = tx.objectStore("lawNodes");
        const lawRevisions = tx.objectStore("lawRevisions");

        for (const record of records) {
          const nodeKeys = await nodes
            .index("by-law-revision")
            .getAllKeys([record.lawId, record.revisionId]);

          for (const key of nodeKeys) {
            void nodes.delete(key);
          }

          void lawRevisions.delete(record.revisionId);
          void savedLaws.delete([record.lawId, record.revisionId]);
        }

        void tx.objectStore("laws").delete(lawId);
        await tx.done;
      });
    },

    async deleteLawRevision(lawId, revisionId) {
      await withDatabase(async (db) => {
        const tx = db.transaction(["laws", "lawRevisions", "lawNodes", "savedLaws"], "readwrite");
        const savedLaws = tx.objectStore("savedLaws");
        const record = await savedLaws.get([lawId, revisionId]);

        if (record === undefined) {
          await tx.done;
          return;
        }

        const nodes = tx.objectStore("lawNodes");
        const nodeKeys = await nodes.index("by-law-revision").getAllKeys([lawId, revisionId]);

        for (const key of nodeKeys) {
          void nodes.delete(key);
        }

        void tx.objectStore("lawRevisions").delete(revisionId);
        await savedLaws.delete([lawId, revisionId]);

        // 版がすべて消えたら法令メタも残さない。
        const remaining = await savedLaws.index("by-law-id").getAllKeys(lawId);

        if (remaining.length === 0) {
          void tx.objectStore("laws").delete(lawId);
        }
        await tx.done;
      });
    },

    async pinLaw(lawId) {
      await withDatabase(async (db) => {
        const tx = db.transaction("pinnedLaws", "readwrite");
        const store = tx.objectStore("pinnedLaws");
        const existing = await store.get(lawId);

        // 既にピン留めされているなら pinnedAt を据え置く。一覧の並びが操作のたびに動かないようにする。
        if (existing === undefined) {
          void store.put({ lawId, pinnedAt: now().toISOString() });
        }
        await tx.done;
      });
    },

    async unpinLaw(lawId) {
      await withDatabase(async (db) => {
        await db.delete("pinnedLaws", lawId);
      });
    },

    async isLawPinned(lawId) {
      return withDatabase(async (db) => (await db.get("pinnedLaws", lawId)) !== undefined);
    },

    async listPinnedLaws() {
      return withDatabase(async (db) => {
        const records = await db.getAllFromIndex("pinnedLaws", "by-pinned-at");

        // 新しくピン留めしたものから並べる。pinnedAt が同値でも順序が決定的になるよう
        // lawId を第 2 キーにする。索引の返却順に任せるとメモリ実装と並びが食い違う。
        return records.sort(comparePinnedLaws);
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

      if (oldVersion < 5) {
        // savedLaws は v4 で keyPath を変えるためストアごと作り直す。新規作成の DB でも
        // createVersion1Stores が旧 keyPath で作るため、バージョンに関わらず実行する。
        // v5 の pinnedLaws は v4 の結果を読むので、同じ chain で直列に走らせる。
        void migrateSavedLawStores(database, transaction, oldVersion).catch((error: unknown) => {
          console.error("saved law migration failed", error);
          try {
            transaction.abort();
          } catch {
            // トランザクションが既に終了していると abort は InvalidStateError を投げるが、その場合は既に失敗経路にある。
          }
        });
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

// 現行版は 1 件のはずだが、万一複数あっても結果が揺れないよう updatedAt が最大のものを選ぶ。
// 読み取り経路では修復書き込みを行わない（閲覧が保存領域の状態に巻き込まれるのを避けるため）。
const pickCurrentRecord = (records: SavedLawRecord[]): SavedLawRecord | undefined =>
  records.reduce<SavedLawRecord | undefined>(
    (latest, record) =>
      latest === undefined || record.updatedAt > latest.updatedAt ? record : latest,
    undefined,
  );

type ReadDocumentTransaction = IDBPTransaction<
  SurasuraDatabase,
  ["savedLaws", "laws", "lawRevisions", "lawNodes"]
>;

// 保存メタから本文を組み立てる。呼び出し側で tx.done を待つ。
const readSavedDocument = async (
  tx: ReadDocumentTransaction,
  savedLaw: SavedLawRecord,
): Promise<SavedLawDocument | undefined> => {
  const [law, revision, storedNodes] = await Promise.all([
    tx.objectStore("laws").get(savedLaw.lawId),
    tx.objectStore("lawRevisions").get(savedLaw.revisionId),
    tx
      .objectStore("lawNodes")
      .index("by-law-revision")
      .getAll([savedLaw.lawId, savedLaw.revisionId]),
  ]);

  if (law === undefined || revision === undefined) {
    return undefined;
  }

  return {
    law,
    revision,
    nodes: toOrderedNodes(storedNodes),
    savedAt: savedLaw.savedAt,
  };
};
