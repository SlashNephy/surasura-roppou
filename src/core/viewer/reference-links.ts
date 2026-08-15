import type { LawNode } from "@/core/domain";

import { computeChildArticleContext } from "./lawToc";

// 本文の参照リンクを解決するために必要な、法令 1 件ぶんの条の一覧。
// 文書順に並び、前条・次条の解決に使う。
export interface ArticleLinkEntry {
  articleNumber: string;
  // 条見出し。格納形の外側の括弧は剥がしてある。
  caption?: string;
  // 条直下の項番号。前項・次項の解決と、存在しない項への着地の抑止に使う。
  paragraphNumbers: string[];
}

const captionParenthesesPattern = /^[（(]([\s\S]*)[）)]$/;

// 条見出しは「（親告罪）」の形で格納されている。〈 〉で囲み直すため外側の括弧を剥がす。
const stripCaptionParentheses = (caption: string | undefined): string | undefined => {
  if (caption === undefined) {
    return undefined;
  }

  const match = captionParenthesesPattern.exec(caption);

  return match === null ? caption : match[1];
};

export const buildArticleLinkEntries = (nodes: LawNode[]): ArticleLinkEntry[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const topLevelNodes = nodes.filter((node) => node.parentId === undefined);

  return topLevelNodes.flatMap((node) => collectArticleLinkEntries(node, nodeById, true));
};

const collectArticleLinkEntries = (
  node: LawNode,
  nodeById: Map<string, LawNode>,
  isUrlAddressableArticleContext: boolean,
): ArticleLinkEntry[] => {
  const children = node.children
    .map((childId) => nodeById.get(childId))
    .filter((child): child is LawNode => child !== undefined);

  if (node.type === "Article") {
    // 附則・別表の中の条は本則の条を指さないため、リンクの着地先にしない。
    if (!isUrlAddressableArticleContext || node.number === undefined) {
      return [];
    }

    const caption = stripCaptionParentheses(node.caption);

    return [
      {
        articleNumber: node.number,
        ...(caption === undefined ? {} : { caption }),
        paragraphNumbers: children.flatMap((child) =>
          child.type === "Paragraph" && child.number !== undefined ? [child.number] : [],
        ),
      },
    ];
  }

  const childArticleContext = computeChildArticleContext(isUrlAddressableArticleContext, node.type);

  return children.flatMap((child) =>
    collectArticleLinkEntries(child, nodeById, childArticleContext),
  );
};
