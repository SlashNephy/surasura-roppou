import type { Annotation, HighlightColor, TextQuoteAnchor } from "./models";
import { highlightColors } from "./models";
import type { LawReferenceTarget } from "./references";

// v2 エクスポート由来のレコードは anchors を持たない。読み出し境界で吸収する。
interface LegacyAnnotationFields {
  targetText?: unknown;
  prefixText?: unknown;
  suffixText?: unknown;
}

const isHighlightColor = (value: unknown): value is HighlightColor =>
  typeof value === "string" && (highlightColors as readonly string[]).includes(value);

const isTarget = (value: unknown): value is LawReferenceTarget =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { lawId?: unknown }).lawId === "string";

const isAnchor = (value: unknown): value is TextQuoteAnchor =>
  typeof value === "object" &&
  value !== null &&
  isTarget((value as { target?: unknown }).target) &&
  typeof (value as { quote?: unknown }).quote === "string" &&
  typeof (value as { prefix?: unknown }).prefix === "string" &&
  typeof (value as { suffix?: unknown }).suffix === "string";

const toAnchors = (
  record: { anchors?: unknown } & LegacyAnnotationFields,
  target: LawReferenceTarget,
): TextQuoteAnchor[] => {
  if (Array.isArray(record.anchors)) {
    return record.anchors.filter(isAnchor);
  }

  if (typeof record.targetText !== "string" || record.targetText === "") {
    return [];
  }

  return [
    {
      target,
      quote: record.targetText,
      prefix: typeof record.prefixText === "string" ? record.prefixText : "",
      suffix: typeof record.suffixText === "string" ? record.suffixText : "",
    },
  ];
};

// 壊れたレコードは undefined を返して呼び出し側で捨てる。例外にすると
// 1件の破損で法令全体のハイライトが読めなくなるため、可用性を優先する。
export const normalizeAnnotation = (record: unknown): Annotation | undefined => {
  if (typeof record !== "object" || record === null) {
    return undefined;
  }

  const candidate = record as Record<string, unknown> & LegacyAnnotationFields;

  if (typeof candidate.id !== "string" || !isTarget(candidate.target)) {
    return undefined;
  }

  const color = isHighlightColor(candidate.color) ? candidate.color : undefined;

  return {
    id: candidate.id,
    target: candidate.target,
    anchors: toAnchors(candidate, candidate.target),
    ...(color === undefined ? {} : { color }),
    ...(typeof candidate.note === "string" ? { note: candidate.note } : {}),
    tags: Array.isArray(candidate.tags)
      ? candidate.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
  };
};
