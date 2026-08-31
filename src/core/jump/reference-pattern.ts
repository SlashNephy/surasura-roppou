// 位置表現に使う数字（アラビア・全角・漢数字）。パーサーの数値解釈に合わせる。
const kanjiDigits = "一二三四五六七八九十百千";
const numberClass = `[0-9０-９${kanjiDigits}]+`;

interface ReferencePositionPatternOptions {
  // 「第」を必須にするか。OCR 検出は読み取り崩れや手入力の「15条2項」も拾う必要が
  // あるため任意にし、本文のリンク化は誤リンクを避けるため必須にする。
  // 「第」を任意にしたままだと「前二項」「前二条」の数字部分（二項・二条）が単独で
  // マッチし、現在の条の第2項や第2条という無関係な着地先へのリンクになってしまう。
  requiresDai: boolean;
  // 編・章（見出し）の位置表現を含めるか。編・章の着地先は本文のリンク化にしかない
  // ため、OCR 検出では含めない（「2編」のような裸マッチが増えるだけ）。
  includesHeading: boolean;
  // 同法・同条・同項・同号を含めるか。先行詞が要るため、1 参照だけを見る
  // OCR 検出では解決できず、含めない。
  includesSameMarkers: boolean;
}

// テキスト中の条文の位置表現を位置特定するパターンを組み立てる。先頭に必須トークン
// （条/項/号/別表/相対マーカー）を要求して空マッチを防ぎ、続く項・号・本文/ただし書は
// 任意で連結して 1 参照のスパンにする。抽出後の実際の解析は parseReference に委譲する。
const buildReferencePositionPatternSource = ({
  includesHeading,
  includesSameMarkers,
  requiresDai,
}: ReferencePositionPatternOptions): string => {
  const dai = requiresDai ? "第" : "第?";

  const article =
    `(?:別表第?${numberClass}|${dai}${numberClass}条(?:の${numberClass})*|前条|次条|${dai}${numberClass}項|前項|次項|${dai}${numberClass}号)` +
    `(?:${dai}${numberClass}項|前項|次項)?` +
    `(?:${dai}${numberClass}号)?` +
    `(?:本文|ただし書|但書)?`;

  // 同法・同条・同項・同号。「同条第4項」を分割せず 1 スパンにする。分割すると
  // 後半の「第4項」が現在の条の項として誤解決される。
  const same =
    `(?:同法|同条|同項|同号)` +
    `(?:${dai}${numberClass}条(?:の${numberClass})*)?` +
    `(?:${dai}${numberClass}項)?` +
    `(?:${dai}${numberClass}号)?` +
    `(?:本文|ただし書|但書)?`;

  const sameMarkers = includesSameMarkers ? [same] : [];

  if (!includesHeading) {
    return `(?:${[...sameMarkers, article].join("|")})`;
  }

  // 編・章。「第四編第二章」や「第四編第二章第七百二十五条」を分割せず 1 スパンにする。
  // 分割すると、内部の「編」が後続「第二章」の直前ガード文字（precedingGuardChars）に
  // 引っかかり、自分自身でリンク化を抑止してしまう。
  const part = `(?:${dai}${numberClass}編|前編|次編)`;
  const chapter = `(?:${dai}${numberClass}章|前章|次章)`;
  const heading = `(?:${part}${chapter}?|${chapter})`;

  return `(?:${[...sameMarkers, `${heading}(?:${article})?`, article].join("|")})`;
};

// OCR 検出（reference-detector）用。崩れた表記も拾うため「第」は任意。
export const referencePositionPatternSource = buildReferencePositionPatternSource({
  requiresDai: false,
  includesHeading: false,
  includesSameMarkers: false,
});

// 本文のリンク化（core/viewer）用。実際の法令文は必ず「第二項」と書き裸の「二項」は
// 書かないため、「第」を必須にして「前二項」「前二条」の部分マッチを防ぐ。
export const bodyReferencePositionPatternSource = buildReferencePositionPatternSource({
  requiresDai: true,
  includesHeading: true,
  includesSameMarkers: true,
});

// 位置表現の先頭が条を指す部分の長さを測るためのパターン。
// 見出し〈 〉をリンク文字列のどこへ差し込むかの決定に使う。
export const referenceArticleSpanPattern = new RegExp(
  `^(?:第?${numberClass}条(?:の${numberClass})*|前条|次条)`,
);
