import type { QuizRating, ReviewLog, StudyCard } from "@/core/domain";
import { fixedIntervalScheduler } from "@/core/study";

import type { VersionChangeTransaction } from "./repository";
import type { TargetIndexes } from "./schema";

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
};
