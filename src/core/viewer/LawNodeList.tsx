import { type ReactNode, useMemo } from "react";

import {
  buildLawArticleUrl,
  type LawNode,
  type LawNodeType,
  type RubyAnnotation,
} from "@/core/domain";
import { cn } from "@/shared/utils/cn";

import {
  applyLawHeadingTextDisplayMode,
  applyLawTextDisplayMode,
  type LawTextDisplayMode,
} from "./displayMode";
import { LawTextWithRuby } from "./LawTextWithRuby";
import { articleAnchorId, computeChildArticleContext, paragraphAnchorId } from "./lawToc";
import {
  buildArticleLinkEntries,
  segmentReferenceLinks,
  type ArticleLinkContext,
  type ReferenceLinkSegment,
} from "./reference-links";

interface LawNodeListProps {
  lawId: string;
  nodes: LawNode[];
  activeArticleNumber?: string;
  displayMode?: LawTextDisplayMode;
  onSelectArticle?: (articleNumber: string) => void;
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
  lawId,
  nodes,
  onSelectArticle,
  renderArticleActions,
}: LawNodeListProps) => {
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const topLevelNodes = useMemo(() => nodes.filter((node) => node.parentId === undefined), [nodes]);
  const articles = useMemo(() => buildArticleLinkEntries(nodes), [nodes]);
  const linking = useMemo<LinkingOptions>(
    () => ({ articles, displayMode, lawId, onSelectArticle }),
    [articles, displayMode, lawId, onSelectArticle],
  );

  return (
    <div className="grid gap-5">
      {topLevelNodes.map((node) => (
        <LawNodeBlock
          key={node.id}
          activeArticleNumber={activeArticleNumber}
          depth={1}
          displayMode={displayMode}
          isUrlAddressableArticleContext={true}
          linking={linking}
          node={node}
          nodeById={nodeById}
          position={{ articleNumber: undefined }}
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
  linking,
  node,
  nodeById,
  position,
  renderArticleActions,
}: {
  activeArticleNumber: string | undefined;
  depth: number;
  displayMode: LawTextDisplayMode;
  isUrlAddressableArticleContext: boolean;
  linking: LinkingOptions;
  node: LawNode;
  nodeById: Map<string, LawNode>;
  // 本文中の相対参照（前条・前項）の基準となる、この節点を含む条・項の番号。
  // 附則・別表の中では条アンカーが無いため undefined のまま伝える。
  position: { articleNumber?: string; paragraphNumber?: string };
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
      const childPosition = isUrlAddressableArticle
        ? { articleNumber: node.number }
        : { articleNumber: undefined };

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
            <Heading className="min-w-0 font-law text-lg font-semibold text-foreground break-words">
              <LawTextWithRuby
                displayMode={displayMode}
                annotations={node.rubyAnnotations}
                text={displayTitle ?? ""}
              />
              {displayCaption === undefined ? null : (
                <span className="ml-2 text-base font-normal text-secondary-foreground">
                  <LawTextWithRuby
                    displayMode={displayMode}
                    annotations={node.rubyAnnotations}
                    text={displayCaption}
                  />
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
                linking,
                nodeById,
                position: childPosition,
                renderArticleActions,
              })
            ) : (
              <p
                data-law-node-id={node.id}
                className="indent-[1em] font-law leading-display font-medium text-foreground break-words"
              >
                {renderLinkedText(
                  displayText,
                  linking,
                  { articleNumber: node.number },
                  isUrlAddressableArticleContext,
                  node.rubyAnnotations,
                )}
              </p>
            )}
          </div>
        </article>
      );
    }

    case "Paragraph":
    case "Item":
    case "Subitem": {
      const parent = node.parentId === undefined ? undefined : nodeById.get(node.parentId);
      // 条直下の項だけ、本文中の参照リンクの着地先としてアンカーを持つ。
      // 附則・別表の中は条アンカーと同様に URL 到達可能でないため付けない。
      const paragraphId =
        node.type === "Paragraph" &&
        parent?.type === "Article" &&
        isUrlAddressableArticleContext &&
        parent.number !== undefined &&
        node.number !== undefined
          ? paragraphAnchorId(parent.number, node.number)
          : undefined;
      const marker =
        node.type === "Paragraph"
          ? (node.title ?? getArticleParagraphMarker(node, nodeById))
          : (node.title ?? node.number);
      const displayMarker = getDisplayInlineText(marker, displayMode);
      const displayCaption = getDisplayInlineText(node.caption, displayMode);
      // 見出し → 項番号の順に本文の先頭から取り除く。plainText はこの順で連結されており、
      // 見出しを残したままだと項番号の除去が空振りして番号が二重に出る。
      const bodyText = stripLeadingMarker(
        stripLeadingMarker(
          stripTrailingChildPlainTexts(getDisplayText(node, displayMode), children, displayMode),
          displayCaption,
        ),
        displayMarker,
      );
      // 条直下の項は、1行目を字下げして第1項・第2項以降の本文頭を揃える。
      const isArticleParagraph = node.type === "Paragraph" && parent?.type === "Article";
      const ownPosition = isArticleParagraph
        ? { articleNumber: parent.number, paragraphNumber: node.number }
        : position;
      const childPosition = isArticleParagraph
        ? { ...position, paragraphNumber: node.number }
        : position;

      return (
        <div
          id={paragraphId}
          className={cn(
            "grid gap-2",
            // アンカー着地時にヘッダへ潜り込まないよう、条と同じだけ余白を取る。
            paragraphId !== undefined && "scroll-mt-20",
            node.type === "Item" && "pl-5",
            node.type === "Subitem" && "pl-8",
          )}
        >
          {/* 項見出しは本文の上に独立した行で示す。条見出しと違い、見出しを添える
              条名の行が無いため（附則直下の項など）。 */}
          {displayCaption === undefined ? null : (
            <p className="font-law leading-display font-medium break-words text-secondary-foreground">
              <LawTextWithRuby
                displayMode={displayMode}
                annotations={node.rubyAnnotations}
                text={displayCaption}
              />
            </p>
          )}
          {isArticleParagraph ? (
            <p
              className={cn(
                "font-law leading-display font-medium break-words text-foreground",
                // 番号のない項は1行目を字下げ。番号のある項は番号欄（下の span）が字下げ幅を担う。
                // 折り返し行は行頭に戻す（天付き）ので、1行目だけが下がる伝統的な字下げになる。
                displayMarker === undefined && "indent-[1.5em]",
              )}
            >
              {displayMarker !== undefined ? (
                <span className="inline-block min-w-[1.5em] text-muted-foreground">
                  {displayMarker}
                </span>
              ) : null}
              <span data-law-node-id={node.id}>
                {renderLinkedText(
                  bodyText,
                  linking,
                  ownPosition,
                  isUrlAddressableArticleContext,
                  node.rubyAnnotations,
                )}
              </span>
            </p>
          ) : (
            <p className="flex min-w-0 gap-3 font-law leading-display font-medium text-foreground">
              {displayMarker !== undefined ? (
                <span className="shrink-0 text-muted-foreground">{displayMarker}</span>
              ) : null}
              {/* 前文など条直下でない項は、番号がなければ先頭1文字を字下げして体裁を整える。 */}
              <span
                data-law-node-id={node.id}
                className={cn("min-w-0 break-words", displayMarker === undefined && "indent-[1em]")}
              >
                {renderLinkedText(
                  bodyText,
                  linking,
                  ownPosition,
                  isUrlAddressableArticleContext,
                  node.rubyAnnotations,
                )}
              </span>
            </p>
          )}
          {renderChildBlocks({
            activeArticleNumber,
            children,
            depth,
            displayMode,
            isUrlAddressableArticleContext: childArticleContext,
            linking,
            nodeById,
            position: childPosition,
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
        <Heading className={cn("font-law text-foreground break-words", headingClassName)}>
          <LawTextWithRuby
            displayMode={displayMode}
            annotations={node.rubyAnnotations}
            text={displayTitle}
          />
        </Heading>
      ) : null}
      {bodyText !== "" ? (
        <p
          data-law-node-id={node.id}
          className="font-law leading-display font-medium text-foreground break-words"
        >
          {renderLinkedText(
            bodyText,
            linking,
            {},
            isUrlAddressableArticleContext,
            node.rubyAnnotations,
          )}
        </p>
      ) : null}
      {renderChildBlocks({
        activeArticleNumber,
        children,
        depth,
        displayMode,
        isUrlAddressableArticleContext: childArticleContext,
        linking,
        nodeById,
        position,
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
  linking,
  nodeById,
  position,
  renderArticleActions,
}: {
  activeArticleNumber: string | undefined;
  children: LawNode[];
  depth: number;
  displayMode: LawTextDisplayMode;
  isUrlAddressableArticleContext: boolean;
  linking: LinkingOptions;
  nodeById: Map<string, LawNode>;
  // 本文中の相対参照（前条・前項）の基準となる、この節点を含む条・項の番号。
  // 附則・別表の中では条アンカーが無いため undefined のまま伝える。
  position: { articleNumber?: string; paragraphNumber?: string };
  renderArticleActions: ((article: LawNode) => ReactNode) | undefined;
}) =>
  children.map((child) => (
    <LawNodeBlock
      key={child.id}
      activeArticleNumber={activeArticleNumber}
      depth={depth + 1}
      displayMode={displayMode}
      isUrlAddressableArticleContext={isUrlAddressableArticleContext}
      linking={linking}
      node={child}
      nodeById={nodeById}
      position={position}
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

interface LinkingOptions {
  articles: ArticleLinkContext["articles"];
  displayMode: LawTextDisplayMode;
  lawId: string;
  onSelectArticle: ((articleNumber: string) => void) | undefined;
}

// 表示文字列を参照リンク入りの ReactNode 列へ写す。
// リンクにならない部分もルビ復元は通すため、素の文字列ではなく LawTextWithRuby を返す。
// ルビは文字位置ではなく語の一致で付くので、リンクで分割したあとの断片にもそのまま適用できる。
// 分割の境界をまたぐ語だけはルビが落ちるが、ルビ対象語と条番号の参照が重なることは実質ない。
const renderLinkedText = (
  text: string,
  linking: LinkingOptions,
  position: { articleNumber?: string; paragraphNumber?: string },
  isUrlAddressableArticleContext: boolean,
  annotations: RubyAnnotation[] | undefined,
): ReactNode => {
  const plain = (
    <LawTextWithRuby annotations={annotations} displayMode={linking.displayMode} text={text} />
  );

  // 附則・別表の中の条番号は本則の条を指さないため、リンク化しない。
  if (text === "" || !isUrlAddressableArticleContext) {
    return plain;
  }

  const segments = segmentReferenceLinks(text, {
    articles: linking.articles,
    ...(position.articleNumber === undefined
      ? {}
      : { currentArticleNumber: position.articleNumber }),
    ...(position.paragraphNumber === undefined
      ? {}
      : { currentParagraphNumber: position.paragraphNumber }),
  });

  if (segments.every((segment) => segment.kind === "text")) {
    return plain;
  }

  return segments.map((segment, index) => (
    <ReferenceSegment
      key={`${String(index)}:${segment.text}`}
      annotations={annotations}
      linking={linking}
      segment={segment}
    />
  ));
};

const ReferenceSegment = ({
  annotations,
  linking,
  segment,
}: {
  annotations: RubyAnnotation[] | undefined;
  linking: LinkingOptions;
  segment: ReferenceLinkSegment;
}) => {
  const withRuby = (text: string) => (
    <LawTextWithRuby annotations={annotations} displayMode={linking.displayMode} text={text} />
  );

  if (segment.kind === "text") {
    return withRuby(segment.text);
  }

  const { caption, target, text } = segment;
  // 同じ条の中の項へはページ内リンク。条をまたぐときは条ルートへ遷移する。
  const isInPage = target.paragraphNumber !== undefined;
  const href = isInPage
    ? `#${paragraphAnchorId(target.articleNumber, target.paragraphNumber ?? "")}`
    : buildLawArticleUrl({ lawId: linking.lawId, article: target.articleNumber });
  // 見出しの注入は見やすい表示のときだけ。原文表示では原文にない文字を足さない。
  const showCaption = caption !== undefined && linking.displayMode === "readable";

  return (
    <a
      className="text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid"
      href={href}
      onClick={
        isInPage || linking.onSelectArticle === undefined
          ? undefined
          : (event) => {
              // 修飾キー付きクリックや中クリックは、新しいタブ・ウィンドウで開く
              // といったブラウザ標準のリンク操作を期待させるため横取りしない。
              // 素の左クリックのときだけ SPA 内遷移に差し替える。
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
              ) {
                return;
              }

              event.preventDefault();
              linking.onSelectArticle?.(target.articleNumber);
            }
      }
    >
      {withRuby(showCaption ? text.slice(0, caption.offset) : text)}
      {showCaption ? (
        <span className="text-secondary-foreground">〈{withRuby(caption.text)}〉</span>
      ) : null}
      {showCaption ? withRuby(text.slice(caption.offset)) : null}
    </a>
  );
};
