import type { QuizRating, ReviewLog, StudyCard } from "@/core/domain";
import { fixedIntervalScheduler, fixedIntervalSchedulerId } from "@/core/study";

// 1 回の「新しく覚える」セッションで扱う未学習カードの上限。
// 一度に覚える量を制限する学習上の配慮で、Anki の既定値(新規 10 件/日)に合わせた暫定チューニング定数。
export const newCardsPerSession = 10;

// 評価ボタンの並び順(Anki 互換のキーボードショートカット 1〜4 と対応)。
export const quizRatings = ["again", "hard", "good", "easy"] as const;

export const quizRatingLabels: Record<QuizRating, string> = {
  again: "もう一度",
  hard: "難しい",
  good: "できた",
  easy: "簡単",
};

const minutesPerDay = 24 * 60;

// 回答済みの先頭カードをキューから進める。
// 学習・再学習ステップ中(intervalDays < 1)は末尾へ戻して同一セッション内で再出題し、
// 卒業(1 日以上)したカードはセッションから除外する(スペック 5.2 章)。
export const advanceQueue = (queue: readonly StudyCard[], intervalDays: number): StudyCard[] => {
  if (queue.length === 0) {
    return [];
  }

  const [current, ...rest] = queue;
  return intervalDays < 1 ? [...rest, current] : rest;
};

// 評価ボタンに添える次回間隔の目安。1 日未満は分、1 日以上は日で丸める。
export const formatIntervalLabel = (intervalDays: number): string =>
  intervalDays < 1
    ? `${String(Math.max(1, Math.round(intervalDays * minutesPerDay)))}分後`
    : `${String(Math.round(intervalDays))}日後`;

// 各評価を選んだ場合の次回間隔を、仮のログを足したスケジューラ再計算で求める。
// スケジューラは純関数なので副作用なしにプレビューできる。
export const previewIntervals = (
  history: ReviewLog[],
  cardId: string,
  now: Date,
): Record<QuizRating, number> => {
  const entries = quizRatings.map((grade) => {
    const hypothetical: ReviewLog = {
      id: "preview",
      cardId,
      grade,
      reviewedAt: now.toISOString(),
      scheduler: fixedIntervalSchedulerId,
    };

    return [grade, fixedIntervalScheduler([...history, hypothetical], now).intervalDays] as const;
  });

  return Object.fromEntries(entries) as Record<QuizRating, number>;
};
