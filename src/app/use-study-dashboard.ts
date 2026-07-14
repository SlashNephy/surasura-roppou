import { useEffect, useState } from "react";

import type { ISODateString, ReviewLog, StudyCard } from "@/core/domain";
import { createStorageRepository } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";
import { computeReviewStats, mergeRecentItems, selectWeakCards } from "@/core/study";
import type { RecentItem, ReviewStats, WeakCard } from "@/core/study";

// 本番ルーターは createAppRouter() を引数なしで呼ぶため、DI がないときは既定リポジトリへフォールバックする。
const defaultStorageRepository = createStorageRepository();

export interface StudyDashboard {
  dueCount: number;
  unscheduledCount: number;
  cardCount: number;
  stats: ReviewStats;
  weakCards: WeakCard[];
  recentItems: RecentItem[];
  // 科目別の件数集計に StudyPage が使うため、生カード一覧も保持する。
  cards: StudyCard[];
}

export interface UseStudyDashboardResult {
  dashboard: StudyDashboard | undefined;
  error: string | undefined;
}

// 各カードの最新の復習時刻を求め、カード単位の最近リストにする。
const selectRecentlyReviewedCards = (
  cards: readonly StudyCard[],
  reviewLogs: readonly ReviewLog[],
): { card: StudyCard; at: ISODateString }[] => {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const latestByCardId = new Map<string, ISODateString>();
  for (const log of reviewLogs) {
    const current = latestByCardId.get(log.cardId);
    if (current === undefined || current.localeCompare(log.reviewedAt) < 0) {
      latestByCardId.set(log.cardId, log.reviewedAt);
    }
  }

  const reviewed: { card: StudyCard; at: ISODateString }[] = [];
  for (const [cardId, at] of latestByCardId) {
    const card = cardsById.get(cardId);
    if (card !== undefined) {
      reviewed.push({ card, at });
    }
  }

  return reviewed;
};

export const useStudyDashboard = (
  storageRepository: StorageRepository = defaultStorageRepository,
): UseStudyDashboardResult => {
  const [dashboard, setDashboard] = useState<StudyDashboard>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isCurrent = true;
    const now = new Date().toISOString();

    void Promise.all([
      storageRepository.listDueStudyCards(now),
      storageRepository.listUnscheduledStudyCards(),
      storageRepository.listStudyCards(),
      storageRepository.listReviewLogs(),
      storageRepository.listSavedLaws(),
    ])
      .then(([dueCards, unscheduledCards, cards, reviewLogs, savedLaws]) => {
        if (!isCurrent) {
          return;
        }

        const recentItems = mergeRecentItems({
          savedLaws: savedLaws.map((saved) => ({
            lawId: saved.law.lawId,
            title: saved.law.title,
            at: saved.updatedAt,
          })),
          reviewedCards: selectRecentlyReviewedCards(cards, reviewLogs),
        });

        setError(undefined);
        setDashboard({
          dueCount: dueCards.length,
          unscheduledCount: unscheduledCards.length,
          cardCount: cards.length,
          stats: computeReviewStats(reviewLogs),
          weakCards: selectWeakCards(cards, reviewLogs),
          recentItems,
          cards,
        });
      })
      .catch(() => {
        // 読み込み失敗時は数字を出さず、ページ本体は表示できるようにする。
        if (isCurrent) {
          setDashboard(undefined);
          setError("学習データの読み込みに失敗しました");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [storageRepository]);

  return { dashboard, error };
};
