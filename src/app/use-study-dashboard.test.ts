import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ReviewLog, StudyCard } from "@/core/domain";

import { createMemoryStorageRepository } from "@/test/fixtures/storage";
import { useStudyDashboard } from "./use-study-dashboard";

const card = (id: string): StudyCard => ({
  id,
  source: "manual",
  target: { lawId: "129AC0000000089", article: id },
  type: "fill_blank",
  question: `Q${id}`,
  answer: `A${id}`,
  tags: [],
  examPinned: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const log = (cardId: string, grade: ReviewLog["grade"], reviewedAt: string): ReviewLog => ({
  id: `${cardId}-${reviewedAt}`,
  cardId,
  grade,
  reviewedAt,
  scheduler: "fixed-interval@1",
});

describe("useStudyDashboard", () => {
  it("正答率・苦手カード・最近開いた項目を組み立てる", async () => {
    const { repository } = createMemoryStorageRepository({
      studyCards: [card("a"), card("b")],
      reviewLogs: [
        log("a", "again", "2026-07-10T00:00:00.000Z"),
        log("a", "again", "2026-07-11T00:00:00.000Z"),
        log("a", "good", "2026-07-12T00:00:00.000Z"),
        log("b", "good", "2026-07-09T00:00:00.000Z"),
      ],
    });

    const { result } = renderHook(() => useStudyDashboard(repository));

    await waitFor(() => {
      expect(result.current.dashboard).toBeDefined();
    });

    const dashboard = result.current.dashboard;
    if (dashboard === undefined) {
      throw new Error("dashboard should be defined");
    }
    expect(dashboard.cardCount).toBe(2);
    expect(dashboard.stats.totalReviews).toBe(4);
    expect(dashboard.stats.correctReviews).toBe(2);
    // カード a は 3 回中 1 正解 → 苦手。カード b は 1 回のみで minReviews 未満。
    expect(dashboard.weakCards.map((weak) => weak.card.id)).toEqual(["a"]);
    // 最近開いた: a の最新 reviewedAt は 07-12。カード単位で 1 件ずつ。
    expect(dashboard.recentItems.some((item) => item.kind === "card")).toBe(true);
  });

  it("エラー時は dashboard を undefined にしてエラーメッセージを返す", async () => {
    const failing = {
      listDueStudyCards: () => Promise.reject(new Error("boom")),
      listUnscheduledStudyCards: () => Promise.resolve([]),
      listStudyCards: () => Promise.resolve([]),
      listReviewLogs: () => Promise.resolve([]),
      listSavedLaws: () => Promise.resolve([]),
    } as unknown as Parameters<typeof useStudyDashboard>[0];

    const { result } = renderHook(() => useStudyDashboard(failing));

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
    expect(result.current.dashboard).toBeUndefined();
  });
});
