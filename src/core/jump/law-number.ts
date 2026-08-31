import { toArabicNumber } from "@/shared/utils/readability";

// 法令番号の元号。e-Gov API の law_num_era と同じ表記に揃える。
export type LawNumberEra = "Meiji" | "Taisho" | "Showa" | "Heisei" | "Reiwa";

export interface ParsedLawNumber {
  era: LawNumberEra;
  year: number; // 元年は 1
  type: string; // 原文の種別語（法律・政令・省令 …）
  number: number;
}

const eraByLabel = new Map<string, LawNumberEra>([
  ["明治", "Meiji"],
  ["大正", "Taisho"],
  ["昭和", "Showa"],
  ["平成", "Heisei"],
  ["令和", "Reiwa"],
]);

// 数字は漢数字・算用数字・全角数字のいずれも受ける。見やすい表示（readable）は
// 法令番号のうち法律だけを算用数字へ変換するため、同じ文書でも法律は算用数字、
// 政令は漢数字のまま現れる。
const numberClass = "[0-9０-９一二三四五六七八九十百千]+";

// 種別語（法律・政令・大蔵省令・太政官布告 …）は列挙しきれないため、
// 「元号＋年」と「第…号」に挟まれた区切り文字以外の連続として読む。
const typeClass = "[^\\s、。（）()「」]{1,12}?";

const lawNumberPattern = new RegExp(
  `^(${[...eraByLabel.keys()].join("|")})(${numberClass}|元)年(${typeClass})第(${numberClass})号`,
);

// 漢数字・全角数字・算用数字のいずれの表記でも数値へ落とす。
const toNumber = (token: string): number | undefined => {
  const normalized = token.normalize("NFKC");

  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }

  return toArabicNumber(normalized);
};

// 文字列の先頭にある法令番号を読む。「平成十一年法律第百五十六号。以下…」のように
// 後続の文がある括弧書きも読めるよう、末尾は固定しない。
export const parseLawNumber = (text: string): ParsedLawNumber | undefined => {
  const match = lawNumberPattern.exec(text);

  if (match === null) {
    return undefined;
  }

  const era = eraByLabel.get(match[1]);
  const year = match[2] === "元" ? 1 : toNumber(match[2]);
  const number = toNumber(match[4]);

  if (era === undefined || year === undefined || number === undefined) {
    return undefined;
  }

  if (year < 1 || number < 1) {
    return undefined;
  }

  return { era, year, type: match[3], number };
};

const eraCodes: Record<LawNumberEra, string> = {
  Meiji: "1",
  Taisho: "2",
  Showa: "3",
  Heisei: "4",
  Reiwa: "5",
};

// lawId から法令番号を復元できる（＝法令番号から lawId を導出できる）のは政令だけ。
// 法律の lawId は提出区分を含み（閣法 00 / 衆法 10 / 参法 01）、法令番号からは決まらない。
// 省令・府令の種別コードは省庁コードを含むため、これも導出できない。
// e-Gov の全 2420 件で検証済み（docs/superpowers/specs/20260831_他法令参照リンク.md）。
const derivableTypeCodes = new Map([["政令", "CO"]]);

export const deriveLawIdFromLawNumber = (parsed: ParsedLawNumber): string | undefined => {
  const typeCode = derivableTypeCodes.get(parsed.type);

  if (typeCode === undefined) {
    return undefined;
  }

  // parseLawNumber を経由しない呼び出しにも備え、下限（1 以上の整数）も検証する。
  if (
    !Number.isInteger(parsed.year) ||
    !Number.isInteger(parsed.number) ||
    parsed.year < 1 ||
    parsed.year > 99 ||
    parsed.number < 1 ||
    parsed.number > 9_999_999_999
  ) {
    return undefined;
  }

  const year = String(parsed.year).padStart(2, "0");
  const number = String(parsed.number).padStart(10, "0");

  return `${eraCodes[parsed.era]}${year}${typeCode}${number}`;
};
