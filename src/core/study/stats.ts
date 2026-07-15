import type { ReviewLog, StudyCard } from "@/core/domain";

export interface ReviewStats {
  totalReviews: number;
  correctReviews: number;
  // 総回答 0 のときは 0% と区別するため undefined。
  accuracy: number | undefined;
}

export interface WeakCard {
  card: StudyCard;
  reviews: number;
  correct: number;
  accuracy: number;
}

interface SelectWeakCardsOptions {
  // 苦手判定に必要な最低復習回数。1 回の again での誤検出を防ぐ下限。
  minReviews?: number;
  limit?: number;
}

// again のみを不正解（lapse）とみなす。Anki の Again 相当。
const isCorrect = (grade: ReviewLog["grade"]): boolean => grade !== "again";

export const computeReviewStats = (logs: readonly ReviewLog[]): ReviewStats => {
  const totalReviews = logs.length;
  const correctReviews = logs.filter((log) => isCorrect(log.grade)).length;

  return {
    totalReviews,
    correctReviews,
    accuracy: totalReviews === 0 ? undefined : correctReviews / totalReviews,
  };
};

export const selectWeakCards = (
  cards: readonly StudyCard[],
  logs: readonly ReviewLog[],
  options: SelectWeakCardsOptions = {},
): WeakCard[] => {
  const minReviews = options.minReviews ?? 3;
  const limit = options.limit ?? 5;

  const totalsByCardId = new Map<string, { reviews: number; correct: number }>();
  for (const log of logs) {
    const entry = totalsByCardId.get(log.cardId) ?? { reviews: 0, correct: 0 };
    entry.reviews += 1;
    if (isCorrect(log.grade)) {
      entry.correct += 1;
    }
    totalsByCardId.set(log.cardId, entry);
  }

  const weakCards: WeakCard[] = [];
  for (const card of cards) {
    const totals = totalsByCardId.get(card.id);
    if (totals === undefined || totals.reviews < minReviews) {
      continue;
    }
    weakCards.push({
      card,
      reviews: totals.reviews,
      correct: totals.correct,
      accuracy: totals.correct / totals.reviews,
    });
  }

  // 正答率昇順。同率なら復習回数が多い順（判定の根拠が厚いカードを優先）。
  weakCards.sort((left, right) =>
    left.accuracy !== right.accuracy
      ? left.accuracy - right.accuracy
      : right.reviews - left.reviews,
  );

  return weakCards.slice(0, limit);
};
