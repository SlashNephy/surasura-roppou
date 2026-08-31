import { describe, expect, it } from "vitest";

import { detectCrossLawSpan } from "./cross-law-span";

// 位置表現の開始位置を目印の文字列から求めるヘルパー。
// テストの意図（どの位置表現の直前を見ているか）を読みやすくする。
const detect = (
  text: string,
  marker: string,
  minIndex = 0,
  lawIdByLawNumber?: ReadonlyMap<string, string>,
) => detectCrossLawSpan(text, text.indexOf(marker), minIndex, lawIdByLawNumber);

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
    {
      name: "does not swallow a reference that failed to link even without a preceding link's minIndex",
      // 「不正競争防止法第15条」はリンクにならない参照（辞書外・法令番号なし）で、
      // minIndex は前進しない（0 のまま）。左境界パターンに「条」が無いと、
      // 左スキャンがこの参照ごと飲み込んで政令のリンクに誤って含めてしまう。
      text: "不正競争防止法第15条及び労働基準法施行令（昭和二十二年政令第二十一号）第1条",
      marker: "第1条",
      expected: { startIndex: 13, lawId: "322CO0000000021" },
    },
    {
      name: "stops the left scan at a positional expression suffix even without a leading coordination token",
      // 「項」で止まり、start は「に」の位置（「前項」を飲み込まなくなる）。
      // 直前の文字「項」は漢字だが、これは別の参照の終わりであって「旧民法」のような
      // 接頭辞ではないため、漢字ガードの対象から外れる。
      text: "前項に規定する労働基準法施行令（昭和二十二年政令第二十一号）第5条",
      marker: "第5条",
      expected: { startIndex: 2, lawId: "322CO0000000021" },
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

describe("detectCrossLawSpan with resolved law numbers", () => {
  // 法律の lawId は提出区分を含むため法令番号から導出できない。解決済みの対応表から引く。
  const lawIdByLawNumber = new Map([["Heisei/11/法律/156", "411AC0000000156"]]);

  it("resolves an act through the resolved law number map", () => {
    expect(
      detect("原子力災害対策特別措置法（平成11年法律第156号）第2条", "第2条", 0, lawIdByLawNumber),
    ).toEqual({ startIndex: 0, lawId: "411AC0000000156" });
  });

  it("resolves an act that directly follows another reference", () => {
    // 直前の参照の末尾「号」は法令名に付いた接頭辞ではない。「旧民法」を弾く漢字ガードが
    // ここで発火すると、解決できるはずのリンクを潰してしまう。
    expect(
      detect(
        "災害対策基本法第3条第7号に規定する防災計画及び原子力災害対策特別措置法（平成11年法律第156号）第2条",
        "第2条",
        0,
        lawIdByLawNumber,
      )?.lawId,
    ).toBe("411AC0000000156");
  });

  it("keeps an act unresolved when the map has no entry", () => {
    expect(
      detect("不正競争防止法（平成5年法律第47号）第2条", "第2条", 0, lawIdByLawNumber),
    ).toEqual({ startIndex: 0 });
  });
});
