import { normalizeForSearch } from "@/core/search";
import { toArabicNumber } from "@/shared/utils/readability";

import { createAliasResolver, type AliasResolver } from "./alias-resolver";

// 参照が法令名を伴う絶対参照か、文脈依存の相対参照か。
export type ReferenceKind = "absolute" | "relative";

// 本文 / ただし書 の位置指定。
export type ReferenceSentence = "main" | "proviso";

export interface ParsedReference {
  kind: ReferenceKind;
  lawNameCandidate?: string; // 正式名称っぽい原文（official 一致 or 辞書外の推定名）
  lawAlias?: string; // 略称の原文（alias 一致）
  article?: string; // "1" / "242-2" / "previous" / "next"
  paragraph?: string; // "1" / "previous" / "next"
  item?: string; // "1"
  sentence?: ReferenceSentence;
  appendix?: string; // 別表番号
  score: number; // 0..1 の決定的スコア
}

export interface ParseReferenceOptions {
  // official / alias 分類に使う resolver。既定は組込辞書のみ。
  resolver?: AliasResolver;
}

// 組込辞書だけの resolver を一度だけ構築して共有する。
const defaultResolver = createAliasResolver();

// 漢数字 1 文字群。境界検出・数値トークン抽出で共有する。
const kanjiDigits = "一二三四五六七八九十百千";

// 法令名部の直後で位置部（条・項・号や相対マーカー）が始まる位置を検出する。
// 単字マーカー（本・別・前・次・同・た・但）が法令名（例: 日本国憲法 の「本」）へ
// 誤反応しないよう、複数文字マーカーは語として並べる。
const positionStartPattern = new RegExp(
  `[0-9${kanjiDigits}]|第|前[条項]|次[条項]|同[法条項]|本文|別表|ただし書|但書`,
);

interface NumberToken {
  value: string; // アラビア表記の文字列
  kanji: boolean; // 漢数字由来か（スコア減点の判定に使う）
  len: number; // 消費した元トークンの長さ
}

const numberTokenPattern = new RegExp(`^(\\d+|[${kanjiDigits}]+)`);

// 先頭の数値トークン（アラビアまたは漢数字）を 1 つ読む。
const readNumber = (text: string): NumberToken | undefined => {
  const match = numberTokenPattern.exec(text);

  if (match === null) {
    return undefined;
  }

  const token = match[1];

  if (/^\d+$/.test(token)) {
    // アラビア数字はゼロ埋めを畳んで正準化する（"01" → "1"）。
    return { value: String(Number.parseInt(token, 10)), kanji: false, len: token.length };
  }

  const arabic = toArabicNumber(token);

  return arabic === undefined
    ? undefined
    : { value: String(arabic), kanji: true, len: token.length };
};

const romanValues = new Map([
  ["i", 1],
  ["v", 5],
  ["x", 10],
  ["l", 50],
  ["c", 100],
]);

// 小文字ローマ数字（NFKC + 小文字化で "Ⅰ" → "i" 等）をアラビア数値へ。
// 項番号用途のため通常の減算則で十分。妥当でなければ undefined。
const romanToArabic = (text: string): number | undefined => {
  if (text === "" || !/^[ivxlc]+$/.test(text)) {
    return undefined;
  }

  let total = 0;
  let previous = 0;

  for (let index = text.length - 1; index >= 0; index -= 1) {
    const current = romanValues.get(text[index]) ?? 0;

    if (current < previous) {
      total -= current; // 減算則（iv = 4 等）
    } else {
      total += current;
      previous = current;
    }
  }

  return total;
};

interface ParsePart {
  value: string;
  kanji: boolean;
  rest: string;
}

const stripDai = (text: string): string => (text.startsWith("第") ? text.slice(1) : text);

// 第?<num>条 (の<num>)* を条番号として読む。枝番はハイフン連結。
const readArticle = (text: string): ParsePart | undefined => {
  const body = stripDai(text);
  const head = readNumber(body);

  if (head === undefined) {
    return undefined;
  }

  let rest = body.slice(head.len);

  if (!rest.startsWith("条")) {
    return undefined; // 条を伴わない数値は条省略形として別処理する
  }

  rest = rest.slice(1);
  let value = head.value;
  let kanji = head.kanji;

  while (rest.startsWith("の")) {
    const branch = readNumber(rest.slice(1));

    if (branch === undefined) {
      break;
    }

    value += `-${branch.value}`;
    kanji ||= branch.kanji;
    rest = rest.slice(1 + branch.len);
  }

  return { value, kanji, rest };
};

