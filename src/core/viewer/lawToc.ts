import type { LawNode, LawNodeType } from "@/core/domain";

const tocNodeTypes = new Set<LawNodeType>([
  "Part",
  "Chapter",
  "Section",
  "Subsection",
  "Division",
  "Article",
  "SupplementaryProvision",
  "AppdxTable",
  "AppdxStyle",
]);

const nonUrlAddressableArticleContainerTypes = new Set<LawNodeType>([
  "SupplementaryProvision",
  "AppdxTable",
  "AppdxStyle",
]);

export interface LawTocItem {
  id: string;
  title: string;
  // 条の見出し（例:「（親告罪）」）。目次で条番号の隣に添える。条以外では付かない。
  caption?: string;
  type: LawNodeType;
  depth: number;
  articleNumber?: string;
  children: LawTocItem[];
}

// アンカー ID は本文中の参照リンクからも使うため短く保つ（第15条第2項 → a15-p2）。
export const articleAnchorId = (articleNumber: string): string => `a${articleNumber}`;

export const paragraphAnchorId = (articleNumber: string, paragraphNumber: string): string =>
  `${articleAnchorId(articleNumber)}-p${paragraphNumber}`;

// 号のアンカー。号番号は項ごとにリセットするため、項アンカーを前置して一意にする
// （第15条第2項第3号 → a15-p2-i3）。
export const itemAnchorId = (
  articleNumber: string,
  paragraphNumber: string,
  itemNumber: string,
): string => `${paragraphAnchorId(articleNumber, paragraphNumber)}-i${itemNumber}`;

// 編・章の見出しアンカー。章番号は編ごとにリセットするため、章の id には所属編を含める
// （編を持たない法令では章番号だけで一意になる）。条の a15 / a15-p2 とは接頭辞が異なる。
export const partAnchorId = (partNumber: string): string => `pt${partNumber}`;

export const chapterAnchorId = (partNumber: string | undefined, chapterNumber: string): string =>
  partNumber === undefined
    ? `ch${chapterNumber}`
    : `${partAnchorId(partNumber)}-ch${chapterNumber}`;

export const allowsArticleUrlTargets = (nodeType: LawNodeType): boolean =>
  !nonUrlAddressableArticleContainerTypes.has(nodeType);

export const computeChildArticleContext = (
  isUrlAddressableArticleContext: boolean,
  nodeType: LawNodeType,
): boolean => isUrlAddressableArticleContext && allowsArticleUrlTargets(nodeType);

export const buildLawTableOfContents = (nodes: LawNode[]): LawTocItem[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const topLevelNodes = nodes.filter((node) => node.parentId === undefined);

  return topLevelNodes.flatMap((node) => buildTocItems(node, nodeById, 1, true));
};

const buildTocItems = (
  node: LawNode,
  nodeById: Map<string, LawNode>,
  depth: number,
  isUrlAddressableArticleContext: boolean,
): LawTocItem[] => {
  const childArticleContext = computeChildArticleContext(isUrlAddressableArticleContext, node.type);
  const children = node.children
    .map((childId) => nodeById.get(childId))
    .filter((child): child is LawNode => child !== undefined);
  const isTocNode = tocNodeTypes.has(node.type);
  const childItems = children.flatMap((child) =>
    buildTocItems(child, nodeById, isTocNode ? depth + 1 : depth, childArticleContext),
  );

  if (!isTocNode) {
    return childItems;
  }

  const title = node.title ?? node.number ?? node.path;
  const articleNumber =
    node.type === "Article" && isUrlAddressableArticleContext ? node.number : undefined;
  // 見出し（caption）は条にのみ付く。本文の条見出し表示と揃えて目次にも添える。
  const caption = node.type === "Article" ? node.caption : undefined;

  return [
    {
      id: node.id,
      title,
      ...(caption === undefined ? {} : { caption }),
      type: node.type,
      depth,
      ...(articleNumber === undefined ? {} : { articleNumber }),
      children: childItems,
    },
  ];
};
