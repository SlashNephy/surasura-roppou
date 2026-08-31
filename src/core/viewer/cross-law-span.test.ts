import { describe, expect, it } from "vitest";

import { detectCrossLawSpan } from "./cross-law-span";

// 位置表現の開始位置を目印の文字列から求めるヘルパー。
// テストの意図（どの位置表現の直前を見ているか）を読みやすくする。
const detect = (text: string, marker: string, minIndex = 0) =>
  detectCrossLawSpan(text, text.indexOf(marker), minIndex);

describe("detectCrossLawSpan", () => {
  it.each([
    {
      name: "resolves an official law name in the dictionary",
      text: "民法第709条の規定",
      marker: "第709条",
      expected: { startIndex: 0, lawId: "129AC0000000089" },
    },
    {
      name: "resolves an official law name followed by its law number",
      text: "民法（明治二十九年法律第八十九号）第90条",
      marker: "第90条",
      expected: { startIndex: 0, lawId: "129AC0000000089" },
    },
    {
      name: "resolves a cabinet order outside the dictionary from its law number",
      text: "労働基準法施行令（昭和二十二年政令第二十一号）第1条",
      marker: "第1条",
      expected: { startIndex: 0, lawId: "322CO0000000021" },
    },
    {
      name: "keeps an act outside the dictionary unresolved",
      text: "原子力災害対策特別措置法（平成11年法律第156号）第2条",
      marker: "第2条",
      expected: { startIndex: 0 },
    },
    {
      name: "keeps a law name matched only by an abbreviation unresolved",
      text: "民訴第3条の規定",
      marker: "第3条",
      expected: { startIndex: 0 },
    },
    {
      name: "keeps a law name prefixed by a kanji unresolved",
      text: "旧民法第90条の規定",
      marker: "第90条",
      expected: { startIndex: 1 },
    },
    {
      name: "starts the span after a punctuation mark",
      text: "前項の場合において、原子力災害対策特別措置法（平成11年法律第156号）第2条",
      marker: "第2条",
      expected: { startIndex: 10 },
    },
    {
      name: "strips a leading coordination token from the span",
      text: "及び原子力災害対策特別措置法（平成11年法律第156号）第2条",
      marker: "第2条",
      expected: { startIndex: 2 },
    },
    {
      name: "does not extend the span before the end of the previous segment",
      // minIndex は直前に確定したリンク「民法第95条」の終端。これが無いと
      // 左スキャンが「民法第95条及び」まで飲み込む。
      text: "民法第95条及び労働基準法施行令（昭和二十二年政令第二十一号）第1条",
      marker: "第1条",
      minIndex: 6,
      expected: { startIndex: 8, lawId: "322CO0000000021" },
    },
  ])("$name", ({ expected, marker, minIndex, text }) => {
    expect(detect(text, marker, minIndex)).toEqual(expected);
  });

  it.each([
    {
      name: "returns nothing for a bare article reference",
      text: "第709条の規定",
      marker: "第709条",
    },
    { name: "returns nothing for a relative reference", text: "前項の規定", marker: "前項" },
    {
      name: "returns nothing when the parenthetical is not a law number",
      text: "（親告罪）第709条",
      marker: "第709条",
    },
    {
      name: "does not mistake a nested parenthesis for the matching one",
      text: "この法律（労働基準法施行令（昭和二十二年政令第二十一号）を含む。）第5条",
      marker: "第5条",
    },
  ])("$name", ({ marker, text }) => {
    expect(detect(text, marker)).toBeUndefined();
  });
});
