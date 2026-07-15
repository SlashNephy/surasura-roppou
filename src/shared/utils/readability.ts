export type ReadabilityTransformMode =
  "article-number" | "date" | "law-number" | "parentheses" | "unchanged" | "all";

const digitByKanji = new Map([
  ["一", 1],
  ["二", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["七", 7],
  ["八", 8],
  ["九", 9],
]);

const unitByKanji = new Map([
  ["十", 10],
  ["百", 100],
  ["千", 1_000],
]);

const kanjiNumberPattern = "[一二三四五六七八九十百千]+";
const eraYearPattern = `${kanjiNumberPattern}|元`;
const branchNumberPattern = `${kanjiNumberPattern}(?:の${kanjiNumberPattern})*`;
const articleNumberRegex = new RegExp(`第(${kanjiNumberPattern})(条|項|号)`, "g");
// 構造単位が「目標」や「編成」の語頭として現れる場合を除外しつつ、「第一目から」のように助詞が続く参照は変換する。
const structuralHeadingNumberRegex = new RegExp(
  `第(${kanjiNumberPattern})(編|章|節|款|目)(?!\\p{Script=Han})`,
  "gu",
);
const branchNumberRegex = new RegExp(
  `(第\\d+(?:条|項|号)|別表\\d+|別記様式\\d+)の(${branchNumberPattern})`,
  "g",
);
const appendixTableNumberRegex = new RegExp(`(別表|別記様式)第?(${kanjiNumberPattern})`, "g");
const eraDateRegex = new RegExp(
  `(令和|平成|昭和|大正|明治)(${eraYearPattern})年(${kanjiNumberPattern})月(${kanjiNumberPattern})日`,
  "g",
);
const lawNumberRegex = new RegExp(
  `(令和|平成|昭和|大正|明治)(${eraYearPattern})年法律第(${kanjiNumberPattern})号`,
  "g",
);

export const toArabicNumber = (kanjiNumber: string): number | undefined => {
  if (!/^[一二三四五六七八九十百千]+$/.test(kanjiNumber)) {
    return undefined;
  }

  let total = 0;
  let currentDigit: number | undefined;
  let previousUnit = 10_000;

  for (const kanji of kanjiNumber) {
    const digit = digitByKanji.get(kanji);

    if (digit !== undefined) {
      if (currentDigit !== undefined) {
        return undefined;
      }

      currentDigit = digit;
      continue;
    }

    const unit = unitByKanji.get(kanji);

    if (unit === undefined) {
      return undefined;
    }

    if (unit >= previousUnit) {
      return undefined;
    }

    total += (currentDigit ?? 1) * unit;
    currentDigit = undefined;
    previousUnit = unit;
  }

  const result = total + (currentDigit ?? 0);

  return result < 10_000 ? result : undefined;
};

const replaceKanjiNumber = (kanjiNumber: string): string => {
  const arabicNumber = toArabicNumber(kanjiNumber);

  return arabicNumber === undefined ? kanjiNumber : String(arabicNumber);
};

const transformParentheses = (text: string): string =>
  text.replaceAll("（", "(").replaceAll("）", ")");

const replaceLegalNumber = (_match: string, kanjiNumber: string, suffix: string): string => {
  return `第${replaceKanjiNumber(kanjiNumber)}${suffix}`;
};

const transformLegalNumbers = (text: string): string =>
  text
    .replace(structuralHeadingNumberRegex, replaceLegalNumber)
    .replace(articleNumberRegex, replaceLegalNumber)
    .replace(appendixTableNumberRegex, (_match, prefix: string, tableNumber: string) => {
      return `${prefix}${replaceKanjiNumber(tableNumber)}`;
    })
    .replace(branchNumberRegex, (_match, prefix: string, branchNumbers: string) => {
      return `${prefix}の${branchNumbers.split("の").map(replaceKanjiNumber).join("の")}`;
    });

const transformDates = (text: string): string =>
  text.replace(eraDateRegex, (_match, era: string, year: string, month: string, day: string) => {
    return `${era}${replaceKanjiNumber(year)}年${replaceKanjiNumber(month)}月${replaceKanjiNumber(day)}日`;
  });

const transformLawNumbers = (text: string): string =>
  text.replace(lawNumberRegex, (_match, era: string, year: string, lawNumber: string) => {
    return `${era}${replaceKanjiNumber(year)}年法律第${replaceKanjiNumber(lawNumber)}号`;
  });

export const transformReadableText = (
  text: string,
  mode: ReadabilityTransformMode = "all",
): string => {
  switch (mode) {
    case "article-number":
      return transformLegalNumbers(text);
    case "date":
      return transformDates(text);
    case "law-number":
      return transformLawNumbers(text);
    case "parentheses":
      return transformParentheses(text);
    case "unchanged":
      return text;
    case "all":
      return transformLegalNumbers(transformDates(transformLawNumbers(transformParentheses(text))));
  }
};
