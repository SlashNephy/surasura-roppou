import type { LawNode } from "@/core/domain";
import { computeArticleFingerprint } from "@/core/domain";

// 現在解決した nodes から、指定の条番号の Article ノードを引く。
// 解決キーは条番号（枝番はビューワー/TOC と同じハイフン表現）で、階層 path は使わない。
export const findArticleNode = (nodes: LawNode[], article: string): LawNode | undefined => {
  return nodes.find((node) => node.type === "Article" && node.number === article);
};

export type AnchorStatus = "match" | "drift" | "not_found";

// アンカーの条番号を現在の nodes から解決し、指紋を再計算して照合する。
// 条が見つからなければ not_found、指紋一致で match、不一致で drift。
export const verifyAnchor = async (
  anchor: { article: string; fingerprint: string },
  nodes: LawNode[],
): Promise<AnchorStatus> => {
  const node = findArticleNode(nodes, anchor.article);

  if (node === undefined) {
    return "not_found";
  }

  const current = await computeArticleFingerprint(node.plainText);

  return current === anchor.fingerprint ? "match" : "drift";
};
