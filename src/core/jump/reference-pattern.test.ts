import { describe, expect, it } from "vitest";

import {
  bodyReferencePositionPatternSource,
  referencePositionPatternSource,
} from "./reference-pattern";

// パターンが 1 参照をどこからどこまでの 1 スパンとして取るかを検証する。
// 分割されると、後半が別の参照として誤って解決される。
const firstBodyMatch = (text: string): string | undefined =>
  new RegExp(bodyReferencePositionPatternSource).exec(text)?.[0];

const firstOcrMatch = (text: string): string | undefined =>
  new RegExp(referencePositionPatternSource).exec(text)?.[0];

describe("bodyReferencePositionPatternSource", () => {
  it.each([
    {
      name: "matches 同条 with a following paragraph as one span",
      text: "同条第4項の規定",
      expected: "同条第4項",
    },
    {
      name: "matches 同法 with an article and a paragraph as one span",
      text: "同法第2条第1項に規定する",
      expected: "同法第2条第1項",
    },
    {
      name: "matches 同項 with a following item as one span",
      text: "同項第3号に掲げる",
      expected: "同項第3号",
    },
    { name: "matches a bare 同項", text: "同項に規定する", expected: "同項" },
    { name: "matches a bare 同号", text: "同号に掲げる", expected: "同号" },
    { name: "matches a bare 同法", text: "同法の規定", expected: "同法" },
    {
      name: "matches 同条 with a paragraph and an item as one span",
      text: "同条第2項第3号の規定",
      expected: "同条第2項第3号",
    },
    { name: "still matches a plain article reference", text: "第15条の規定", expected: "第15条" },
    {
      name: "still matches an article with a paragraph as one span",
      text: "第15条第2項の規定",
      expected: "第15条第2項",
    },
    {
      name: "still matches a part and a chapter as one span",
      text: "第4編第2章の規定",
      expected: "第4編第2章",
    },
  ])("$name", ({ expected, text }) => {
    expect(firstBodyMatch(text)).toBe(expected);
  });
});

describe("referencePositionPatternSource", () => {
  it.each([
    {
      name: "does not treat 同条 as a reference start",
      text: "同条第4項の規定",
      expected: "第4項",
    },
    { name: "does not treat 同項 as a reference", text: "同項に規定する", expected: undefined },
  ])("$name", ({ expected, text }) => {
    expect(firstOcrMatch(text)).toBe(expected);
  });
});
