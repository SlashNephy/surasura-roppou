import { describe, expect, it } from "vitest";

import type { StudyCard } from "@/core/domain";

import { mergeRecentItems } from "./recent";

const card = (id: string, article: string): StudyCard => ({
  id,
  source: "manual",
  target: { lawId: "129AC0000000089", article },
  type: "fill_blank",
  question: `Q${id}`,
  answer: `A${id}`,
  tags: [],
  examPinned: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

describe("mergeRecentItems", () => {
  it("at 降順（新しい順）でマージする", () => {
    const merged = mergeRecentItems({
      savedLaws: [{ lawId: "L1", title: "民法", at: "2026-07-10T00:00:00.000Z" }],
      reviewedCards: [{ card: card("c1", "709"), at: "2026-07-12T00:00:00.000Z" }],
    });
    expect(merged.map((item) => item.kind)).toEqual(["card", "law"]);
  });

  it("同一条文の重複を除去し、より新しい項目を残す", () => {
    const merged = mergeRecentItems({
      savedLaws: [],
      reviewedCards: [
        { card: card("old", "709"), at: "2026-07-10T00:00:00.000Z" },
        { card: card("new", "709"), at: "2026-07-12T00:00:00.000Z" },
      ],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ kind: "card" });
    expect((merged[0] as { card: StudyCard }).card.id).toBe("new");
  });

  it("法令とカードは粒度が違うので別項目として残る", () => {
    const merged = mergeRecentItems({
      savedLaws: [{ lawId: "129AC0000000089", title: "民法", at: "2026-07-11T00:00:00.000Z" }],
      reviewedCards: [{ card: card("c1", "709"), at: "2026-07-12T00:00:00.000Z" }],
    });
    expect(merged).toHaveLength(2);
  });

  it("limit で件数を絞る", () => {
    const reviewedCards = Array.from({ length: 8 }, (_, index) => ({
      card: card(`c${String(index)}`, String(index)),
      at: `2026-07-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
    }));
    expect(mergeRecentItems({ savedLaws: [], reviewedCards }, { limit: 5 })).toHaveLength(5);
  });
});
