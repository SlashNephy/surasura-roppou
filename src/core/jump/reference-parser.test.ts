import { describe, expect, it } from "vitest";

import { lawReferenceParseFixtures } from "@/test/fixtures/lawReferences";

import { parseReference } from "./reference-parser";

describe("parseReference", () => {
  it.each([
    {
      name: "正式名称 + 第N条",
      input: "国家賠償法第1条",
      expected: { kind: "absolute", lawNameCandidate: "国家賠償法", article: "1" },
    },
    {
      name: "略称 + 条省略",
      input: "国賠1",
      expected: { kind: "absolute", lawAlias: "国賠", article: "1" },
    },
    {
      name: "略称 + 大きい条番号",
      input: "民709",
      expected: { kind: "absolute", lawAlias: "民", article: "709" },
    },
    {
      name: "枝番（アラビア）",
      input: "地方自治法242条の2",
      expected: { kind: "absolute", lawNameCandidate: "地方自治法", article: "242-2" },
    },
    {
      name: "枝番（漢数字）",
      input: "民法第七百九条の二",
      expected: { kind: "absolute", lawNameCandidate: "民法", article: "709-2" },
    },
    {
      name: "条項",
      input: "憲法21条1項",
      expected: { kind: "absolute", lawAlias: "憲法", article: "21", paragraph: "1" },
    },
    {
      name: "漢数字の条項号",
      input: "民法第七百九条第一項第一号",
      expected: {
        kind: "absolute",
        lawNameCandidate: "民法",
        article: "709",
        paragraph: "1",
        item: "1",
      },
    },
    {
      name: "ローマ数字の項",
      input: "憲21Ⅰ",
      expected: { kind: "absolute", lawAlias: "憲", article: "21", paragraph: "1" },
    },
    {
      name: "相対 前項",
      input: "前項",
      expected: { kind: "relative", paragraph: "previous" },
    },
    {
      name: "相対 同条第一号",
      input: "同条第一号",
      expected: { kind: "relative", item: "1" },
    },
    {
      name: "本文",
      input: "本文",
      expected: { kind: "relative", sentence: "main" },
    },
    {
      name: "別表第一",
      input: "別表第一",
      expected: { kind: "relative", appendix: "1" },
    },
    {
      name: "条省略形の枝番",
      input: "民709の2",
      expected: { kind: "absolute", lawAlias: "民", article: "709-2" },
    },
    {
      // の で連結された末尾の番号が 項 の直前にあるときは、枝番ではなく項として読む。
      name: "条省略形の枝番 + の項",
      input: "民709の2の3項",
      expected: { kind: "absolute", lawAlias: "民", article: "709-2", paragraph: "3" },
    },
    {
      name: "条省略形 + の + 項",
      input: "民709の2項",
      expected: { kind: "absolute", lawAlias: "民", article: "709", paragraph: "2" },
    },
    {
      name: "条省略形 + の + 号",
      input: "民709の2号",
      expected: { kind: "absolute", lawAlias: "民", article: "709", item: "2" },
    },
    {
      // 条ありでも同様。の2 の直後が 項 なら 2 は項番号。
      name: "条ありの枝番 + の項",
      input: "民法709条の2項",
      expected: { kind: "absolute", lawNameCandidate: "民法", article: "709", paragraph: "2" },
    },
    {
      name: "編",
      input: "第4編",
      expected: { kind: "relative", part: "4" },
    },
    {
      name: "漢数字の編",
      input: "第四編",
      expected: { kind: "relative", part: "4" },
    },
    {
      name: "章",
      input: "第2章",
      expected: { kind: "relative", chapter: "2" },
    },
    {
      name: "編 + 章",
      input: "第四編第二章",
      expected: { kind: "relative", part: "4", chapter: "2" },
    },
    {
      name: "相対 前章",
      input: "前章",
      expected: { kind: "relative", chapter: "previous" },
    },
    {
      name: "相対 次編",
      input: "次編",
      expected: { kind: "relative", part: "next" },
    },
    {
      // 同章・本章は現在位置そのものなので、シフトを持たず条・項の解析だけを進める。
      name: "同章 + 第一項",
      input: "同章第一項",
      expected: { kind: "relative", paragraph: "1" },
    },
    {
      name: "編 + 章 + 条",
      input: "第四編第二章第七百二十五条",
      expected: { kind: "relative", part: "4", chapter: "2", article: "725" },
    },
    {
      name: "法令名 + 章",
      input: "商法第2編",
      expected: { kind: "absolute", lawNameCandidate: "商法", part: "2" },
    },
  ])("$name を構造化する", ({ input, expected }) => {
    const result = parseReference(input);

    expect(result).toBeDefined();
    expect(result).toMatchObject(expected);
    expect(result?.score).toBeGreaterThan(0);
  });

  it("空文字は undefined を返す", () => {
    expect(parseReference("")).toBeUndefined();
  });

  it("法令名なしの数字のみは非参照として undefined を返す", () => {
    expect(parseReference("123")).toBeUndefined();
  });

  it.each(lawReferenceParseFixtures)(
    "fixture『$name』を期待フィールドと floor 以上の score で解決する",
    (fixture) => {
      const result = parseReference(fixture.input);

      expect(result).toBeDefined();
      expect(result?.kind).toBe(fixture.kind);
      expect(result?.lawNameCandidate).toBe(fixture.expected.lawNameCandidate);
      expect(result?.lawAlias).toBe(fixture.expected.lawAlias);
      expect(result?.article).toBe(fixture.expected.article);
      expect(result?.paragraph).toBe(fixture.expected.paragraph);
      expect(result?.item).toBe(fixture.expected.item);
      expect(result?.sentence).toBe(fixture.expected.sentence);
      expect(result?.appendix).toBe(fixture.expected.appendix);
      expect(result?.score).toBeGreaterThanOrEqual(fixture.expected.confidenceFloor);
    },
  );

  it("法令名のみは article なしの absolute 候補を返す", () => {
    expect(parseReference("国家賠償法")).toMatchObject({
      kind: "absolute",
      lawNameCandidate: "国家賠償法",
    });
    expect(parseReference("国家賠償法")?.article).toBeUndefined();
  });

  it("全角数字と空白のゆれを吸収する", () => {
    const fullWidth = parseReference("国家賠償法第１条");
    const spaced = parseReference("国家賠償法 1条");

    expect(fullWidth).toMatchObject({ lawNameCandidate: "国家賠償法", article: "1" });
    expect(spaced).toMatchObject({ lawNameCandidate: "国家賠償法", article: "1" });
  });

  it("辞書外の法令名は推定名として低いスコアで返す", () => {
    const result = parseReference("特定商取引法5条");

    expect(result).toMatchObject({
      kind: "absolute",
      lawNameCandidate: "特定商取引法",
      article: "5",
    });
    expect(result?.score).toBeLessThan(0.8);
  });

  it("同一入力に対し決定的に同じ結果を返す", () => {
    expect(parseReference("憲法21条1項")).toEqual(parseReference("憲法21条1項"));
  });

  it("バレル @/core/jump からも parseReference を使える", async () => {
    const barrel = await import("./index");

    expect(barrel.parseReference("民709")).toMatchObject({ lawAlias: "民", article: "709" });
  });
});
