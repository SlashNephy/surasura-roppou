import type { LawNode, LawNodeType } from "@/core/domain";

// 検索結果の単位。条は plainText に項・号を含むので、これらだけを索引すれば重複しない。
const searchableNodeTypes: ReadonlySet<LawNodeType> = new Set<LawNodeType>([
  "Article",
  "SupplementaryProvision",
  "AppdxTable",
  "AppdxStyle",
]);

export const isSearchableNode = (node: LawNode): boolean => searchableNodeTypes.has(node.type);

// 見出し・かっこ書き・本文を検索対象テキストとして連結する。索引と検索で同じ関数を使う。
export const buildSearchableText = (node: LawNode): string =>
  [node.title, node.caption, node.plainText]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" ");
