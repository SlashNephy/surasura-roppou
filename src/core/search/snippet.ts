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

  // 元テキストのオフセット（source は UTF-16 offset なので、末尾は text.length を使う）
  const sourceAt = (normalizedPosition: number): number =>
    normalizedPosition < sourceIndex.length ? sourceIndex[normalizedPosition] : text.length;

  const matchStarts = findMatches(normalized, normalizedQuery);

  if (matchStarts.length === 0) {
    const head = text.slice(0, radius * 2);

    return { text: head + (head.length < text.length ? ellipsis : ""), highlights: [] };
  }

  const firstMatch = matchStarts[0];
  const windowStart = Math.max(0, firstMatch - radius);
  const windowEnd = Math.min(normalized.length, firstMatch + normalizedQuery.length + radius);
  const sliceStart = sourceAt(windowStart);
  const sliceEnd = sourceAt(windowEnd);
  const prefix = windowStart > 0 ? ellipsis : "";
  const suffix = windowEnd < normalized.length ? ellipsis : "";
  const snippetText = prefix + text.slice(sliceStart, sliceEnd) + suffix;

  const highlights = matchStarts
    .filter((matchStart) => matchStart >= windowStart && matchStart + normalizedQuery.length <= windowEnd)
    .map((matchStart) => ({
      start: prefix.length + (sourceAt(matchStart) - sliceStart),
      end: prefix.length + (sourceAt(matchStart + normalizedQuery.length) - sliceStart),
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
