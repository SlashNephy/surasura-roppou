export { LawDocumentView } from "./LawDocumentView";
export { LawNodeList } from "./LawNodeList";
export { LawTableOfContents } from "./LawTableOfContents";
export { buildArticleCopyText } from "./article-copy";
export { articleAnchorId, buildLawTableOfContents, paragraphAnchorId } from "./lawToc";
export { applyLawTextDisplayMode } from "./displayMode";
export type { LawTextDisplayMode } from "./displayMode";
export { formatLawTypeLabel } from "./lawType";
export type { LawTocItem } from "./lawToc";
export { findArticleNode, verifyAnchor } from "./anchor-verification";
export type { AnchorStatus } from "./anchor-verification";
export { pinAnchor, repathAnchor } from "./anchor-repair";
export { buildArticleLinkEntries, segmentReferenceLinks } from "./reference-links";
export type {
  ArticleLinkContext,
  ArticleLinkEntry,
  ArticleLinkTarget,
  ReferenceLinkCaption,
  ReferenceLinkSegment,
} from "./reference-links";
export { alignTexts, toDisplayRange, toSourceOffset } from "./text-alignment";
export type { AlignmentSegment, TextAlignment } from "./text-alignment";
export { createTextQuoteAnchor, findAnchorNode, resolveTextQuoteAnchor } from "./text-anchor";
export { applyHighlight } from "./highlight-merge";
export type { CreatedHighlightRange, HighlightRange } from "./highlight-merge";
export { isHighlightSupported } from "./highlight-support";
export { caretPositionAt } from "./caret-position";
export {
  collectDisplayTextNodes,
  createNodeTextRange,
  displayTextOf,
  findLawNodeElement,
  lawNodeIdAttribute,
  resolveNodeTextRange,
} from "./selection-range";
export type { NodeTextRange } from "./selection-range";
export { clearHighlights, highlightNameByColor, paintHighlights } from "./highlight-registry";
export type { HighlightRegistryLike, PaintedRange } from "./highlight-registry";