// 条を伴わない先頭数値を条番号とみなす（法令名がある場合のみ呼ばれる）。
// 直後が 項/号 のときは項・号として扱うべきなので条にしない。
const readBareArticle = (text: string): ParsePart | undefined => {
  const body = stripDai(text);
  const head = readNumber(body);

  if (head === undefined) {
    return undefined;
  }

  const rest = body.slice(head.len);

  if (rest.startsWith("項") || rest.startsWith("号")) {
    return undefined;
  }

  return { value: head.value, kanji: head.kanji, rest };
};

// 第?<num>（項|号）を読む共通処理。
const readSuffixNumber = (text: string, suffix: string): ParsePart | undefined => {
  const body = stripDai(text);
  const head = readNumber(body);

  if (head === undefined) {
    return undefined;
  }

  const rest = body.slice(head.len);

  if (!rest.startsWith(suffix)) {
    return undefined;
  }

  return { value: head.value, kanji: head.kanji, rest: rest.slice(suffix.length) };
};

// 別表第?<num> を読む。
const readAppendix = (text: string): ParsePart | undefined => {
  if (!text.startsWith("別表")) {
    return undefined;
  }

  const afterLabel = stripDai(text.slice(2));
  const head = readNumber(afterLabel);

  if (head === undefined) {
    return undefined;
  }

  return { value: head.value, kanji: head.kanji, rest: afterLabel.slice(head.len) };
};

interface ScoreInput {
  kind: ReferenceKind;
  lawMatchKind: "official" | "alias" | "unknown" | "none";
  article?: string;
  paragraph?: string;
  item?: string;
  sentence?: ReferenceSentence;
  appendix?: string;
  usedKanji: boolean;
}

// 相対シフト（previous/next）でない具体的な番号か。
const isConcrete = (value: string | undefined): boolean =>
  value !== undefined && value !== "previous" && value !== "next";

const clampScore = (score: number): number => Math.min(1, Math.max(0, score));

// design-doc 11.3 の信号のうち、パーサー単体で判定できるものを決定的に加減点する。
// 外部信号（編集距離・OCR confidence・履歴）は後続 #24/#37 が上位で加える。
const scoreReference = (input: ScoreInput): number => {
  let score: number;

  if (input.kind === "absolute") {
    score = input.lawMatchKind === "official" ? 0.55 : input.lawMatchKind === "alias" ? 0.45 : 0.35;

    if (isConcrete(input.article)) {
      score += 0.35;
    }
  } else {
    score = 0.4;

    if (isConcrete(input.article)) {
      score += 0.1;
    }
  }

  if (isConcrete(input.paragraph)) {
    score += 0.05;
  }

  if (input.item !== undefined) {
    score += 0.05;
  }

  if (input.sentence !== undefined) {
    score += 0.02;
  }

  if (input.appendix !== undefined) {
    score += 0.05;
  }

  if (input.usedKanji) {
    // 漢数字は OCR・手入力で誤変換しやすいぶん、わずかに下げる。
    score -= 0.05;
  }

  return clampScore(score);
};

