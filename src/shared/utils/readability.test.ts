import { describe, expect, it } from "vitest";

import {
  readabilityHeadingTransformFixtures,
  readabilityTransformFixtures,
} from "@/test/fixtures/readability";

import { transformReadableHeadingText, transformReadableText, toArabicNumber } from "./readability";

describe("readability", () => {
  it.each(readabilityTransformFixtures)(
    "transforms fixture: $name",
    ({ expected, input, mode }) => {
      expect(transformReadableText(input, mode)).toBe(expected);
    },
  );

  it.each(readabilityHeadingTransformFixtures)(
    "transforms heading fixture: $name",
    ({ expected, input }) => {
      expect(transformReadableHeadingText(input)).toBe(expected);
    },
  );

  it.each([
    ["第一章及び第二章", "第一章及び第二章"],
    ["第四章の二つの規定", "第四章の二つの規定"],
  ])("keeps non-heading text unchanged in heading transform: %s", (input, expected) => {
    expect(transformReadableHeadingText(input)).toBe(expected);
  });

  it.each([
    ["第十十章の二　第一条", "第十十章の二　第1条"],
    ["第四章の十十　第一条", "第4章の十十　第1条"],
  ])("preserves malformed heading number components: %s", (input, expected) => {
    expect(transformReadableHeadingText(input)).toBe(expected);
  });

  it.each([
    ["", ""],
    [
      "私権は、公共の福祉に適合しなければならない。",
      "私権は、公共の福祉に適合しなければならない。",
    ],
    [
      "一般、一部、同一、第三者、第一審、第一義的。",
      "一般、一部、同一、第三者、第一審、第一義的。",
    ],
    ["第一目標を達成する。", "第一目標を達成する。"],
    ["第一目的は安全である。", "第一目的は安全である。"],
    ["第一編成を発表する。", "第一編成を発表する。"],
    ["第一章及び第二章", "第一章及び第二章"],
    ["第四章の二で定める。", "第四章の二で定める。"],
    ["第四章の二より適用する。", "第四章の二より適用する。"],
    ["第四章の二かつ第三章の三", "第四章の二かつ第三章の三"],
    ["第四章の二以下", "第四章の二以下"],
    ["第四章の二とおり", "第四章の二とおり"],
    ["第四章の二つ", "第四章の二つ"],
    ["第四章の二か所", "第四章の二か所"],
    ["第一目から第三目まで", "第一目から第三目まで"],
    ["第四章の一部を改正する。", "第四章の一部を改正する。"],
    ["第三節の二次的な効果", "第三節の二次的な効果"],
    ["第四章の二の一部を改正する。", "第四章の二の一部を改正する。"],
  ])("keeps non-target prose unchanged: %s", (input, expected) => {
    expect(transformReadableText(input)).toBe(expected);
  });

  it("applies all readable transforms in a stable order", () => {
    expect(transformReadableText("平成五年法律第八十八号（令和六年四月一日施行）第一条")).toBe(
      "平成5年法律第88号(令和6年4月1日施行)第1条",
    );
  });

  it.each([
    ["第一号の二", "第1号の2"],
    ["第十二条の二の二", "第12条の2の2"],
    ["令和元年五月一日", "令和元年5月1日"],
    ["平成元年法律第十一号", "平成元年法律第11号"],
    ["別記様式第一", "別記様式1"],
    ["別表第一の二", "別表1の2"],
    ["別記様式第一の二", "別記様式1の2"],
  ])("transforms common legal notation: %s", (input, expected) => {
    expect(transformReadableText(input)).toBe(expected);
  });

  it.each([
    ["一", 1],
    ["十", 10],
    ["十一", 11],
    ["十二", 12],
    ["二十", 20],
    ["八十八", 88],
    ["百一", 101],
    ["九百九十九", 999],
  ])("converts kanji number %s", (input, expected) => {
    expect(toArabicNumber(input)).toBe(expected);
  });

  it.each(["", "〇", "零", "壱", "一2"])("returns undefined for unsupported number %s", (input) => {
    expect(toArabicNumber(input)).toBeUndefined();
  });

  it.each(["十十", "九千九千", "十百", "百百"])(
    "returns undefined for malformed kanji number %s",
    (input) => {
      expect(toArabicNumber(input)).toBeUndefined();
    },
  );

  it.each([
    ["第十十条", "第十十条"],
    ["第十百号", "第十百号"],
    ["第十十章", "第十十章"],
    ["第百百節", "第百百節"],
  ])("keeps malformed legal number unchanged: %s", (input, expected) => {
    expect(transformReadableText(input)).toBe(expected);
  });

  it("converts a valid article base while preserving its malformed branch number", () => {
    expect(transformReadableText("第四条の十十")).toBe("第4条の十十");
  });
});
