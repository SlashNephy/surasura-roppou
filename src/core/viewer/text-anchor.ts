import type { LawNode, LawReferenceTarget, TextQuoteAnchor } from "@/core/domain";
import { hasReferenceValue } from "@/core/domain";

import { commonPrefixLength, commonSuffixLength } from "./text-alignment";

// 前後の文脈として保持する文字数。条文は同じ語が何度も出るので、
// 短すぎると候補を絞れず、長すぎると改正の影響を受けやすくなる。
const contextLength = 32;

export const createTextQuoteAnchor = (
  plainText: string,
  start: number,
  end: number,
): { quote: string; prefix: string; suffix: string } => {
  // slice は負のインデックスを「末尾からの相対位置」として解釈するため、
  // start が負のまま渡ると quote が非対称に壊れる。0 <= start <= end <= plainText.length
  // に丸めてから使う。
  const clampedStart = Math.max(0, Math.min(start, plainText.length));
  const clampedEnd = Math.max(clampedStart, Math.min(end, plainText.length));

  return {
    quote: plainText.slice(clampedStart, clampedEnd),
    prefix: plainText.slice(Math.max(0, clampedStart - contextLength), clampedStart),
    suffix: plainText.slice(clampedEnd, clampedEnd + contextLength),
  };
};

// 引用文の再解決。undefined になるのは次のいずれか:
// - quote が空文字列
// - quote が本文に1つも出現しない（条文が改正で変わった）
// - quote の出現が複数あり、どの候補も前後の文脈が一切一致しない（score 0）。
//   改正で周囲の文が入れ替わり quote だけ別の場所に生き残った状態を指し、
//   根拠なく別の出現位置へハイライトを復元しないための安全側の判断。
// 出現が複数あるときは前後の文脈の一致長（score）が最大の候補を選ぶ。同点は先頭勝ち。
// 出現が1箇所だけなら score 0 でも採用する。ノード全体が引用文のとき
// createTextQuoteAnchor は prefix/suffix を空文字列にするため、正解でも score 0 になる。
export const resolveTextQuoteAnchor = (
  plainText: string,
  anchor: TextQuoteAnchor,
): { start: number; end: number } | undefined => {
  if (anchor.quote === "") {
    return undefined;
  }

  let best: number | undefined;
  let bestScore = -1;
  let occurrenceCount = 0;

  for (
    let index = plainText.indexOf(anchor.quote);
    index !== -1;
    index = plainText.indexOf(anchor.quote, index + 1)
  ) {
    occurrenceCount += 1;

    const score =
      commonSuffixLength(plainText.slice(0, index), anchor.prefix) +
      commonPrefixLength(plainText.slice(index + anchor.quote.length), anchor.suffix);

    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }

  if (best === undefined) {
    return undefined;
  }

  if (occurrenceCount > 1 && bestScore === 0) {
    return undefined;
  }

  return { start: best, end: best + anchor.quote.length };
};

// アンカーの対象ノードを path で引く。path は改版をまたいで安定し、
// node.id は revisionId を含むため保存キーには使えない。
export const findAnchorNode = <T extends Pick<LawNode, "id" | "path" | "type">>(
  nodes: T[],
  target: LawReferenceTarget,
): T | undefined => {
  const path = target.path;

  if (!hasReferenceValue(path)) {
    return undefined;
  }

  return nodes.find((node) => node.path === path);
};
