import type { IDBPDatabase } from "idb";

import type { QuizRating, ReviewLog, StudyCard } from "@/core/domain";
import { fixedIntervalScheduler } from "@/core/study";

import type { VersionChangeTransaction } from "./repository";
import type { SurasuraDatabase, TargetIndexes } from "./schema";

// v2 当時の studyCards レコード。スケジュール系フィールドが同居していた。
// examPinned は v3 で追加されたため Omit して省略可能に再定義する。
type LegacyStudyCardRecord = Omit<StudyCard, "examPinned"> &
  TargetIndexes & {
    dueAt?: unknown;
    intervalDays?: unknown;
    ease?: unknown;
    mistakes?: unknown;
    lastReviewedAt?: unknown;
    examPinned?: boolean;
  };

// v2 当時の studySessions.results の 1 要素（QuizResult）。
interface LegacyQuizResult {
  cardId?: unknown;
  answeredAt?: unknown;
  rating?: unknown;
  elapsedMs?: unknown;
}

interface LegacyStudySessionRecord {
  id: string;
  startedAt: string;
  finishedAt?: string;
  cardIds: string[];
  results?: LegacyQuizResult[];
}

const quizRatings: readonly QuizRating[] = ["again", "hard", "good", "easy"];

const isQuizRating = (value: unknown): value is QuizRating =>
  typeof value === "string" && (quizRatings as readonly string[]).includes(value);

// 壊れた QuizResult はスキップして移行を続行する。移行全体を abort させると
// DB が開けなくなり全機能が使えなくなるため、部分的な履歴の欠落より可用性を優先する。
const toReviewLog = (
  sessionId: string,
  index: number,
  result: LegacyQuizResult,
): ReviewLog | undefined => {
  if (
    typeof result.cardId !== "string" ||
    typeof result.answeredAt !== "string" ||
    !isQuizRating(result.rating)
  ) {
    return undefined;
  }

  return {
    // 再実行やテストで結果が揺れないよう決定的な ID を割り当てる。
    id: `legacy-${sessionId}-${String(index)}`,
    cardId: result.cardId,
    sessionId,
    grade: result.rating,
    reviewedAt: result.answeredAt,
    durationMs: typeof result.elapsedMs === "number" ? result.elapsedMs : undefined,
    scheduler: "legacy-import",
  };
};

export const migrateRecordsToVersion3 = async (
  transaction: VersionChangeTransaction,
): Promise<void> => {
  // ステップ 1: studyCards からスケジュール系フィールドを除去して書き戻す。
  const studyCards = transaction.objectStore("studyCards");
  const cardRecords = (await studyCards.getAll()) as LegacyStudyCardRecord[];

  for (const record of cardRecords) {
    const { dueAt, intervalDays, ease, mistakes, lastReviewedAt, ...rest } = record;
    void dueAt;
    void intervalDays;
    void ease;
    void mistakes;
    void lastReviewedAt;
    void studyCards.put({ ...rest, examPinned: record.examPinned ?? false });
  }

  // ステップ 2: 旧 QuizResult を ReviewLog へ変換し、セッションを縮小する。
  const studySessions = transaction.objectStore("studySessions");
  const sessionRecords = (await studySessions.getAll()) as unknown as LegacyStudySessionRecord[];
  const reviewLogs = transaction.objectStore("reviewLogs");
  const convertedLogs: ReviewLog[] = [];

  for (const session of sessionRecords) {
    for (const [index, result] of (session.results ?? []).entries()) {
      const log = toReviewLog(session.id, index, result);

      if (log !== undefined) {
        convertedLogs.push(log);
        void reviewLogs.put(log);
      }
    }

    const { results, ...sessionRest } = session;
    void results;
    void studySessions.put(sessionRest);
  }

  // ステップ 3: 変換したログから CardSchedule を再計算する。
  const cardSchedules = transaction.objectStore("cardSchedules");
  const logsByCardId = new Map<string, ReviewLog[]>();

  for (const log of convertedLogs) {
    const history = logsByCardId.get(log.cardId) ?? [];
    history.push(log);
    logsByCardId.set(log.cardId, history);
  }

  for (const history of logsByCardId.values()) {
    void cardSchedules.put(fixedIntervalScheduler(history, new Date()));
  }

  // put 群の完了（= versionchange トランザクションの完了）を待つ。
  // 書き込み失敗をこの関数の reject として呼び出し元の abort 処理へ伝播させる。
  await transaction.done;
};

