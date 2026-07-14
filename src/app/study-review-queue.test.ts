import { describe, expect, it } from "vitest";

import type { ReviewLog, StudyCard } from "@/core/domain";

import { advanceQueue, formatIntervalLabel, previewIntervals } from "./study-review-queue";

const card = (id: string): StudyCard => ({
  id,
  source: "manual",
  target: { lawId: "129AC0000000089", revisionId: "rev-1", article: "1" },
  type: "fill_blank",
  question: "Q",
  answer: "A",
  tags: [],
  examPinned: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const minutesToDays = (minutes: number) => minutes / (24 * 60);

describe("advanceQueue", () => {
  it.each([
    {
      name: "requeues a learning-step card to the tail",
      intervalDays: minutesToDays(10),
      queue: ["a", "b"],
      expected: ["b", "a"],
    },
    {
      name: "drops a graduated card from the session",
      intervalDays: 1,
      queue: ["a", "b"],
      expected: ["b"],
    },
    {
      name: "empties the queue when the last card graduates",
      intervalDays: 3,
      queue: ["a"],
      expected: [],
    },
    {
      name: "keeps a lone card while it stays in learning",
      intervalDays: minutesToDays(1),
      queue: ["a"],
      expected: ["a"],
    },
  ])("$name", ({ intervalDays, queue, expected }) => {
    expect(advanceQueue(queue.map(card), intervalDays).map((item) => item.id)).toEqual(expected);
  });

  it("returns an empty queue unchanged", () => {
    expect(advanceQueue([], 1)).toEqual([]);
  });
});

describe("formatIntervalLabel", () => {
  it.each([
    { intervalDays: minutesToDays(1), expected: "1分後" },
    { intervalDays: minutesToDays(10), expected: "10分後" },
    { intervalDays: 1, expected: "1日後" },
    { intervalDays: 3, expected: "3日後" },
    { intervalDays: 2.4, expected: "2日後" },
  ])("formats $intervalDays days as $expected", ({ intervalDays, expected }) => {
    expect(formatIntervalLabel(intervalDays)).toBe(expected);
  });
});

describe("previewIntervals", () => {
  const now = new Date("2026-07-14T00:00:00.000Z");

  it("previews all four grades for a fresh card", () => {
    const previews = previewIntervals([], "card-1", now);

    expect(previews.again).toBeCloseTo(minutesToDays(1));
    expect(previews.hard).toBeCloseTo(minutesToDays(1));
    expect(previews.good).toBeCloseTo(minutesToDays(10));
    expect(previews.easy).toBe(3);
  });

  it("previews review-phase multipliers from existing history", () => {
    // good ×2 で卒業済み(interval 1 日)のカードの履歴。
    const history: ReviewLog[] = [
      {
        id: "log-1",
        cardId: "card-1",
        grade: "good",
        reviewedAt: "2026-07-10T00:00:00.000Z",
        scheduler: "fixed-interval@1",
      },
      {
        id: "log-2",
        cardId: "card-1",
        grade: "good",
        reviewedAt: "2026-07-12T00:00:00.000Z",
        scheduler: "fixed-interval@1",
      },
    ];
    const previews = previewIntervals(history, "card-1", now);

    expect(previews.good).toBe(2); // 1 日 × 2.0
    expect(previews.easy).toBeCloseTo(2.8); // 1 日 × 2.8
    expect(previews.hard).toBe(2); // max(1 × 1.2, 1 + 1) = 2 日
    expect(previews.again).toBeCloseTo(minutesToDays(10)); // lapse で再学習へ
  });
});
