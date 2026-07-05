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

export interface LawTocItem {
  id: string;
  title: string;
  type: LawNodeType;
  depth: number;
  articleNumber?: string;
  children: LawTocItem[];
}

export const articleAnchorId = (articleNumber: string): string => `article-${articleNumber}`;

export const buildLawTableOfContents = (nodes: LawNode[]): LawTocItem[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const topLevelNodes = nodes.filter((node) => node.parentId === undefined);

  return topLevelNodes.flatMap((node) => buildTocItems(node, nodeById, 1));
};

const buildTocItems = (
  node: LawNode,
  nodeById: Map<string, LawNode>,
  depth: number,
): LawTocItem[] => {
  const children = node.children
    .map((childId) => nodeById.get(childId))
    .filter((child): child is LawNode => child !== undefined);
  const childItems = children.flatMap((child) => buildTocItems(child, nodeById, depth + 1));

  if (!tocNodeTypes.has(node.type)) {
    return childItems;
  }

  const title = node.title ?? node.number ?? node.path;
  const articleNumber = node.type === "Article" ? node.number : undefined;

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
