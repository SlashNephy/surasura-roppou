import { describe, expect, it } from "vitest";

import { detectLawReferences } from "./reference-detector";

// 検出結果のうち検証したい要素だけを取り出す縮約ヘルパー。
// 条項号は検出（参照）レベルの値を、lawId は解決候補の値を見る。
const summarize = (text: string) =>
  detectLawReferences(text).map((reference) => ({
    rawText: reference.rawText,
    lawId: reference.candidates[0]?.lawId,
    article: reference.article,
    paragraph: reference.paragraph,
    item: reference.item,
    resolved: reference.candidates.length > 0,
  }));

describe("detectLawReferences", () => {
  it.each([
    {
      name: "正式名称 + 第N条",
      input: "民法第709条を参照",
      expected: [
        { rawText: "民法第709条", lawId: "129AC0000000089", article: "709", resolved: true },
      ],
    },
    {
      name: "先頭ノイズが法令名に食われない（最長一致サフィックス）",
      input: "問題文は民法709条について",
      expected: [
        { rawText: "民法709条", lawId: "129AC0000000089", article: "709", resolved: true },
      ],
    },
    {
      name: "1行に複数参照。2つ目は法令名なしで未解決",
      input: "民法709条、710条",
      expected: [
        { rawText: "民法709条", lawId: "129AC0000000089", article: "709", resolved: true },
        // 法令名が無いため relative 参照。article は parseReference の値 "710" が載る。
        { rawText: "710条", lawId: undefined, article: "710", resolved: false },
      ],
    },
    {
      name: "略称 + 条省略",
      input: "国賠1条により",
      expected: [{ rawText: "国賠1条", lawId: "322AC0000000125", article: "1", resolved: true }],
    },
    {
      name: "条項号 + 本文",
      input: "民法709条1項2号本文",
      expected: [
        {
          rawText: "民法709条1項2号本文",
          lawId: "129AC0000000089",
          article: "709",
          paragraph: "1",
          item: "2",
          resolved: true,
        },
      ],
    },
    {
      name: "枝番（漢数字）",
      input: "民法第七百九条の二",
      expected: [
        {
          rawText: "民法第七百九条の二",
          lawId: "129AC0000000089",
          article: "709-2",
          resolved: true,
        },
      ],
    },
    {
      // 辞書外の法令名は復元せず、位置表現だけを relative 参照として検出する（既知の縮退）。
      name: "辞書外の法令名は位置のみ未解決で検出",
      input: "宇宙法5条",
      expected: [{ rawText: "5条", lawId: undefined, article: "5", resolved: false }],
    },
    {
      name: "相対参照は未解決",
      input: "前条の規定により",
      // parseReference は前条を article "previous" として返す。
      expected: [{ rawText: "前条", lawId: undefined, article: "previous", resolved: false }],
    },
    {
      name: "同一参照は重複排除",
      input: "民法709条と民法709条",
      expected: [
        { rawText: "民法709条", lawId: "129AC0000000089", article: "709", resolved: true },
      ],
    },
    {
      name: "参照なしは空",
      input: "これはただの文章です",
      expected: [],
    },
  ])("$name", ({ input, expected }) => {
    expect(summarize(input)).toEqual(expected);
  });

  it("複数行を跨いで検出する", () => {
    const result = summarize("民法709条\n憲法21条1項");
    expect(result).toEqual([
      {
        rawText: "民法709条",
        lawId: "129AC0000000089",
        article: "709",
        paragraph: undefined,
        item: undefined,
        resolved: true,
      },
      {
        rawText: "憲法21条1項",
        lawId: "321CONSTITUTION",
        article: "21",
        paragraph: "1",
        item: undefined,
        resolved: true,
      },
    ]);
  });

  it("ocrConfidence で confidence を減衰する", () => {
    const [full] = detectLawReferences("民法709条", {});
    const [scaled] = detectLawReferences("民法709条", { ocrConfidence: 50 });
    expect(scaled.confidence).toBeCloseTo(full.confidence * 0.5, 5);
  });

  it("ocrConfidence の境界（0 で 0、100 で無減衰）", () => {
    const [base] = detectLawReferences("民法709条", {});
    const [zero] = detectLawReferences("民法709条", { ocrConfidence: 0 });
    const [full] = detectLawReferences("民法709条", { ocrConfidence: 100 });
    expect(zero.confidence).toBe(0);
    expect(full.confidence).toBeCloseTo(base.confidence, 5);
  });

  it("決定的 ID を採番する（同入力で同 ID）", () => {
    const first = detectLawReferences("民法709条");
    const second = detectLawReferences("民法709条");
    expect(first[0]?.id).toBe(second[0]?.id);
  });
});
