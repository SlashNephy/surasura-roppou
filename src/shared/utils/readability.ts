export type ReadabilityTransformMode =
  "article-number" | "date" | "law-number" | "parentheses" | "quantity" | "unchanged" | "all";

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
// 本文中の「第四章の二つ」などとの曖昧さを避け、e-Gov の見出し形式である先頭の構造番号と区切りがそろう場合だけ変換する。
const structuralHeadingPrefixRegex = new RegExp(
  `^第(${kanjiNumberPattern})(編|章|節|款|目)(?:の(${branchNumberPattern}))?(?=$|[\\s\\p{P}\\p{S}])`,
  "u",
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
const quantityLimitPattern = "以上|以下|以内|未満|を超え|を越え";
// 助数詞は許可リストで持つ。裸の漢数字を一律に変換すると「一般」「一部」「一切」などを壊すため。
// 「一通り」は数量ではないので除き、「月」は「三月以内」のように限度表現が続く場合だけ期間として扱う
// （「四月一日」のような日付は monthDayRegex 側で処理する）。
const quantityUnitPattern = [
  "年間",
  "箇年",
  "箇月",
  "か月",
  "ヶ月",
  "カ月",
  "ケ月",
  "週間",
  "年",
  "週",
  "日",
  "人",
  "通(?!り)",
  "トン",
  `月(?=${quantityLimitPattern})`,
].join("|");
// 「同一人」「同一年度」「唯一人」「第一人者」など、直前の漢字と結合して数量ではなくなる語を除外する。
// 「第」に続く数字は条番号・構造番号として別の変換が扱うため、ここでは対象にしない。
const nonQuantityPrefixPattern = "(?<![同唯第])";
const fractionRegex = new RegExp(`(${kanjiNumberPattern})分の(${kanjiNumberPattern})`, "g");
const monthDayRegex = new RegExp(`(${kanjiNumberPattern})月(${kanjiNumberPattern})日`, "g");
const quantityUnitRegex = new RegExp(
  `${nonQuantityPrefixPattern}(${kanjiNumberPattern})(${quantityUnitPattern})`,
  "g",
);
// 「二以上」のような助数詞を伴わない数量。「第四章の二以下」は枝番号なので直前の構造名で除外する。
const boundedQuantityRegex = new RegExp(
  `${nonQuantityPrefixPattern}(?<![編章節款目条項号表]の)(${kanjiNumberPattern})(?=${quantityLimitPattern})`,
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

// 全角のアラビア数字（０-９）を半角に揃える。民法の項番号「２」と憲法の「2」など、
// 出典で全角/半角が混在する数字を見やすい表示で統一する。
const transformFullWidthDigits = (text: string): string =>
  text.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 0x30));

const replaceLegalNumber = (_match: string, kanjiNumber: string, suffix: string): string => {
  return `第${replaceKanjiNumber(kanjiNumber)}${suffix}`;
};

const replaceBranchNumbers = (_match: string, prefix: string, branchNumbers: string): string =>
  `${prefix}の${branchNumbers.split("の").map(replaceKanjiNumber).join("の")}`;

const transformArticleNumbers = (text: string): string =>
  text
    .replace(articleNumberRegex, replaceLegalNumber)
    .replace(appendixTableNumberRegex, (_match, prefix: string, tableNumber: string) => {
      return `${prefix}${replaceKanjiNumber(tableNumber)}`;
    })
    .replace(branchNumberRegex, replaceBranchNumbers);

const transformStructuralHeadingNumber = (text: string): string =>
  text.replace(
    structuralHeadingPrefixRegex,
    (match, kanjiNumber: string, suffix: string, branchNumbers: string | undefined) => {
      const arabicNumber = toArabicNumber(kanjiNumber);

      if (arabicNumber === undefined) {
        return match;
      }

      const displayBranchNumbers =
        branchNumbers === undefined
          ? ""
          : `の${branchNumbers.split("の").map(replaceKanjiNumber).join("の")}`;

      return `第${String(arabicNumber)}${suffix}${displayBranchNumbers}`;
    },
  );

const transformDates = (text: string): string =>
  text.replace(eraDateRegex, (_match, era: string, year: string, month: string, day: string) => {
    return `${era}${replaceKanjiNumber(year)}年${replaceKanjiNumber(month)}月${replaceKanjiNumber(day)}日`;
  });

const transformLawNumbers = (text: string): string =>
  text.replace(lawNumberRegex, (_match, era: string, year: string, lawNumber: string) => {
    return `${era}${replaceKanjiNumber(year)}年法律第${replaceKanjiNumber(lawNumber)}号`;
  });

// 分数 → 月日 → 助数詞 → 裸の数量の順に適用する。
// 「三分の二以上」は分数を先に処理しないと「三分の2以上」で止まり、
// 「四月一日」は月日を先に処理しないと「四月1日」と揃わない。
// 「前三条」「前二項」のような条項の相対参照は、法律書の慣行に合わせて漢数字のまま残す。
const transformQuantities = (text: string): string =>
  text
    .replace(
      fractionRegex,
      (_match, denominator: string, numerator: string) =>
        `${replaceKanjiNumber(denominator)}分の${replaceKanjiNumber(numerator)}`,
    )
    .replace(
      monthDayRegex,
      (_match, month: string, day: string) =>
        `${replaceKanjiNumber(month)}月${replaceKanjiNumber(day)}日`,
    )
    .replace(
      quantityUnitRegex,
      (_match, kanjiNumber: string, unit: string) => `${replaceKanjiNumber(kanjiNumber)}${unit}`,
    )
    .replace(boundedQuantityRegex, (_match, kanjiNumber: string) =>
      replaceKanjiNumber(kanjiNumber),
    );

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
    case "quantity":
      return transformQuantities(text);
    case "unchanged":
      return text;
    case "all":
      // 数量変換は条番号・日付・法令番号を処理した後に置く。
      // 「令和六年」の「六年」を期間として先に拾ってしまわないようにするため。
      return transformFullWidthDigits(
        transformQuantities(
          transformArticleNumbers(transformDates(transformLawNumbers(transformParentheses(text)))),
        ),
      );
  }
};

export const transformReadableHeadingText = (text: string): string =>
  transformReadableText(transformStructuralHeadingNumber(text));
