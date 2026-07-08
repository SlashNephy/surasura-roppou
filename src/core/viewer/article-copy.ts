import type { Law, LawNode } from "@/core/domain";
import { buildLawArticleUrl } from "@/core/domain";

interface BuildArticleCopyTextInput {
  article: LawNode;
  baseUrl: string;
  law: Law;
  nodes: LawNode[];
}

export const buildArticleCopyText = ({
  article,
  baseUrl,
  law,
  nodes,
}: BuildArticleCopyTextInput): string => {
  const url = buildAbsoluteArticleUrl({ article, baseUrl, law });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const body = getArticleBodyText(article, nodeById);

  return body === ""
    ? [getArticleLabel(article), "", url].join("\n")
    : [getArticleLabel(article), "", body, "", url].join("\n");
};

const buildAbsoluteArticleUrl = ({
  article,
  baseUrl,
  law,
}: {
  article: LawNode;
  baseUrl: string;
  law: Law;
}): string => {
  const relativeUrl = buildLawArticleUrl({
    lawId: law.lawId,
    ...(article.number === undefined ? {} : { article: article.number }),
  });

  return new URL(relativeUrl, baseUrl).toString();
};

const getOriginalNodeText = (node: LawNode): string =>
  node.rawText === "" ? node.plainText : node.rawText;

const getArticleLabel = (article: LawNode): string => {
  const title =
    article.title ?? (article.number === undefined ? undefined : `第${article.number}条`);

  return `${title ?? "条文"}${article.caption ?? ""}`;
};

const getArticleBodyText = (article: LawNode, nodeById: ReadonlyMap<string, LawNode>): string => {
  const children = article.children
    .map((childId) => nodeById.get(childId))
    .filter((child): child is LawNode => child !== undefined);
  const bodyTexts =
    children.length === 0
      ? [stripLeadingArticleLabel(getOriginalNodeText(article), article)]
      : children.map((child) => formatNodeText(child, nodeById));

  return bodyTexts
    .map((text) => text.trim())
    .filter((text) => text !== "")
    .join("\n");
};

const formatNodeText = (node: LawNode, nodeById: ReadonlyMap<string, LawNode>): string => {
  const children = node.children
    .map((childId) => nodeById.get(childId))
    .filter((child): child is LawNode => child !== undefined);
  const ownText = normalizeLeadingMarkerSpacing(
    stripTrailingChildTexts(getOriginalNodeText(node), children),
    node,
  );
  const childTexts = children.map((child) => formatNodeText(child, nodeById));

  return [ownText, ...childTexts]
    .map((text) => text.trim())
    .filter((text) => text !== "")
    .join("\n");
};

const stripLeadingArticleLabel = (text: string, article: LawNode): string => {
  const labels = [article.title, article.caption].filter(
    (label): label is string => label !== undefined,
  );
  let nextText = text.trimStart();

  for (const label of labels) {
    if (nextText.startsWith(label)) {
      nextText = nextText.slice(label.length).trimStart();
    }
  }

  return nextText;
};

const stripTrailingChildTexts = (text: string, children: LawNode[]): string => {
  let nextText = text.trimEnd();

  for (const child of [...children].reverse()) {
    const childText = getOriginalNodeText(child).trim();

    if (childText !== "" && nextText.endsWith(childText)) {
      nextText = nextText.slice(0, -childText.length).trimEnd();
    }
  }

  return nextText;
};

const normalizeLeadingMarkerSpacing = (text: string, node: LawNode): string => {
  if (node.type !== "Paragraph" && node.type !== "Item" && node.type !== "Subitem") {
    return text;
  }

  const match = /^([0-9０-９一二三四五六七八九十百千]+)[\s\u3000]+(.+)$/.exec(text.trimStart());

  return match === null ? text : `${match[1]} ${match[2]}`;
};
