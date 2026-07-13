import type { LawNode } from "@/core/domain";

// 法令文の効果語の定型パターン。長い語が短い語を包含する（例:「対抗することができない」⊃「することができない」）ため、
// 正規表現の交替で最長一致になるよう長さ降順で保持する。
export const effectTerms = [
  "対抗することができない",
  "取り消すことができる",
  "することができない",
  "しなければならない",
  "することができる",
  "してはならない",
  "無効とする",
  "推定する",
  "みなす",
] as const;

// 先頭のラベル（条見出し・かっこ書き・項番号）を取り除く。
// plainText はラベルと本文をスペース連結しているため、既知のラベル文字列を前方から剥がす。
const stripLeadingLabels = (text: string, labels: (string | undefined)[]): string => {
  let result = text.trimStart();

  for (const label of labels) {
    if (label !== undefined && label !== "" && result.startsWith(label)) {
      result = result.slice(label.length).trimStart();
    }
  }

  return result;
};

// 生成元テキストの列挙。Article 直下の Paragraph の本文を項単位で返す。
// Paragraph を持たないノード（保存形式の差異やテスト fixture）は Article 自身の plainText へ
// フォールバックし、かっこ書きと条見出しを剥がして本文だけにする。
export const collectParagraphTexts = (
  article: LawNode,
  nodesById: ReadonlyMap<string, LawNode>,
): string[] => {
  const paragraphTexts = article.children
    .map((childId) => nodesById.get(childId))
    .filter((node): node is LawNode => node !== undefined)
    .filter((node) => node.type === "Paragraph")
    .map((node) => stripLeadingLabels(node.plainText, [node.title]))
    .filter((text) => text !== "");

  if (paragraphTexts.length > 0) {
    return paragraphTexts;
  }

  const fallback = stripLeadingLabels(article.plainText, [article.caption, article.title]);

  return fallback === "" ? [] : [fallback];
};

// 「。」で文に分割する。かっこ書き内の「。」でも分割される粗さは許容し、
// 不自然な候補はプレビューでの破棄に委ねる（確定済み設計 1 章の方針）。
export const splitSentences = (text: string): string[] =>
  text
    .split("。")
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "")
    .map((sentence) => `${sentence}。`);

// 改正で削られた条は本文が「削除」のみになる。クイズの生成元にならない。
export const isDeletedArticle = (
  article: LawNode,
  nodesById: ReadonlyMap<string, LawNode>,
): boolean => {
  const texts = collectParagraphTexts(article, nodesById);

  return texts.length === 0 || texts.every((text) => /^削除。?$/.test(text.trim()));
};

// 条の表示名。原文の条見出し（「第七百九条」）を優先し、無ければ正規化済み番号から組み立てる。
export const formatArticleLabel = (article: LawNode): string | undefined => {
  if (article.title !== undefined) {
    return article.title;
  }

  return article.number === undefined ? undefined : `第${article.number}条`;
};
