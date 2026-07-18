import { type ReactNode, useMemo } from "react";

import type { LawNode, LawNodeType } from "@/core/domain";
import { cn } from "@/shared/utils/cn";

import {
  applyLawHeadingTextDisplayMode,
  applyLawTextDisplayMode,
  type LawTextDisplayMode,
} from "./displayMode";
import { articleAnchorId, computeChildArticleContext } from "./lawToc";

interface LawNodeListProps {
  nodes: LawNode[];
  activeArticleNumber?: string;
  displayMode?: LawTextDisplayMode;
  renderArticleActions?: (article: LawNode) => ReactNode;
}

type HeadingLawNodeType = Exclude<LawNodeType, "Article" | "Paragraph" | "Item" | "Subitem">;

const headingClassNameByType: Record<HeadingLawNodeType, string> = {
  Part: "text-xl font-semibold",
  Chapter: "text-lg font-semibold",
  Section: "text-base font-semibold",
  Subsection: "text-base font-semibold",
  Division: "text-base font-semibold",
  SupplementaryProvision: "text-lg font-semibold",
  AppdxTable: "text-lg font-semibold",
  AppdxStyle: "text-lg font-semibold",
};

type HeadingTag = "h2" | "h3" | "h4" | "h5" | "h6";

const headingTags: HeadingTag[] = ["h2", "h3", "h4", "h5", "h6"];

export const LawNodeList = ({
  activeArticleNumber,
  displayMode = "readable",
  nodes,
  renderArticleActions,
}: LawNodeListProps) => {
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const topLevelNodes = useMemo(() => nodes.filter((node) => node.parentId === undefined), [nodes]);

  return (
    <div className="grid gap-5">
      {topLevelNodes.map((node) => (
        <LawNodeBlock
          key={node.id}
          activeArticleNumber={activeArticleNumber}
          depth={1}
          displayMode={displayMode}
          isUrlAddressableArticleContext={true}
          node={node}
          nodeById={nodeById}
          renderArticleActions={renderArticleActions}
        />
      ))}
    </div>
  );
};

