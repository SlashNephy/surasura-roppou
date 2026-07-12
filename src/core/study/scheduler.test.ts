import { describe, expect, it } from "vitest";

import type { QuizRating, ReviewLog } from "@/core/domain";

import { fixedIntervalScheduler, fixedIntervalSchedulerId } from "./scheduler";

const baseTime = Date.parse("2026-07-01T00:00:00.000Z");
const minuteMs = 60 * 1000;
const dayMs = 24 * 60 * minuteMs;

// grade の並びから 1 時間おきの ReviewLog 履歴を組み立てる。
const buildHistory = (grades: QuizRating[]): ReviewLog[] =>
  grades.map((grade, index) => ({
    id: `log-${String(index + 1).padStart(2, "0")}`,
    cardId: "card-1",
    grade,
    reviewedAt: new Date(baseTime + index * 60 * minuteMs).toISOString(),
    scheduler: fixedIntervalSchedulerId,
  }));

const lastReviewedAtMs = (history: ReviewLog[]): number =>
  Date.parse(history[history.length - 1].reviewedAt);

const fixedNow = new Date("2026-07-06T00:00:00.000Z");

describe("fixedIntervalScheduler", () => {
  const cases: {
    name: string;
    grades: QuizRating[];
    expected: {
      dueOffsetMs: number;
      intervalDays: number;
      lapses: number;
    };
  }[] = [
    {
      name: "初回 good は学習 step 1 に進み 10 分後",
      grades: ["good"],
      expected: { dueOffsetMs: 10 * minuteMs, intervalDays: 10 / 1440, lapses: 0 },
    },
    {
      name: "good good で卒業し 1 日後",
      grades: ["good", "good"],
      expected: { dueOffsetMs: dayMs, intervalDays: 1, lapses: 0 },
    },
    {
      name: "easy は即卒業で 3 日後",
      grades: ["easy"],
      expected: { dueOffsetMs: 3 * dayMs, intervalDays: 3, lapses: 0 },
    },
    {
      name: "初回 again は step 0 のまま 1 分後",
      grades: ["again"],
      expected: { dueOffsetMs: minuteMs, intervalDays: 1 / 1440, lapses: 0 },
    },
    {
      name: "step 1 で again すると step 0 に戻り 1 分後",
      grades: ["good", "again"],
      expected: { dueOffsetMs: minuteMs, intervalDays: 1 / 1440, lapses: 0 },
    },
    {
      name: "学習中の hard は現ステップ維持で 1 分後",
      grades: ["hard"],
      expected: { dueOffsetMs: minuteMs, intervalDays: 1 / 1440, lapses: 0 },
    },
    {
      name: "step 1 の hard は現ステップ維持で 10 分後",
      grades: ["good", "hard"],
      expected: { dueOffsetMs: 10 * minuteMs, intervalDays: 10 / 1440, lapses: 0 },
    },
    {
      name: "卒業後の good は間隔 2 倍",
      grades: ["good", "good", "good"],
      expected: { dueOffsetMs: 2 * dayMs, intervalDays: 2, lapses: 0 },
    },
    {
      name: "卒業直後の hard は 1.2 倍と +1 日の大きい方（+1 日）",
      grades: ["good", "good", "hard"],
      expected: { dueOffsetMs: 2 * dayMs, intervalDays: 2, lapses: 0 },
    },
    {
      name: "間隔が育った後の hard は 1.2 倍が勝つ",
      // 1 → 2 → 4 → 8 日と育てて hard: max(9.6, 9) = 9.6 日
      grades: ["good", "good", "good", "good", "good", "hard"],
      expected: { dueOffsetMs: 9.6 * dayMs, intervalDays: 9.6, lapses: 0 },
    },
    {
      name: "卒業後の easy は間隔 2.8 倍",
      grades: ["good", "good", "easy"],
      expected: { dueOffsetMs: 2.8 * dayMs, intervalDays: 2.8, lapses: 0 },
    },
    {
      name: "復習の again は lapse して再学習 10 分後",
      grades: ["good", "good", "again"],
      expected: { dueOffsetMs: 10 * minuteMs, intervalDays: 10 / 1440, lapses: 1 },
    },
    {
      name: "再学習を通過すると 1 日から再開",
      grades: ["good", "good", "again", "good"],
      expected: { dueOffsetMs: dayMs, intervalDays: 1, lapses: 1 },
    },
    {
      name: "再学習を easy で通過しても 1 日から再開する",
      grades: ["good", "good", "again", "easy"],
      expected: { dueOffsetMs: dayMs, intervalDays: 1, lapses: 1 },
    },
    {
      name: "再学習中の again も lapse に数える",
      grades: ["good", "good", "again", "again"],
      expected: { dueOffsetMs: 10 * minuteMs, intervalDays: 10 / 1440, lapses: 2 },
    },
    {
      name: "学習フェーズの again は lapse に数えない",
      grades: ["again", "again", "good", "good"],
      expected: { dueOffsetMs: dayMs, intervalDays: 1, lapses: 0 },
    },
    {
      name: "間隔は 365 日で頭打ち",
      // 1 → 2 → 4 → ... → 256 → 365（512 は上限で切られる）
      grades: [
        "good",
        "good",
        "good",
        "good",
        "good",
        "good",
        "good",
        "good",
        "good",
        "good",
        "good",
      ],
      expected: { dueOffsetMs: 365 * dayMs, intervalDays: 365, lapses: 0 },
    },
  ];

  it.each(cases)("$name", ({ grades, expected }) => {
    const history = buildHistory(grades);

    const schedule = fixedIntervalScheduler(history, fixedNow);

    expect(schedule.cardId).toBe("card-1");
    expect(schedule.intervalDays).toBeCloseTo(expected.intervalDays, 10);
    expect(Date.parse(schedule.dueAt) - lastReviewedAtMs(history)).toBeCloseTo(
      expected.dueOffsetMs,
      -1,
    );
    expect(schedule.lapses).toBe(expected.lapses);
    expect(schedule.reviews).toBe(grades.length);
    expect(schedule.derivedFrom).toBe(history[history.length - 1].id);
  });

  it("recentMistakeRate は直近 8 件の again 率を返す", () => {
    // 10 件中、直近 8 件（3 件目以降）に again が 3 件。
    const history = buildHistory([
      "again",
      "again",
      "good",
      "again",
      "good",
      "again",
      "good",
      "again",
      "good",
      "good",
    ]);

    const schedule = fixedIntervalScheduler(history, fixedNow);

    expect(schedule.recentMistakeRate).toBeCloseTo(3 / 8, 10);
  });

  it("履歴が 8 件未満なら全件で again 率を計算する", () => {
    const history = buildHistory(["again", "good", "good", "good"]);

    const schedule = fixedIntervalScheduler(history, fixedNow);

    expect(schedule.recentMistakeRate).toBeCloseTo(1 / 4, 10);
  });

  it("入力順に依存せず reviewedAt と id で決定的に fold する", () => {
    const history = buildHistory(["good", "good", "again", "good"]);
    const shuffled = [history[2], history[0], history[3], history[1]];

    expect(fixedIntervalScheduler(shuffled, fixedNow)).toEqual(
      fixedIntervalScheduler(history, fixedNow),
    );
  });

  it("同時刻のログは id 順で fold する", () => {
    const reviewedAt = new Date(baseTime).toISOString();
    const history: ReviewLog[] = [
      { id: "log-02", cardId: "card-1", grade: "again", reviewedAt, scheduler: "fixed-interval@1" },
      { id: "log-01", cardId: "card-1", grade: "good", reviewedAt, scheduler: "fixed-interval@1" },
    ];

    const schedule = fixedIntervalScheduler(history, fixedNow);

    // log-01(good) → log-02(again) の順なので step 0 に戻って 1 分後になる。
    expect(schedule.intervalDays).toBeCloseTo(1 / 1440, 10);
    expect(schedule.derivedFrom).toBe("log-02");
  });

  it("空履歴は契約違反として throw する", () => {
    expect(() => fixedIntervalScheduler([], fixedNow)).toThrow(
      "fixed-interval scheduler requires at least one review log",
    );
  });
});
