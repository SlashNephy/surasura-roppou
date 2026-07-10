import type { LawNode } from "@/core/domain";
import { computeArticleFingerprint } from "@/core/domain";
import { describe, expect, it } from "vitest";

import { findArticleNode, verifyAnchor } from "./anchor-verification";

const articleNode = (number: string, plainText: string): LawNode => ({
  id: `art-${number}`,
  lawId: "L",
  revisionId: "R",
  type: "Article",
  path: `/Article[${number}]`,
  number,
  rawText: plainText,
  plainText,
  children: [],
});

const nodes: LawNode[] = [
  articleNode("1", "第一条 この法律は…"),
  articleNode("2", "第二条 用語の定義…"),
  { ...articleNode("3", "第三条"), type: "Paragraph" }, // Article でないノードは無視される
];

describe("findArticleNode", () => {
  it("条番号一致で Article ノードを返す", () => {
    expect(findArticleNode(nodes, "2")?.number).toBe("2");
  });

  it("該当条が無ければ undefined", () => {
    expect(findArticleNode(nodes, "99")).toBeUndefined();
  });

  it("同番号でも Article でないノードは拾わない", () => {
    expect(findArticleNode(nodes, "3")).toBeUndefined();
  });
});

describe("verifyAnchor", () => {
  it("指紋一致で match", async () => {
    const fingerprint = await computeArticleFingerprint("第一条 この法律は…");
    expect(await verifyAnchor({ article: "1", fingerprint }, nodes)).toBe("match");
  });

  it("指紋不一致で drift", async () => {
    expect(await verifyAnchor({ article: "1", fingerprint: "deadbeefdeadbeef" }, nodes)).toBe(
      "drift",
    );
  });

  it("該当条が無ければ not_found", async () => {
    expect(await verifyAnchor({ article: "99", fingerprint: "deadbeefdeadbeef" }, nodes)).toBe(
      "not_found",
    );
  });
});