export const parseReference = (
  input: string,
  options: ParseReferenceOptions = {},
): ParsedReference | undefined => {
  const resolver = options.resolver ?? defaultResolver;
  const { normalized } = normalizeForSearch(input);

  if (normalized === "") {
    return undefined;
  }

  // 法令名部と位置部の境界を探す。
  const boundaryMatch = positionStartPattern.exec(normalized);
  const boundary = boundaryMatch === null ? normalized.length : boundaryMatch.index;
  const lawToken = normalized.slice(0, boundary);
  let position = normalized.slice(boundary);

  // --- 法令名の分類（lawId は載せない） ---
  let lawNameCandidate: string | undefined;
  let lawAlias: string | undefined;
  let lawMatchKind: ScoreInput["lawMatchKind"] = "none";

  if (lawToken !== "") {
    const candidates = resolver.resolve(lawToken);
    const official = candidates.find((candidate) => candidate.matchKind === "official");
    const alias = candidates.find((candidate) => candidate.matchKind === "alias");

    if (official !== undefined) {
      lawNameCandidate = official.matchedText;
      lawMatchKind = "official";
    } else if (alias !== undefined) {
      lawAlias = alias.matchedText;
      lawMatchKind = "alias";
    } else {
      // 辞書外。原文トークンをそのまま候補にする（best-effort、低スコア）。
      lawNameCandidate = lawToken;
      lawMatchKind = "unknown";
    }
  }

  const hasLaw = lawNameCandidate !== undefined || lawAlias !== undefined;

  // --- 位置部の解析 ---
  let article: string | undefined;
  let paragraph: string | undefined;
  let item: string | undefined;
  let sentence: ReferenceSentence | undefined;
  let appendix: string | undefined;
  let usedKanji = false;

  // 相対の条マーカー。同法・同条 は「現在位置」= シフトなしで消費する。
  if (position.startsWith("前条")) {
    article = "previous";
    position = position.slice(2);
  } else if (position.startsWith("次条")) {
    article = "next";
    position = position.slice(2);
  } else if (position.startsWith("同条") || position.startsWith("同法")) {
    position = position.slice(2);
  }

  // 相対の項マーカー。同項 は消費のみ。
  if (position.startsWith("前項")) {
    paragraph = "previous";
    position = position.slice(2);
  } else if (position.startsWith("次項")) {
    paragraph = "next";
    position = position.slice(2);
  } else if (position.startsWith("同項")) {
    position = position.slice(2);
  }

  const appendixPart = readAppendix(position);

  if (appendixPart !== undefined) {
    appendix = appendixPart.value;
    usedKanji ||= appendixPart.kanji;
    position = appendixPart.rest;
  }

  const articlePart = readArticle(position);

  if (articlePart !== undefined) {
    article = articlePart.value;
    usedKanji ||= articlePart.kanji;
    position = articlePart.rest;
  } else if (article === undefined && hasLaw) {
    // 条省略形（民709 / 国賠1 / 憲21Ⅰ の 21）。
    const barePart = readBareArticle(position);

    if (barePart !== undefined) {
      article = barePart.value;
      usedKanji ||= barePart.kanji;
      position = barePart.rest;
    }
  }

  const paragraphPart = readSuffixNumber(position, "項");

  if (paragraph === undefined && paragraphPart !== undefined) {
    paragraph = paragraphPart.value;
    usedKanji ||= paragraphPart.kanji;
    position = paragraphPart.rest;
  } else if (paragraph === undefined && article !== undefined) {
    // 憲21Ⅰ: 条番号直後のローマ数字を項とみなす。
    const roman = romanToArabic(position);

    if (roman !== undefined) {
      paragraph = String(roman);
      position = "";
    }
  }

  const itemPart = readSuffixNumber(position, "号");

  if (itemPart !== undefined) {
    item = itemPart.value;
    usedKanji ||= itemPart.kanji;
    position = itemPart.rest;
  }

  // 本文 / ただし書（単独または末尾）。position の残余は以降で不使用のため消費しない。
  if (position.startsWith("本文")) {
    sentence = "main";
  } else if (position.startsWith("ただし書")) {
    sentence = "proviso";
  } else if (position.startsWith("但書")) {
    sentence = "proviso";
  }

  const hasPosition =
    article !== undefined ||
    paragraph !== undefined ||
    item !== undefined ||
    sentence !== undefined ||
    appendix !== undefined;

  // 法令も位置指定も無い（同法だけ等）、または辞書外の法令名で位置指定も無い入力は、
  // 参照として弱すぎるため不成立にする（エラーにはしない）。
  if (!hasPosition && (!hasLaw || lawMatchKind === "unknown")) {
    return undefined;
  }

  const kind: ReferenceKind = hasLaw ? "absolute" : "relative";
  const score = scoreReference({
    kind,
    lawMatchKind,
    article,
    paragraph,
    item,
    sentence,
    appendix,
    usedKanji,
  });

  return {
    kind,
    ...(lawNameCandidate === undefined ? {} : { lawNameCandidate }),
    ...(lawAlias === undefined ? {} : { lawAlias }),
    ...(article === undefined ? {} : { article }),
    ...(paragraph === undefined ? {} : { paragraph }),
    ...(item === undefined ? {} : { item }),
    ...(sentence === undefined ? {} : { sentence }),
    ...(appendix === undefined ? {} : { appendix }),
    score,
  };
};