// v3 当時の savedLaws レコード。keyPath は lawId 単独で、現行版フラグを持たなかった。
// lawId / revisionId は実データが壊れている可能性があるため unknown にして呼び出し側で検証する。
interface LegacySavedLawRecord {
  lawId: unknown;
  revisionId: unknown;
  nodeCount: number;
  savedAt: string;
  updatedAt: string;
}

export const migrateRecordsToVersion4 = async (
  database: IDBPDatabase<SurasuraDatabase>,
  transaction: VersionChangeTransaction,
): Promise<void> => {
  // keyPath は後から変更できないため、旧レコードを退避してストアを作り直す。
  const legacyRecords = (await transaction
    .objectStore("savedLaws")
    .getAll()) as unknown as LegacySavedLawRecord[];

  database.deleteObjectStore("savedLaws");

  const savedLaws = database.createObjectStore("savedLaws", {
    keyPath: ["lawId", "revisionId"],
  });
  savedLaws.createIndex("by-law-id", "lawId");
  savedLaws.createIndex("by-law-current", ["lawId", "isCurrent"]);
  savedLaws.createIndex("by-saved-at", "savedAt");
  savedLaws.createIndex("by-updated-at", "updatedAt");

  // 旧スキーマは法令ごとに 1 版しか持てなかったので、すべて現行版として移す。
  // lawId / revisionId は新しい複合キーの構成要素であり、欠けていると put が DataError を投げて
  // 移行全体が abort し DB が開けなくなる。保存法令は e-Gov から再取得可能なキャッシュなので、
  // 壊れたレコードはスキップして続行し、可用性を優先する（v3 移行の toReviewLog と同じ方針）。
  for (const record of legacyRecords) {
    if (typeof record.lawId !== "string" || typeof record.revisionId !== "string") {
      continue;
    }

    void savedLaws.put({
      lawId: record.lawId,
      revisionId: record.revisionId,
      isCurrent: 1,
      nodeCount: record.nodeCount,
      savedAt: record.savedAt,
      updatedAt: record.updatedAt,
    });
  }
};

export const migrateRecordsToVersion5 = async (
  database: IDBPDatabase<SurasuraDatabase>,
  transaction: VersionChangeTransaction,
): Promise<void> => {
  const pinnedLaws = database.createObjectStore("pinnedLaws", { keyPath: "lawId" });
  pinnedLaws.createIndex("by-pinned-at", "pinnedAt");

  // v4 までの保存はすべてユーザーの明示操作の結果なので、ピン留めの意図として引き継ぐ。
  const savedLaws = await transaction.objectStore("savedLaws").getAll();
  const pinnedAtByLawId = new Map<string, string>();

  for (const record of savedLaws) {
    const existing = pinnedAtByLawId.get(record.lawId);

    // 法令単位のピン留めなので版をまたいで 1 件にまとめ、最も古い保存時刻を採る。
    if (existing === undefined || record.savedAt < existing) {
      pinnedAtByLawId.set(record.lawId, record.savedAt);
    }
  }

  for (const [lawId, pinnedAt] of pinnedAtByLawId) {
    void pinnedLaws.put({ lawId, pinnedAt });
  }
};

// savedLaws 系の移行は v4 → v5 の順に直列で走らせる。v4 は savedLaws を作り直すため、
// v5 が並行して読むと削除済みのストアに当たる。
export const migrateSavedLawStores = async (
  database: IDBPDatabase<SurasuraDatabase>,
  transaction: VersionChangeTransaction,
  oldVersion: number,
): Promise<void> => {
  if (oldVersion < 4) {
    await migrateRecordsToVersion4(database, transaction);
  }

  if (oldVersion < 5) {
    await migrateRecordsToVersion5(database, transaction);
  }

  await transaction.done;
};
