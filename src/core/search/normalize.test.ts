import { describe, expect, it } from "vitest";

import { normalizeForSearch } from "./normalize";

describe("normalizeForSearch", () => {
  it.each([
    { name: "全角英字を半角小文字化する", input: "ＡbＣ", normalized: "abc", sourceIndex: [0, 1, 2] },
    { name: "全角空白を落とし位置を保つ", input: "Ａ　Ｂ", normalized: "ab", sourceIndex: [0, 2] },
    { name: "前後と連続の空白を落とす", input: "  民 法 ", normalized: "民法", sourceIndex: [2, 4] },
    { name: "互換文字を分解して全文字を同じ由来に写す", input: "㍿", normalized: "株式会社", sourceIndex: [0, 0, 0, 0] },
    { name: "空文字は空を返す", input: "", normalized: "", sourceIndex: [] },
    { name: "空白のみは空を返す", input: "　\n ", normalized: "", sourceIndex: [] },
  ])("$name", ({ input, normalized, sourceIndex }) => {
    expect(normalizeForSearch(input)).toEqual({ normalized, sourceIndex });
  });

  it("sourceIndex は元テキストの部分文字列を正しく指す", () => {
    const text = "第一条　秘密を守る";
    const { normalized, sourceIndex } = normalizeForSearch(text);
    const start = normalized.indexOf("秘密");
    const origStart = sourceIndex[start];
    const origEnd = sourceIndex[start + 2];

    expect(text.slice(origStart, origEnd)).toBe("秘密");
  });
});
