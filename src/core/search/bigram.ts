// 正規化済み文字列から、重複を除いた 2-gram の集合を作る。
// 索引時はノードごとの bigram 集合、検索時はクエリの bigram 集合として使う。
export const toBigrams = (normalized: string): Set<string> => {
  const bigrams = new Set<string>();
  // コードポイント単位で分割する（CJK の表意文字や補助面文字を 1 要素として扱う）。
  // Array.from は文字列イテレータ（コードポイント単位）で分割し、スプレッドと挙動は同じ。
  const characters = Array.from(normalized);

  for (let index = 0; index + 1 < characters.length; index += 1) {
    bigrams.add(characters[index] + characters[index + 1]);
  }

  return bigrams;
};
