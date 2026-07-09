import { normalizeForSearch } from "./normalize";

export interface SearchSnippet {
  text: string;
  highlights: { start: number; end: number }[];
}

const defaultRadius = 40;
const ellipsis = "…";

// 正規化文字列上でマッチ位置を特定し、元テキストから前後 radius 文字を切り出す。
// 表示は常に元テキスト由来なので、正規化で文字数が変わっても崩れない。
export const buildSnippet = (
  text: string,
  query: string,
  options: { radius?: number } = {},
): SearchSnippet => {
  const radius = options.radius ?? defaultRadius;
  const { normalized, sourceIndex } = normalizeForSearch(text);
  const normalizedQuery = normalizeForSearch(query).normalized;

  // 正規化位置 n の文字が由来する元テキストの開始オフセット。
  const sourceStartAt = (position: number): number =>
    position < sourceIndex.length ? sourceIndex[position] : text.length;

  // 正規化区間 [.., position) の排他的終端に対応する元テキストのオフセット。
  // 1 つの元文字が複数の正規化文字へ展開される場合（例: ㍿→株式会社）、
  // 展開の途中で終わっても元文字全体を含むよう、最後の一致文字の元コードポイント末尾まで進める。
  const sourceEndAt = (position: number): number => {
    if (position <= 0) {
      return 0;
    }

    if (position > sourceIndex.length) {
      return text.length;
    }

    const lastSource = sourceIndex[position - 1];
    const codePoint = text.codePointAt(lastSource);
    const unitLength = codePoint !== undefined && codePoint > 0xffff ? 2 : 1;

    return Math.min(text.length, lastSource + unitLength);
  };

  const matchStarts = findMatches(normalized, normalizedQuery);

  if (matchStarts.length === 0) {
    const head = text.slice(0, radius * 2);

    return { text: head + (head.length < text.length ? ellipsis : ""), highlights: [] };
  }

  const firstMatch = matchStarts[0];
  const windowStart = Math.max(0, firstMatch - radius);
  const windowEnd = Math.min(normalized.length, firstMatch + normalizedQuery.length + radius);
  const sliceStart = sourceStartAt(windowStart);
  const sliceEnd = sourceEndAt(windowEnd);
  const prefix = windowStart > 0 ? ellipsis : "";
  const suffix = windowEnd < normalized.length ? ellipsis : "";
  const snippetText = prefix + text.slice(sliceStart, sliceEnd) + suffix;

  const highlights = matchStarts
    .filter(
      (matchStart) => matchStart >= windowStart && matchStart + normalizedQuery.length <= windowEnd,
    )
    .map((matchStart) => ({
      start: prefix.length + (sourceStartAt(matchStart) - sliceStart),
      end: prefix.length + (sourceEndAt(matchStart + normalizedQuery.length) - sliceStart),
    }));

  return { text: snippetText, highlights };
};

// 重なりを許して全マッチ開始位置を返す。
const findMatches = (haystack: string, needle: string): number[] => {
  if (needle === "") {
    return [];
  }

  const positions: number[] = [];
  let from = haystack.indexOf(needle);

  while (from !== -1) {
    positions.push(from);
    from = haystack.indexOf(needle, from + 1);
  }

  return positions;
};
