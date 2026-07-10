export interface LawReferenceTarget {
  lawId: string;
  revisionId?: string | null;
  article?: string | null;
  paragraph?: string | null;
  item?: string | null;
  path?: string | null;
  // 追加: 条文指紋（改変検知）。#20 由来の未アンカー参照は持たない。
  fingerprint?: string | null;
  // 追加: true なら基準日でなく revisionId で解決し、バッジを常設する。
  pinned?: boolean | null;
}

export interface ArticleReference extends LawReferenceTarget {
  article: string;
}

// 保存物（ブックマーク等）のアンカーが満たす制約。revisionId と fingerprint を必須にする。
export interface AnchoredArticleReference extends ArticleReference {
  revisionId: string;
  fingerprint: string;
}

const segmentKinds = ["law", "revision", "article", "paragraph", "item"] as const;

type ReferenceSegmentKind = (typeof segmentKinds)[number];

type ReferenceSegments = Partial<Record<ReferenceSegmentKind, string>>;

export const buildArticleReferenceKey = (reference: LawReferenceTarget): string => {
  const segments = [`law:${encodeReferenceSegment(reference.lawId)}`];

  if (hasReferenceValue(reference.revisionId)) {
    segments.push(`revision:${encodeReferenceSegment(reference.revisionId)}`);
  }

  if (!hasReferenceValue(reference.article)) {
    return segments.join("/");
  }

  segments.push(`article:${encodeReferenceSegment(reference.article)}`);

  if (hasReferenceValue(reference.paragraph)) {
    segments.push(`paragraph:${encodeReferenceSegment(reference.paragraph)}`);
  }

  if (hasReferenceValue(reference.item)) {
    segments.push(`item:${encodeReferenceSegment(reference.item)}`);
  }

  return segments.join("/");
};

export const buildLawArticleUrl = (reference: LawReferenceTarget): string => {
  const lawPath = hasReferenceValue(reference.revisionId)
    ? `/laws/${encodeURIComponent(reference.lawId)}/${encodeURIComponent(reference.revisionId)}`
    : `/laws/${encodeURIComponent(reference.lawId)}`;

  if (!hasReferenceValue(reference.article)) {
    return lawPath;
  }

  const params = new URLSearchParams();

  if (hasReferenceValue(reference.paragraph)) {
    params.set("paragraph", reference.paragraph);
  }

  if (hasReferenceValue(reference.item)) {
    params.set("item", reference.item);
  }

  const query = params.toString();
  const articlePath = `${lawPath}/articles/${encodeURIComponent(reference.article)}`;

  return query === "" ? articlePath : `${articlePath}?${query}`;
};

export const parseArticleReferenceKey = (key: string): LawReferenceTarget | undefined => {
  const segments = parseSegments(key);

  if (segments?.law === undefined) {
    return undefined;
  }

  if (
    segments.article === undefined &&
    (segments.paragraph !== undefined || segments.item !== undefined)
  ) {
    return undefined;
  }

  return {
    lawId: segments.law,
    ...(segments.revision === undefined ? {} : { revisionId: segments.revision }),
    article: segments.article,
    ...(segments.paragraph === undefined ? {} : { paragraph: segments.paragraph }),
    ...(segments.item === undefined ? {} : { item: segments.item }),
  };
};

const parseSegments = (key: string): ReferenceSegments | undefined => {
  const rawSegments = key.split("/");
  const parsed: ReferenceSegments = {};
  let previousIndex = -1;

  for (const rawSegment of rawSegments) {
    const separatorIndex = rawSegment.indexOf(":");

    if (separatorIndex <= 0 || separatorIndex !== rawSegment.lastIndexOf(":")) {
      return undefined;
    }

    const rawKind = rawSegment.slice(0, separatorIndex);
    const rawValue = rawSegment.slice(separatorIndex + 1);
    const kind = parseSegmentKind(rawKind);

    if (kind === undefined || rawValue === "") {
      return undefined;
    }

    const currentIndex = segmentKinds.indexOf(kind);

    // The key is intentionally ordered so string sorting and visual inspection stay predictable.
    if (currentIndex <= previousIndex || parsed[kind] !== undefined) {
      return undefined;
    }

    const decodedValue = decodeReferenceSegment(rawValue);

    if (decodedValue === undefined) {
      return undefined;
    }

    parsed[kind] = decodedValue;
    previousIndex = currentIndex;
  }

  return parsed;
};

const parseSegmentKind = (kind: string): ReferenceSegmentKind | undefined => {
  return segmentKinds.find((segmentKind) => segmentKind === kind);
};

const encodeReferenceSegment = (value: string): string => {
  return encodeURIComponent(value);
};

const decodeReferenceSegment = (value: string): string | undefined => {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

const hasReferenceValue = (value: string | null | undefined): value is string => {
  return value !== undefined && value !== null && value !== "";
};
