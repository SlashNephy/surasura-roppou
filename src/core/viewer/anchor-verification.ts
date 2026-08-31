import type { LawNode } from "@/core/domain";
import { computeArticleFingerprint, normalizeArticleNumberForLookup } from "@/core/domain";

// 現在解決した nodes から、指定の条番号の Article ノードを引く。階層 path は使わない。
// 条番号は枝番の区切りが由来で割れる（876_9 / 876-9 / 876の9）ため、両側を正規化して
// 突き合わせる。保存済みアンカーやルートの表記が正準表記と違っても引き当てられる。
export const findArticleNode = (nodes: LawNode[], article: string): LawNode | undefined => {
  const normalized = normalizeArticleNumberForLookup(article);

  return nodes.find(
    (node) =>
      node.type === "Article" &&
      node.number !== undefined &&
      normalizeArticleNumberForLookup(node.number) === normalized,
  );
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
