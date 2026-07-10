import { describe, expect, it } from "vitest";

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
});
