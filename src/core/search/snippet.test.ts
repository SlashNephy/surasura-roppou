import { describe, expect, it } from "vitest";

import { buildSnippet } from "./snippet";

describe("buildSnippet", () => {
  it("マッチ範囲が元テキストの一致部分を指す", () => {
    const snippet = buildSnippet("国家賠償法第一条について定める規定", "賠償", { radius: 3 });
    const [highlight] = snippet.highlights;

    expect(snippet.highlights).toHaveLength(1);
    expect(snippet.text.slice(highlight.start, highlight.end)).toBe("賠償");
  });

  it("窓の外側は省略記号を付ける", () => {
    const snippet = buildSnippet("あ".repeat(20) + "秘密" + "い".repeat(20), "秘密", { radius: 4 });

    expect(snippet.text.startsWith("…")).toBe(true);
    expect(snippet.text.endsWith("…")).toBe(true);
    expect(snippet.text).toContain("秘密");
  });

  it("先頭一致では前方の省略記号を付けない", () => {
    const snippet = buildSnippet("秘密を守る義務", "秘密", { radius: 3 });

    expect(snippet.text.startsWith("…")).toBe(false);
    const [highlight] = snippet.highlights;
    expect(snippet.text.slice(highlight.start, highlight.end)).toBe("秘密");
  });

  it("全角半角違いでも一致し、元表記を切り出す", () => {
    const snippet = buildSnippet("第１２条", "12", { radius: 5 });
    const [highlight] = snippet.highlights;

    expect(snippet.text.slice(highlight.start, highlight.end)).toBe("１２");
  });

  it("マッチが無ければハイライト無しで先頭を返す", () => {
    const snippet = buildSnippet("民法の規定", "刑法", { radius: 3 });

    expect(snippet.highlights).toEqual([]);
    expect(snippet.text.length).toBeGreaterThan(0);
  });
});
