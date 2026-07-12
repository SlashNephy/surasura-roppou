import type { CardSchedule, QuizRating, ReviewLog } from "@/core/domain";

// スケジューラは履歴だけを入力に取る純関数。アルゴリズムを差し替えても
// ログの replay で全カードの状態を決定的に再構築できる（確定済み設計 3 章）。
export type Scheduler = (history: ReviewLog[], now: Date) => CardSchedule;

export const fixedIntervalSchedulerId = "fixed-interval@1";

// 以下の数値はすべて暫定のチューニング定数（確定済み設計 3 章）。
// 変更してもログ再計算で追従できるため、データ移行は発生しない。
// 学習ステップの出題間隔（分）。1 分 → 10 分 → 卒業。
const learningStepsMinutes = [1, 10];
// lapse 後の再学習の出題間隔（分）。
const relearningMinutes = 10;
// 卒業時の復習間隔（日）。
const graduatingIntervalDays = 1;
// easy 即卒業時の復習間隔（日）。
const easyGraduatingIntervalDays = 3;
// 復習フェーズの間隔乗数。
const hardMultiplier = 1.2;
const goodMultiplier = 2.0;
const easyMultiplier = 2.8;
// 復習間隔の上限（日）。
const maxIntervalDays = 365;
// recentMistakeRate が対象にする直近の回答件数。
const recentWindowSize = 8;

const minutesPerDay = 24 * 60;
const dayMs = 24 * 60 * 60 * 1000;

const minutesToDays = (minutes: number): number => minutes / minutesPerDay;

interface FoldState {
  phase: "learning" | "review" | "relearning";
  // learning フェーズで次に出題する learningStepsMinutes の index。
  step: number;
  intervalDays: number;
  lapses: number;
}

const initialState: FoldState = {
  phase: "learning",
  step: 0,
  intervalDays: minutesToDays(learningStepsMinutes[0]),
  lapses: 0,
};

const capInterval = (intervalDays: number): number => Math.min(intervalDays, maxIntervalDays);

const transition = (state: FoldState, grade: QuizRating): FoldState => {
  if (state.phase === "learning") {
    if (grade === "again") {
      return { ...state, step: 0, intervalDays: minutesToDays(learningStepsMinutes[0]) };
    }

    if (grade === "hard") {
      return { ...state, intervalDays: minutesToDays(learningStepsMinutes[state.step]) };
    }

    if (grade === "easy") {
      return { ...state, phase: "review", intervalDays: easyGraduatingIntervalDays };
    }

    const nextStep = state.step + 1;

    if (nextStep >= learningStepsMinutes.length) {
      return { ...state, phase: "review", intervalDays: graduatingIntervalDays };
    }

    return {
      ...state,
      step: nextStep,
      intervalDays: minutesToDays(learningStepsMinutes[nextStep]),
    };
  }

  if (state.phase === "review") {
    if (grade === "again") {
      return {
        ...state,
        phase: "relearning",
        lapses: state.lapses + 1,
        intervalDays: minutesToDays(relearningMinutes),
      };
    }

    if (grade === "hard") {
      // hard は 1.2 倍だが、間隔が短いうちは伸びなさすぎるため最低でも +1 日は確保する。
      return {
        ...state,
        intervalDays: capInterval(
          Math.max(state.intervalDays * hardMultiplier, state.intervalDays + 1),
        ),
      };
    }

    const multiplier = grade === "easy" ? easyMultiplier : goodMultiplier;

    return { ...state, intervalDays: capInterval(state.intervalDays * multiplier) };
  }

  // relearning
  if (grade === "again") {
    return { ...state, lapses: state.lapses + 1, intervalDays: minutesToDays(relearningMinutes) };
  }

  return { ...state, phase: "review", intervalDays: graduatingIntervalDays };
};

export const fixedIntervalScheduler: Scheduler = (history, now) => {
  // 確定済み設計のインターフェースに合わせて now を受けるが、fixed-interval@1 は
  // 最後の回答時刻からの相対でしか間隔を決めないため使わない。
  void now;

  if (history.length === 0) {
    throw new Error("fixed-interval scheduler requires at least one review log");
  }

  // 同時刻のログがあっても順序が決定的になるよう id を第 2 キーにする。
  const ordered = [...history].sort((left, right) =>
    left.reviewedAt === right.reviewedAt
      ? left.id.localeCompare(right.id)
      : left.reviewedAt.localeCompare(right.reviewedAt),
  );

  let state = initialState;

  for (const log of ordered) {
    state = transition(state, log.grade);
  }

  const last = ordered[ordered.length - 1];
  const recent = ordered.slice(-recentWindowSize);
  const recentAgainCount = recent.filter((log) => log.grade === "again").length;

  return {
    cardId: last.cardId,
    // 日単位に丸めず、最後の回答時刻からの UTC 瞬間演算で期限を求める（確定済み設計 2 章）。
    dueAt: new Date(Date.parse(last.reviewedAt) + state.intervalDays * dayMs).toISOString(),
    intervalDays: state.intervalDays,
    lapses: state.lapses,
    reviews: ordered.length,
    recentMistakeRate: recentAgainCount / recent.length,
    derivedFrom: last.id,
  };
};
