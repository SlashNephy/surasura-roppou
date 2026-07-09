import { describe, expect, it } from "vitest";

import { buildSnippet } from "./snippet";

describe("buildSnippet", () => {
  it.each([
    {
      name: "マッチ範囲が元テキストの一致部分を指す",
      text: "国家賠償法第一条について定める規定",
      query: "賠償",
      radius: 3,
      slice: "賠償",
    },
    {
      name: "先頭一致でも一致部分を指す",
      text: "秘密を守る義務",
      query: "秘密",
      radius: 3,
      slice: "秘密",
    },
    {
      name: "全角半角違いでも元表記を切り出す",
      text: "第１２条",
      query: "12",
      radius: 5,
      slice: "１２",
    },
    {
      name: "NFKC で複数字に展開される元文字は元文字全体を指す",
      text: "㍿の規定",
      query: "株式",
      radius: 5,
      slice: "㍿",
    },
  ])("$name", ({ text, query, radius, slice }) => {
    const snippet = buildSnippet(text, query, { radius });

    expect(snippet.highlights).toHaveLength(1);
    const [highlight] = snippet.highlights;
    expect(snippet.text.slice(highlight.start, highlight.end)).toBe(slice);
  });

  it("先頭一致では前方の省略記号を付けない", () => {
    const snippet = buildSnippet("秘密を守る義務", "秘密", { radius: 3 });

    expect(snippet.text.startsWith("…")).toBe(false);
  });

  it("窓の外側は省略記号を付ける", () => {
    const snippet = buildSnippet("あ".repeat(20) + "秘密" + "い".repeat(20), "秘密", { radius: 4 });

    expect(snippet.text.startsWith("…")).toBe(true);
    expect(snippet.text.endsWith("…")).toBe(true);
    expect(snippet.text).toContain("秘密");
  });

  it("マッチが無ければハイライト無しで先頭を返す", () => {
    const snippet = buildSnippet("民法の規定", "刑法", { radius: 3 });

    expect(snippet.highlights).toEqual([]);
    expect(snippet.text.length).toBeGreaterThan(0);
  });
});
