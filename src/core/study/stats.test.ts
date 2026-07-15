import { describe, expect, it } from "vitest";

import type { ReviewLog, StudyCard } from "@/core/domain";

import { computeReviewStats, selectWeakCards } from "./stats";

const card = (id: string, overrides: Partial<StudyCard> = {}): StudyCard => ({
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
  ...overrides,
});

const log = (cardId: string, grade: ReviewLog["grade"]): ReviewLog => ({
  id: `${cardId}-${grade}-${String(Math.random())}`,
  cardId,
  grade,
  reviewedAt: "2026-07-10T00:00:00.000Z",
  scheduler: "fixed-interval@1",
});

describe("computeReviewStats", () => {
  it.each([
    {
      name: "回答なしは accuracy undefined",
      logs: [] as ReviewLog[],
      total: 0,
      correct: 0,
      accuracy: undefined,
    },
    {
      name: "全問 again は accuracy 0",
      logs: [log("a", "again"), log("a", "again")],
      total: 2,
      correct: 0,
      accuracy: 0,
    },
    {
      name: "again 以外は正解",
      logs: [log("a", "hard"), log("a", "good"), log("a", "easy")],
      total: 3,
      correct: 3,
      accuracy: 1,
    },
    {
      name: "混在は正解率を返す",
      logs: [log("a", "again"), log("a", "good"), log("a", "good"), log("a", "again")],
      total: 4,
      correct: 2,
      accuracy: 0.5,
    },
  ])("$name", ({ logs, total, correct, accuracy }) => {
    const stats = computeReviewStats(logs);
    expect(stats.totalReviews).toBe(total);
    expect(stats.correctReviews).toBe(correct);
    expect(stats.accuracy).toBe(accuracy);
  });
});

describe("selectWeakCards", () => {
  it("minReviews 未満のカードを除外する", () => {
    const cards = [card("a"), card("b")];
    const logs = [
      log("a", "again"),
      log("a", "again"),
      log("b", "again"),
      log("b", "again"),
      log("b", "again"),
    ];
    const weak = selectWeakCards(cards, logs);
    expect(weak.map((entry) => entry.card.id)).toEqual(["b"]);
  });

  it("正答率昇順、同率なら復習回数が多い順に並べる", () => {
    const cards = [card("hi"), card("lo"), card("loMore")];
    const logs = [
      log("hi", "good"),
      log("hi", "good"),
      log("hi", "again"),
      log("lo", "again"),
      log("lo", "again"),
      log("lo", "good"),
      log("loMore", "again"),
      log("loMore", "again"),
      log("loMore", "good"),
      log("loMore", "good"),
    ];
    // 正答率: lo=1/3≈0.33, loMore=2/4=0.5, hi=2/3≈0.67。昇順で lo → loMore → hi。
    const weak = selectWeakCards(cards, logs, { minReviews: 3 });
    expect(weak.map((entry) => entry.card.id)).toEqual(["lo", "loMore", "hi"]);
  });

  it("同率のときは復習回数が多いカードを先に出す", () => {
    const cards = [card("few"), card("many")];
    const logs = [
      log("few", "again"),
      log("few", "good"),
      log("few", "good"),
      log("many", "again"),
      log("many", "again"),
      log("many", "good"),
      log("many", "good"),
      log("many", "good"),
      log("many", "good"),
    ];
    // few: 2/3≈0.667, many: 4/6≈0.667 → 同率。回数多い many を先に。
    const weak = selectWeakCards(cards, logs, { minReviews: 3 });
    expect(weak.map((entry) => entry.card.id)).toEqual(["many", "few"]);
  });

  it("対応するカードが無いログ（削除済み）は無視する", () => {
    const cards = [card("a")];
    const logs = [
      log("a", "again"),
      log("a", "again"),
      log("a", "good"),
      log("ghost", "again"),
      log("ghost", "again"),
      log("ghost", "again"),
    ];
    const weak = selectWeakCards(cards, logs);
    expect(weak.map((entry) => entry.card.id)).toEqual(["a"]);
  });

  it("limit で件数を絞る", () => {
    const cards = Array.from({ length: 8 }, (_, index) => card(`c${String(index)}`));
    const logs = cards.flatMap((entry) => [
      log(entry.id, "again"),
      log(entry.id, "again"),
      log(entry.id, "again"),
    ]);
    expect(selectWeakCards(cards, logs, { limit: 5 })).toHaveLength(5);
  });
});
