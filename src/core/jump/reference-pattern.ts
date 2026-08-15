// 位置表現に使う数字（アラビア・全角・漢数字）。パーサーの数値解釈に合わせる。
const kanjiDigits = "一二三四五六七八九十百千";
const numberClass = `[0-9０-９${kanjiDigits}]+`;

// テキスト中の条文の位置表現を位置特定するパターン。先頭に必須トークン
// （条/項/号/別表/相対マーカー）を要求して空マッチを防ぎ、続く項・号・本文/ただし書は
// 任意で連結して 1 参照のスパンにする。抽出後の実際の解析は parseReference に委譲する。
// OCR 検出（reference-detector）と本文のリンク化（core/viewer）が共有する。
export const referencePositionPatternSource =
  `(?:別表第?${numberClass}|第?${numberClass}条(?:の${numberClass})*|前条|次条|第?${numberClass}項|前項|次項|第?${numberClass}号)` +
  `(?:第?${numberClass}項|前項|次項)?` +
  `(?:第?${numberClass}号)?` +
  `(?:本文|ただし書|但書)?`;

// 位置表現の先頭が条を指す部分の長さを測るためのパターン。
// 見出し〈 〉をリンク文字列のどこへ差し込むかの決定に使う。
export const referenceArticleSpanPattern = new RegExp(
  `^(?:第?${numberClass}条(?:の${numberClass})*|前条|次条)`,
);