const LawNodeBlock = ({
  activeArticleNumber,
  depth,
  displayMode,
  isUrlAddressableArticleContext,
  node,
  nodeById,
  renderArticleActions,
}: {
  activeArticleNumber: string | undefined;
  depth: number;
  displayMode: LawTextDisplayMode;
  isUrlAddressableArticleContext: boolean;
  node: LawNode;
  nodeById: Map<string, LawNode>;
  renderArticleActions: ((article: LawNode) => ReactNode) | undefined;
}) => {
  const childArticleContext = computeChildArticleContext(isUrlAddressableArticleContext, node.type);
  const children = node.children
    .map((childId) => nodeById.get(childId))
    .filter((child): child is LawNode => child !== undefined);
  const Heading = headingTags[Math.min(depth - 1, headingTags.length - 1)];

  switch (node.type) {
    case "Article": {
      const articleNumber = node.number;
      const articleId =
        articleNumber !== undefined && isUrlAddressableArticleContext
          ? articleAnchorId(articleNumber)
          : undefined;
      const isUrlAddressableArticle = articleId !== undefined;
      const isActiveArticle = isUrlAddressableArticle && node.number === activeArticleNumber;
      const displayTitle = getDisplayInlineText(node.title ?? node.number, displayMode);
      const displayCaption = getDisplayInlineText(node.caption, displayMode);
      const displayText = getDisplayText(node, displayMode);

      return (
        <article
          id={articleId}
          data-active={isActiveArticle ? "true" : undefined}
          aria-current={isActiveArticle ? "location" : undefined}
          aria-label={node.title ?? `条文 ${node.number ?? node.path}`}
          className="group relative scroll-mt-20 py-4 md:py-5"
        >
          {isActiveArticle ? (
            <span
              aria-hidden="true"
              className="absolute top-4 bottom-4 -left-4 w-2 rounded-l-xs border-y-2 border-l-2 border-primary md:-left-6"
            />
          ) : null}
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <Heading className="min-w-0 font-serif text-lg font-semibold text-foreground break-words">
              {displayTitle}
              {displayCaption === undefined ? null : (
                <span className="ml-2 text-base font-normal text-secondary-foreground">
                  {displayCaption}
                </span>
              )}
            </Heading>
            {isUrlAddressableArticle && renderArticleActions !== undefined ? (
              <div className="flex shrink-0 flex-wrap gap-2">{renderArticleActions(node)}</div>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3">
            {children.length > 0 ? (
              renderChildBlocks({
                activeArticleNumber,
                children,
                depth,
                displayMode,
                isUrlAddressableArticleContext: childArticleContext,
                nodeById,
                renderArticleActions,
              })
            ) : (
              <p className="indent-[1em] font-serif leading-display text-foreground break-words">
                {displayText}
              </p>
            )}
          </div>
        </article>
      );
    }

    case "Paragraph":
    case "Item":
    case "Subitem": {
      const marker =
        node.type === "Paragraph"
          ? (node.title ?? getArticleParagraphMarker(node, nodeById))
          : (node.title ?? node.number);
      const displayMarker = getDisplayInlineText(marker, displayMode);
      const bodyText = stripLeadingMarker(
        stripTrailingChildPlainTexts(getDisplayText(node, displayMode), children, displayMode),
        displayMarker,
      );

      return (
        <div
          className={cn(
            "grid gap-2",
            node.type === "Item" && "pl-5",
            node.type === "Subitem" && "pl-8",
          )}
        >
          <p className="flex min-w-0 gap-3 font-serif leading-display text-foreground">
            {displayMarker !== undefined ? (
              <span className="shrink-0 text-muted-foreground">{displayMarker}</span>
            ) : null}
            {/* 番号のない項（前文・第1項など）は先頭1文字を字下げして体裁を整える。
                番号のある項は marker が行頭に立つので追加の字下げはしない。 */}
            <span
              className={cn("min-w-0 break-words", displayMarker === undefined && "indent-[1em]")}
            >
              {bodyText}
            </span>
          </p>
          {renderChildBlocks({
            activeArticleNumber,
            children,
            depth,
            displayMode,
            isUrlAddressableArticleContext: childArticleContext,
            nodeById,
            renderArticleActions,
          })}
        </div>
      );
    }
  }

  const headingClassName = headingClassNameByType[node.type];
  const displayTitle = getDisplayHeadingInlineText(node.title, displayMode);
  const bodyText = stripLeadingMarker(
    applyLawHeadingTextDisplayMode(
      stripTrailingChildPlainTexts(getDisplayText(node, displayMode), children, displayMode),
      displayMode,
    ),
    displayTitle,
  );

  return (
    <section className="grid gap-3">
      {displayTitle !== undefined ? (
        <Heading className={cn("font-serif text-foreground break-words", headingClassName)}>
          {displayTitle}
        </Heading>
      ) : null}
      {bodyText !== "" ? (
        <p className="font-serif leading-display text-foreground break-words">{bodyText}</p>
      ) : null}
      {renderChildBlocks({
        activeArticleNumber,
        children,
        depth,
        displayMode,
        isUrlAddressableArticleContext: childArticleContext,
        nodeById,
        renderArticleActions,
      })}
    </section>
  );
};

const renderChildBlocks = ({
  activeArticleNumber,
  children,
  depth,
  displayMode,
  isUrlAddressableArticleContext,
  nodeById,
  renderArticleActions,
}: {
  activeArticleNumber: string | undefined;
  children: LawNode[];
  depth: number;
  displayMode: LawTextDisplayMode;
  isUrlAddressableArticleContext: boolean;
  nodeById: Map<string, LawNode>;
  renderArticleActions: ((article: LawNode) => ReactNode) | undefined;
}) =>
  children.map((child) => (
    <LawNodeBlock
      key={child.id}
      activeArticleNumber={activeArticleNumber}
      depth={depth + 1}
      displayMode={displayMode}
      isUrlAddressableArticleContext={isUrlAddressableArticleContext}
      node={child}
      nodeById={nodeById}
      renderArticleActions={renderArticleActions}
    />
  ));

// 条（Article）直下の項は第2項以降で番号を示す。ただし ParagraphNum が空の旧番号形式
// （例: 日本国憲法）は title を持たないため、Num 由来の number で番号を補完する。
// 前文など Article 直下でない項は散文なので番号を付けない。
const getArticleParagraphMarker = (
  node: LawNode,
  nodeById: Map<string, LawNode>,
): string | undefined => {
  if (node.number === undefined || node.number === "1") {
    return undefined;
  }

  const parent = node.parentId === undefined ? undefined : nodeById.get(node.parentId);

  return parent?.type === "Article" ? node.number : undefined;
};

const stripTrailingChildPlainTexts = (
  plainText: string,
  children: LawNode[],
  displayMode: LawTextDisplayMode,
): string =>
  children.reduceRight((bodyText, child) => {
    const childText = getDisplayText(child, displayMode);

    if (childText === "") {
      return bodyText;
    }

    if (!bodyText.endsWith(childText)) {
      return bodyText;
    }

    return bodyText.slice(0, -childText.length).trim();
  }, plainText);

const stripLeadingMarker = (plainText: string, marker: string | undefined): string => {
  if (marker === undefined) {
    return plainText;
  }

  return plainText.startsWith(marker) ? plainText.slice(marker.length).trim() : plainText;
};

const getDisplayText = (node: LawNode, displayMode: LawTextDisplayMode): string => {
  const text = displayMode === "original" ? node.rawText || node.plainText : node.plainText;

  return applyLawTextDisplayMode(text, displayMode);
};

const getDisplayInlineText = (
  text: string | undefined,
  displayMode: LawTextDisplayMode,
): string | undefined => {
  if (text === undefined) {
    return undefined;
  }

  return applyLawTextDisplayMode(text, displayMode);
};

const getDisplayHeadingInlineText = (
  text: string | undefined,
  displayMode: LawTextDisplayMode,
): string | undefined => {
  if (text === undefined) {
    return undefined;
  }

  return applyLawHeadingTextDisplayMode(text, displayMode);
};
