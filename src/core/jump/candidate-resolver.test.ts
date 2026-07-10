import { describe, expect, it } from "vitest";

import { createAliasResolver } from "./alias-resolver";
import { resolveReferenceCandidates, resolveReferenceInput } from "./candidate-resolver";
import { parseReference } from "./reference-parser";

// テストは parseReference を通した実 ParsedReference を解決に渡す（公開経路の振る舞いを見る）。
const resolveText = (input: string) => {
  const parsed = parseReference(input);

  if (parsed === undefined) {
    throw new Error(`parse failed: ${input}`);
  }

  return resolveReferenceCandidates(parsed);
};

describe("resolveReferenceCandidates", () => {
  it("正式名称 + 条を単一候補に解決する", () => {
    const result = resolveText("国家賠償法第1条");

    expect(result.status).toBe("resolved");

    if (result.status !== "resolved") {
      return;
    }

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      lawId: "322AC0000000125",
      lawTitle: "国家賠償法",
      article: "1",
    });
    expect(result.candidates[0].reason).toContain("正式名称『国家賠償法』に一致");
  });

  it("略称 + 条省略を解決し score を parse から引き継ぐ", () => {
    const parsed = parseReference("民709");

    if (parsed === undefined) {
      throw new Error("parse failed");
    }

    const result = resolveReferenceCandidates(parsed);

    expect(result.status).toBe("resolved");

    if (result.status !== "resolved") {
      return;
    }

    expect(result.candidates[0]).toMatchObject({
      lawId: "129AC0000000089",
      lawTitle: "民法",
      article: "709",
      score: parsed.score,
    });
    expect(result.candidates[0].reason).toContain("略称『民』に一致");
  });

  it("条・項・号を候補へ引き継ぐ", () => {
    const result = resolveText("民法709条1項1号");

    expect(result.status).toBe("resolved");

    if (result.status !== "resolved") {
      return;
    }

    expect(result.candidates[0]).toMatchObject({ article: "709", paragraph: "1", item: "1" });
  });

  it("法令名のみ（条なし）は article を載せない", () => {
    const result = resolveText("国家賠償法");

    expect(result.status).toBe("resolved");

    if (result.status !== "resolved") {
      return;
    }

    expect(result.candidates[0].lawId).toBe("322AC0000000125");
    expect(result.candidates[0].article).toBeUndefined();
  });

  it("辞書外の法令名は law-not-found", () => {
    const result = resolveText("特定商取引法5条");

    expect(result).toEqual(
      expect.objectContaining({ status: "unresolved", reason: "law-not-found" }),
    );
  });

  it.each(["前項", "同条第一号", "本文"])("相対参照 %s は needs-context", (input) => {
    const result = resolveText(input);

    expect(result).toEqual(
      expect.objectContaining({ status: "unresolved", reason: "needs-context" }),
    );
  });

  it("曖昧な略称は複数候補を登録順で返す", () => {
    // 同一略称 "民" を 2 法令へ張ったユーザー辞書を注入する。
    const resolver = createAliasResolver({
      userEntries: [{ lawId: "LAW_X", officialTitle: "架空民事法", aliases: ["民"] }],
    });
    const parsed = parseReference("民709", { resolver });

    if (parsed === undefined) {
      throw new Error("parse failed");
    }

    const result = resolveReferenceCandidates(parsed, { resolver });

    expect(result.status).toBe("resolved");

    if (result.status !== "resolved") {
      return;
    }

    expect(result.candidates.map((candidate) => candidate.lawId)).toEqual([
      "129AC0000000089",
      "LAW_X",
    ]);
  });

  it("同一入力で決定的に同じ結果を返す", () => {
    expect(resolveText("憲法21条1項")).toEqual(resolveText("憲法21条1項"));
  });
});

describe("resolveReferenceInput", () => {
  it("文字列から parse して候補を返す", () => {
    const result = resolveReferenceInput("民709");

    expect(result?.status).toBe("resolved");
  });

  it("パース不能な入力は undefined", () => {
    expect(resolveReferenceInput("")).toBeUndefined();
  });

  it("バレル @/core/jump からも解決関数を使える", async () => {
    const barrel = await import("./index");

    const result = barrel.resolveReferenceInput("国賠1");

    expect(result?.status).toBe("resolved");
  });
});
