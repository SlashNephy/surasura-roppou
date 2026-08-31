import { describe, expect, it } from "vitest";

import { deriveLawIdFromLawNumber, parseLawNumber } from "./law-number";

describe("parseLawNumber", () => {
  it.each([
    {
      name: "parses a kanji formatted act number",
      text: "平成十一年法律第百五十六号",
      expected: { era: "Heisei", year: 11, type: "法律", number: 156 },
    },
    {
      name: "parses an arabic formatted act number",
      text: "平成11年法律第156号",
      expected: { era: "Heisei", year: 11, type: "法律", number: 156 },
    },
    {
      name: "parses a full width arabic formatted act number",
      text: "平成１１年法律第１５６号",
      expected: { era: "Heisei", year: 11, type: "法律", number: 156 },
    },
    {
      name: "reads 元年 as the first year",
      text: "平成元年政令第二十九号",
      expected: { era: "Heisei", year: 1, type: "政令", number: 29 },
    },
    {
      name: "parses a cabinet order number",
      text: "昭和二十二年政令第一号",
      expected: { era: "Showa", year: 22, type: "政令", number: 1 },
    },
    {
      name: "parses a ministerial ordinance number",
      text: "明治二十七年大蔵省令第二号",
      expected: { era: "Meiji", year: 27, type: "大蔵省令", number: 2 },
    },
    {
      name: "parses a dajokan proclamation number",
      text: "明治五年太政官布告第三百三十七号",
      expected: { era: "Meiji", year: 5, type: "太政官布告", number: 337 },
    },
    {
      name: "ignores the text following the law number",
      text: "平成十一年法律第百五十六号。以下「原災法」という。",
      expected: { era: "Heisei", year: 11, type: "法律", number: 156 },
    },
  ])("$name", ({ expected, text }) => {
    expect(parseLawNumber(text)).toEqual(expected);
  });

  it.each([
    { name: "rejects a parenthetical that is not a law number", text: "以下「原災法」という。" },
    { name: "rejects a caption", text: "親告罪" },
    { name: "rejects a law number without an era", text: "十一年法律第百五十六号" },
    { name: "rejects a law number that does not start the text", text: "同じ平成11年法律第156号" },
    { name: "rejects a year of zero", text: "平成〇年法律第百五十六号" },
  ])("$name", ({ text }) => {
    expect(parseLawNumber(text)).toBeUndefined();
  });
});

describe("deriveLawIdFromLawNumber", () => {
  it.each([
    {
      name: "derives a Showa cabinet order id",
      parsed: { era: "Showa", year: 22, type: "政令", number: 1 },
      expected: "322CO0000000001",
    },
    {
      name: "derives a Heisei cabinet order id from 元年",
      parsed: { era: "Heisei", year: 1, type: "政令", number: 29 },
      expected: "401CO0000000029",
    },
    {
      name: "derives a Reiwa cabinet order id",
      parsed: { era: "Reiwa", year: 3, type: "政令", number: 203 },
      expected: "503CO0000000203",
    },
  ] as const)("$name", ({ expected, parsed }) => {
    expect(deriveLawIdFromLawNumber(parsed)).toBe(expected);
  });

  it.each([
    {
      name: "does not derive an act id because the id encodes how the bill was introduced",
      parsed: { era: "Heisei", year: 11, type: "法律", number: 156 },
    },
    {
      name: "does not derive a ministerial ordinance id because the id encodes the ministry",
      parsed: { era: "Meiji", year: 27, type: "大蔵省令", number: 2 },
    },
    {
      name: "does not derive an id for a year outside the two digit range",
      parsed: { era: "Showa", year: 100, type: "政令", number: 1 },
    },
    {
      name: "does not derive an id for a year of zero",
      parsed: { era: "Showa", year: 0, type: "政令", number: 1 },
    },
    {
      name: "does not derive an id for a number of zero",
      parsed: { era: "Showa", year: 22, type: "政令", number: 0 },
    },
    {
      name: "does not derive an id for a non integer year",
      parsed: { era: "Showa", year: 22.5, type: "政令", number: 1 },
    },
    {
      name: "does not derive an id for a non integer number",
      parsed: { era: "Showa", year: 22, type: "政令", number: 1.5 },
    },
  ] as const)("$name", ({ parsed }) => {
    expect(deriveLawIdFromLawNumber(parsed)).toBeUndefined();
  });
});
