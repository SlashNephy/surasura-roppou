import { describe, expect, it } from "vitest";

import { readabilityTransformFixtures } from "@/test/fixtures/readability";

import { transformReadableText, toArabicNumber } from "./readability";

describe("readability", () => {
  it.each(readabilityTransformFixtures)(
    "transforms fixture: $name",
    ({ expected, input, mode }) => {
      expect(transformReadableText(input, mode)).toBe(expected);
    },
  );

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
  ])("keeps non-target prose unchanged: %s", (input, expected) => {
    expect(transformReadableText(input)).toBe(expected);
  });

  it("applies all readable transforms in a stable order", () => {
    expect(transformReadableText("平成五年法律第八十八号（令和六年四月一日施行）第一条")).toBe(
      "平成5年法律第88号(令和6年4月1日施行)第1条",
    );
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
});
