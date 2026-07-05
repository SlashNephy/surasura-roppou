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
  type: LawNodeType;
  depth: number;
  articleNumber?: string;
  children: LawTocItem[];
}

export const articleAnchorId = (articleNumber: string): string => `article-${articleNumber}`;

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

  return [
    {
      id: node.id,
      title,
      type: node.type,
      depth,
      ...(articleNumber === undefined ? {} : { articleNumber }),
      children: childItems,
    },
  ];
};
