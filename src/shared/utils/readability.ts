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
const articleNumberRegex = new RegExp(`第(${kanjiNumberPattern})(条|項|号)`, "g");
const branchArticleNumberRegex = new RegExp(`(第\\d+条の)(${kanjiNumberPattern})`, "g");
const appendixTableNumberRegex = new RegExp(`(別表)第?(${kanjiNumberPattern})`, "g");
const eraDateRegex = new RegExp(
  `(令和|平成|昭和|大正|明治)(${kanjiNumberPattern})年(${kanjiNumberPattern})月(${kanjiNumberPattern})日`,
  "g",
);
const lawNumberRegex = new RegExp(
  `(令和|平成|昭和|大正|明治)(${kanjiNumberPattern})年法律第(${kanjiNumberPattern})号`,
  "g",
);

export const toArabicNumber = (kanjiNumber: string): number | undefined => {
  if (!/^[一二三四五六七八九十百千]+$/.test(kanjiNumber)) {
    return undefined;
  }

  let total = 0;
  let currentDigit: number | undefined;

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

    total += (currentDigit ?? 1) * unit;
    currentDigit = undefined;
  }

  return total + (currentDigit ?? 0);
};

const replaceKanjiNumber = (kanjiNumber: string): string => {
  const arabicNumber = toArabicNumber(kanjiNumber);

  return arabicNumber === undefined ? kanjiNumber : String(arabicNumber);
};

const transformParentheses = (text: string): string =>
  text.replaceAll("（", "(").replaceAll("）", ")");

const transformArticleNumbers = (text: string): string =>
  text
    .replace(articleNumberRegex, (_match, kanjiNumber: string, suffix: string) => {
      return `第${replaceKanjiNumber(kanjiNumber)}${suffix}`;
    })
    .replace(branchArticleNumberRegex, (_match, prefix: string, branchNumber: string) => {
      return `${prefix}${replaceKanjiNumber(branchNumber)}`;
    })
    .replace(appendixTableNumberRegex, (_match, prefix: string, tableNumber: string) => {
      return `${prefix}${replaceKanjiNumber(tableNumber)}`;
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
      return transformArticleNumbers(text);
    case "date":
      return transformDates(text);
    case "law-number":
      return transformLawNumbers(text);
    case "parentheses":
      return transformParentheses(text);
    case "unchanged":
      return text;
    case "all":
      return transformArticleNumbers(
        transformDates(transformLawNumbers(transformParentheses(text))),
      );
  }
};
