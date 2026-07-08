// 索引・照合・snippet が共有する正規化結果。
// normalized[i] は元テキストの UTF-16 オフセット sourceIndex[i] 由来。
export interface NormalizedText {
  normalized: string;
  sourceIndex: number[];
}

const whitespacePattern = /\s/;

// NFKC で全角半角と互換文字をそろえ、英字は小文字化し、空白は落とす。
// 文字数が変わっても、各正規化文字が元テキストの何文字目由来かを sourceIndex に残す。
// 前提: 入力は合成済み（NFC）とする。元テキストへのオフセット対応を保つため、
// 正規化はコードポイント単位で行い、複数コードポイントにまたがる正準合成は行わない。
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

      // 補助面（サロゲートペア）の文字も UTF-16 単位ごとに 1 エントリ入れ、
      // sourceIndex.length === normalized.length を保つ。
      // for-of は文字列をコードポイント単位で反復してサロゲートペアを 1 要素に
      // 束ねてしまい、この UTF-16 単位のオフセット契約を壊すため添字ループを使う。
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let unitIndex = 0; unitIndex < character.length; unitIndex += 1) {
        characters.push(character[unitIndex]);
        sourceIndex.push(offset);
      }
    }

    offset += codePoint.length;
  }

  return { normalized: characters.join(""), sourceIndex };
};
