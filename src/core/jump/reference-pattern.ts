// 位置表現に使う数字（アラビア・全角・漢数字）。パーサーの数値解釈に合わせる。
const kanjiDigits = "一二三四五六七八九十百千";
const numberClass = `[0-9０-９${kanjiDigits}]+`;

// テキスト中の条文の位置表現を位置特定するパターンを組み立てる。先頭に必須トークン
// （条/項/号/別表/相対マーカー）を要求して空マッチを防ぎ、続く項・号・本文/ただし書は
// 任意で連結して 1 参照のスパンにする。抽出後の実際の解析は parseReference に委譲する。
//
// requiresDai は「第」を必須にするかを切り替える。OCR 検出は読み取り崩れや手入力の
// 「15条2項」も拾う必要があるため任意にし、本文のリンク化は誤リンクを避けるため必須にする。
// 「第」を任意にしたままだと「前二項」「前二条」の数字部分（二項・二条）が単独でマッチし、
// 現在の条の第2項や第2条という無関係な着地先へのリンクになってしまう。
const buildReferencePositionPatternSource = (requiresDai: boolean): string => {
  const dai = requiresDai ? "第" : "第?";

  return (
    `(?:別表第?${numberClass}|${dai}${numberClass}条(?:の${numberClass})*|前条|次条|${dai}${numberClass}項|前項|次項|${dai}${numberClass}号)` +
    `(?:${dai}${numberClass}項|前項|次項)?` +
    `(?:${dai}${numberClass}号)?` +
    `(?:本文|ただし書|但書)?`
  );
};

// OCR 検出（reference-detector）用。崩れた表記も拾うため「第」は任意。
export const referencePositionPatternSource = buildReferencePositionPatternSource(false);

// 本文のリンク化（core/viewer）用。実際の法令文は必ず「第二項」と書き裸の「二項」は
// 書かないため、「第」を必須にして「前二項」「前二条」の部分マッチを防ぐ。
export const bodyReferencePositionPatternSource = buildReferencePositionPatternSource(true);

// 位置表現の先頭が条を指す部分の長さを測るためのパターン。
// 見出し〈 〉をリンク文字列のどこへ差し込むかの決定に使う。
export const referenceArticleSpanPattern = new RegExp(
  `^(?:第?${numberClass}条(?:の${numberClass})*|前条|次条)`,
);
