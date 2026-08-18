import type { LawNode, LawReferenceTarget, TextQuoteAnchor } from "@/core/domain";

import { commonPrefixLength, commonSuffixLength } from "./text-alignment";

// 前後の文脈として保持する文字数。条文は同じ語が何度も出るので、
// 短すぎると候補を絞れず、長すぎると改正の影響を受けやすくなる。
const contextLength = 32;

export const createTextQuoteAnchor = (
  plainText: string,
  start: number,
  end: number,
): { quote: string; prefix: string; suffix: string } => ({
  quote: plainText.slice(start, end),
  prefix: plainText.slice(Math.max(0, start - contextLength), start),
  suffix: plainText.slice(end, end + contextLength),
});

// 引用文が複数箇所に出るときは前後の文脈の一致長で最良候補を選ぶ。
// 見つからなければ undefined（条文が改正で変わった）。
export const resolveTextQuoteAnchor = (
  plainText: string,
  anchor: TextQuoteAnchor,
): { start: number; end: number } | undefined => {
  if (anchor.quote === "") {
    return undefined;
  }

  let best: number | undefined;
  let bestScore = -1;

  for (
    let index = plainText.indexOf(anchor.quote);
    index !== -1;
    index = plainText.indexOf(anchor.quote, index + 1)
  ) {
    const score =
      commonSuffixLength(plainText.slice(0, index), anchor.prefix) +
      commonPrefixLength(plainText.slice(index + anchor.quote.length), anchor.suffix);

    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }

  return best === undefined ? undefined : { start: best, end: best + anchor.quote.length };
};

// アンカーの対象ノードを path で引く。path は改版をまたいで安定し、
// node.id は revisionId を含むため保存キーには使えない。
export const findAnchorNode = (
  nodes: LawNode[],
  target: LawReferenceTarget,
): LawNode | undefined => {
  const path = target.path;

  if (path === undefined || path === null || path === "") {
    return undefined;
  }

  return nodes.find((node) => node.path === path);
};
