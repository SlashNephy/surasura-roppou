import { describe, expect, it } from "vitest";

import { applyHighlight, type HighlightRange } from "./highlight-merge";

const range = (
  annotationId: string,
  start: number,
  end: number,
  color: HighlightRange["color"],
): HighlightRange => ({ annotationId, start, end, color });

describe("applyHighlight", () => {
  it("既存が無ければ新規 1 件を作る", () => {
    expect(applyHighlight([], { start: 2, end: 5, color: "yellow" })).toEqual({
      created: [{ start: 2, end: 5, color: "yellow" }],
      updated: [],
      deleted: [],
    });
  });

  it("離れた既存には触れない", () => {
    const existing = [range("a", 10, 12, "pink")];

    expect(applyHighlight(existing, { start: 2, end: 5, color: "yellow" })).toEqual({
      created: [{ start: 2, end: 5, color: "yellow" }],
      updated: [],
      deleted: [],
    });
  });

  const sameColorCases = [
    { name: "重なる", existing: range("a", 3, 8, "yellow"), expected: { start: 2, end: 8 } },
    { name: "隣接する", existing: range("a", 5, 9, "yellow"), expected: { start: 2, end: 9 } },
    { name: "内包する", existing: range("a", 0, 9, "yellow"), expected: { start: 0, end: 9 } },
  ];

  for (const testCase of sameColorCases) {
    it(`同色と${testCase.name}ときはマージして 1 本にする`, () => {
      const result = applyHighlight([testCase.existing], { start: 2, end: 5, color: "yellow" });

      expect(result.created).toEqual([]);
      expect(result.updated).toEqual([
        { annotationId: "a", color: "yellow", ...testCase.expected },
      ]);
      expect(result.deleted).toEqual([]);
    });
  }

  it("同色が複数重なるときは先頭側を残して他を消す", () => {
    const existing = [range("a", 0, 3, "yellow"), range("b", 7, 10, "yellow")];
    const result = applyHighlight(existing, { start: 2, end: 8, color: "yellow" });

    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([range("a", 0, 10, "yellow")]);
    expect(result.deleted).toEqual(["b"]);
  });

  it("異色と部分的に重なるときは既存を削り取る", () => {
    const existing = [range("a", 1, 4, "yellow")];
    const result = applyHighlight(existing, { start: 3, end: 6, color: "pink" });

    expect(result.created).toEqual([{ start: 3, end: 6, color: "pink" }]);
    expect(result.updated).toEqual([range("a", 1, 3, "yellow")]);
    expect(result.deleted).toEqual([]);
  });

  it("異色を完全に覆うときは既存を消す", () => {
    const existing = [range("a", 3, 5, "yellow")];
    const result = applyHighlight(existing, { start: 1, end: 8, color: "pink" });

    expect(result.updated).toEqual([]);
    expect(result.deleted).toEqual(["a"]);
  });

  it("異色の内側を塗るときは 2 本に分割する", () => {
    const existing = [range("a", 1, 6, "yellow")];
    const result = applyHighlight(existing, { start: 2, end: 4, color: "pink" });

    expect(result.updated).toEqual([range("a", 1, 2, "yellow")]);
    expect(result.created).toEqual([
      { start: 2, end: 4, color: "pink" },
      { start: 4, end: 6, color: "yellow", sourceAnnotationId: "a" },
    ]);
    expect(result.deleted).toEqual([]);
  });

  it("異色に接しているだけなら削らない", () => {
    const existing = [range("a", 1, 3, "yellow")];
    const result = applyHighlight(existing, { start: 3, end: 6, color: "pink" });

    expect(result.updated).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  it("同色マージで広がった範囲が別の異色に届く場合も削り取る", () => {
    const existing = [range("a", 0, 3, "yellow"), range("b", 4, 8, "pink")];
    const result = applyHighlight(existing, { start: 2, end: 5, color: "yellow" });

    expect(result.updated).toEqual([range("a", 0, 5, "yellow"), range("b", 5, 8, "pink")]);
    expect(result.created).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  // --- 以下は brief に無い境界ケース（区間演算はここでバグが出やすいため追加） ---

  it("異色の既存と完全に同じ範囲を塗るときは丸ごと消す（端点も一致）", () => {
    const existing = [range("a", 3, 5, "yellow")];
    const result = applyHighlight(existing, { start: 3, end: 5, color: "pink" });

    expect(result.created).toEqual([{ start: 3, end: 5, color: "pink" }]);
    expect(result.updated).toEqual([]);
    expect(result.deleted).toEqual(["a"]);
  });

  it("同色の吸収が配列順に関わらず連鎖する（間接的に繋がる 2 本を両方吸収する）", () => {
    // next(0-3) は y(3-6) に隣接して吸収し、その拡大後の範囲(0-6)が
    // 初回走査時点では届いていなかった x(6-9) にも新たに隣接する。
    // 配列順を x → y（吸収対象が後ろに来る順）にして、単純な 1 パスの for ループでは
    // 拾えないことを確認する。
    const existing = [range("x", 6, 9, "yellow"), range("y", 3, 6, "yellow")];
    const result = applyHighlight(existing, { start: 0, end: 3, color: "yellow" });

    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([range("y", 0, 9, "yellow")]);
    expect(result.deleted).toEqual(["x"]);
  });

  it("幅 0 の範囲を塗っても既存に接するだけなら削らない", () => {
    const existing = [range("a", 1, 3, "yellow")];
    const result = applyHighlight(existing, { start: 3, end: 3, color: "pink" });

    expect(result.created).toEqual([{ start: 3, end: 3, color: "pink" }]);
    expect(result.updated).toEqual([]);
    expect(result.deleted).toEqual([]);
  });
});
