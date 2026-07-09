import { describe, expect, it } from "vitest";

import { computeArticleFingerprint } from "./article-fingerprint";

describe("computeArticleFingerprint", () => {
  it("16 文字の hex を返す", async () => {
    const fp = await computeArticleFingerprint("第一条 この法律は…");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("同じ入力には同じ指紋を返す（決定的）", async () => {
    const a = await computeArticleFingerprint("第一条 この法律は…");
    const b = await computeArticleFingerprint("第一条 この法律は…");
    expect(a).toBe(b);
  });

  it("NFKC と空白除去でゆれを吸収する（全角/半角・空白違いは同一指紋）", async () => {
    // "ABC" の全角と、途中の空白・改行違いは NFKC + 空白除去で同一に落ちる。
    const a = await computeArticleFingerprint("ＡＢＣ 第一条");
    const b = await computeArticleFingerprint("ABC第一条");
    expect(a).toBe(b);
  });

  it("句読点程度の差でも不一致になる（改変検知）", async () => {
    const a = await computeArticleFingerprint("第一条 この法律は、…");
    const b = await computeArticleFingerprint("第一条 この法律は。…");
    expect(a).not.toBe(b);
  });

  it("英字の大文字小文字差は保持する（不一致になる）", async () => {
    // 指紋は照合用正規化と違い小文字化しない。改変とみなす。
    const a = await computeArticleFingerprint("Abc");
    const b = await computeArticleFingerprint("abc");
    expect(a).not.toBe(b);
  });
});
