import { describe, expect, it } from "vitest";

import { normalizeAnnotation } from "./annotation";

const target = { lawId: "322AC0000000125", article: "1", path: "Article:1" };

describe("normalizeAnnotation", () => {
  it("anchors を持つレコードはそのまま通す", () => {
    const record = {
      id: "a1",
      target,
      anchors: [{ target, quote: "私権", prefix: "第一条 ", suffix: "は、" }],
      color: "yellow",
      tags: [],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };

    expect(normalizeAnnotation(record)).toEqual(record);
  });

  it("旧形式の targetText を 1 件の anchor へ変換する", () => {
    const record = {
      id: "a2",
      target,
      targetText: "私権",
      prefixText: "第一条 ",
      suffixText: "は、",
      note: "メモ",
      tags: ["t"],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };

    expect(normalizeAnnotation(record)).toEqual({
      id: "a2",
      target,
      anchors: [{ target, quote: "私権", prefix: "第一条 ", suffix: "は、" }],
      note: "メモ",
      tags: ["t"],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    });
  });

  it("prefixText / suffixText が欠けていても空文字で補う", () => {
    const record = {
      id: "a3",
      target,
      targetText: "私権",
      note: "",
      tags: [],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };

    expect(normalizeAnnotation(record)?.anchors).toEqual([
      { target, quote: "私権", prefix: "", suffix: "" },
    ]);
  });

  it("anchors も targetText も無ければ anchors を空配列にする", () => {
    const record = {
      id: "a4",
      target,
      note: "条文全体へのメモ",
      tags: [],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };

    expect(normalizeAnnotation(record)?.anchors).toEqual([]);
  });

  it("未知の色は落とす", () => {
    const record = {
      id: "a5",
      target,
      anchors: [],
      color: "chartreuse",
      tags: [],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };

    expect(normalizeAnnotation(record)?.color).toBeUndefined();
  });

  it("id や target を欠くレコードは undefined を返す", () => {
    expect(normalizeAnnotation({ target, tags: [] })).toBeUndefined();
    expect(normalizeAnnotation(undefined)).toBeUndefined();
  });
});
