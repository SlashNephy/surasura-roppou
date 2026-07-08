// 索引・照合・snippet が共有する正規化結果。
// normalized[i] は元テキストの UTF-16 オフセット sourceIndex[i] 由来。
export interface NormalizedText {
  normalized: string;
  sourceIndex: number[];
}

const whitespacePattern = /\s/;

// NFKC で全角半角と互換文字をそろえ、英字は小文字化し、空白は落とす。
// 文字数が変わっても、各正規化文字が元テキストの何文字目由来かを sourceIndex に残す。
export const normalizeForSearch = (text: string): NormalizedText => {
  const characters: string[] = [];
  const sourceIndex: number[] = [];
  let offset = 0;

  for (const codePoint of text) {
    const folded = codePoint.normalize("NFKC").toLowerCase();

    for (const character of folded) {
      if (whitespacePattern.test(character)) {
        continue;
      }

      characters.push(character);
      sourceIndex.push(offset);
    }

    offset += codePoint.length;
  }

  return { normalized: characters.join(""), sourceIndex };
};
