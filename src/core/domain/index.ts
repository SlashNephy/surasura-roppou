export type {
  Annotation,
  Bookmark,
  BoundingBox,
  CardSchedule,
  Collection,
  DetectedLawReference,
  HighlightColor,
  ISODateString,
  Law,
  LawNode,
  LawNodeType,
  LawReferenceCandidate,
  LawReferenceDetectionSource,
  LawRevision,
  OcrSession,
  QuizRating,
  ReviewLog,
  RubyAnnotation,
  StudyCard,
  StudyCardType,
  StudySession,
  TextQuoteAnchor,
} from "./models";
export { highlightColors } from "./models";
export { normalizeAnnotation } from "./annotation";
export type { ArticleReference, AnchoredArticleReference, LawReferenceTarget } from "./references";
export {
  buildArticleReferenceKey,
  buildLawArticleUrl,
  hasReferenceValue,
  normalizeArticleNumberForLookup,
  parseArticleReferenceKey,
} from "./references";
export { computeArticleFingerprint } from "./article-fingerprint";
