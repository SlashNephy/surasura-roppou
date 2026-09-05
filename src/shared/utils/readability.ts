export type ReadabilityTransformMode =
  "article-number" | "date" | "law-number" | "parentheses" | "quantity" | "unchanged" | "all";

const digitByKanji = new Map([
  ["〇", 0],
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

// e-Gov の法令番号や条番号は「一〇」「一一」のような位取りの漢数字でも書かれるため、
// 〇 を含めて拾う。位取りとして読むかどうかは変換側（allowPositional）が決める。
const kanjiNumberPattern = "[〇一二三四五六七八九十百千]+";
const eraYearPattern = `${kanjiNumberPattern}|元`;
const branchNumberPattern = `${kanjiNumberPattern}(?:の${kanjiNumberPattern})*`;
const articleNumberRegex = new RegExp(`第(${kanjiNumberPattern})(条|項|号)`, "g");
// 本文中の「第四章の二つ」などとの曖昧さを避け、e-Gov の見出し形式である先頭の構造番号と区切りがそろう場合だけ変換する。
const structuralHeadingPrefixRegex = new RegExp(
  `^第(${kanjiNumberPattern})(編|章|節|款|目)(?:の(${branchNumberPattern}))?(?=$|[\\s\\p{P}\\p{S}])`,
  "u",
);
// 本文中の「第四編（親族）の規定」のような構造参照。見出しと違って文中に現れるため
// 位置を限定できない。構造語の直後が漢字だと「第一目的」「第一編成」のように語の一部で
// あることが多いので、参照の続きとして自然な漢字（第・中・別と、法令用語の接続詞
// 及び・並びに・又は・若しくは）だけを許可して、それ以外の漢字が続く場合は変換しない。
const structuralNumberContinuationPattern = "(?=$|[^\\p{Script=Han}]|[第中別及並又若])";
// 枝番の「の二」は「二つ」「二か所」「二次的」「一部」のように数量や別の語にも読める。
// 枝番として確実に読める後続（句読点・括弧・空白・の・で・を・以下・以上・から・まで・
// より・及び・並びに・又は・若しくは・第）が続く場合だけ変換する。
const structuralBranchContinuationPattern =
  "(?=$|[、。（）\\s]|の|で|を|以下|以上|から|まで|より|及び|並びに|又は|若しくは|第)";
const structuralNumberRegex = new RegExp(
  `第(${kanjiNumberPattern})(編|章|節|款|目)${structuralNumberContinuationPattern}((?:の${kanjiNumberPattern}${structuralBranchContinuationPattern})*)`,
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
const quantityLimitPattern = "以上|以下|以内|未満|を超え|を越え|をこえ|を経過";
// 助数詞は許可リストで持つ。裸の漢数字を一律に変換すると「一般」「一部」「一切」などを壊すため。
// 「一通り」は数量ではないので除き、「月」は「三月以内」のように限度表現が続く場合だけ期間として扱う
// （「四月一日」のような日付は monthDayRegex 側で処理する）。
const quantityUnitPattern = [
  "労働日",
  "親等",
  "年間",
  "箇年",
  "箇月",
  "か月",
  "ヶ月",
  "カ月",
  "ケ月",
  "週間",
  "時間",
  "月間",
  "単元",
  "単位",
  "年",
  "株",
  "組",
  "週",
  "日",
  "人",
  "歳",
  "回",
  "個",
  "倍",
  "棟",
  "割",
  // 金額は「一万円」→「1万円」のように万・億を単位語として残す。
  // 万・億の前後それぞれが独立して変換されるので「三億五千万円」→「3億5000万円」になる。
  "億",
  "万",
  "円",
  "通(?!り)",
  "トン",
  // 「三月以内」のような期間と、「一月から三月まで」のような月名だけを対象にする。
  // 「四月一日」形式の日付は monthDayRegex が先に処理する。
  `月(?=${quantityLimitPattern}|から|まで)`,
].join("|");
// 「同一人」「同一年度」「唯一人」「第一人者」など、直前の漢字と結合して数量ではなくなる語を除外する。
// 「第」に続く数字は条番号・構造番号として別の変換が扱うため、ここでは対象にしない。
const nonQuantityPrefixPattern = "(?<![同唯第])";
const fractionRegex = new RegExp(`(${kanjiNumberPattern})分の(${kanjiNumberPattern})`, "g");
// 歩合の「二割五分」は割と分をまとめて扱う。「分」を単独の助数詞にすると「十分な」「十分に」を壊すため。
const rateRegex = new RegExp(
  `${nonQuantityPrefixPattern}(${kanjiNumberPattern})割(${kanjiNumberPattern})分`,
  "g",
);
const monthDayRegex = new RegExp(`(${kanjiNumberPattern})月(${kanjiNumberPattern})日`, "g");
// 「一二月八日」のように月日の並びが monthDayRegex で読めなかったときに、日だけが
// 助数詞として変換されると「一二月8日」と混ざる。月日の並びは monthDayRegex に任せる。
const monthPrefixPattern = `(?<!${kanjiNumberPattern}月)`;
const quantityUnitRegex = new RegExp(
  `${nonQuantityPrefixPattern}${monthPrefixPattern}(${kanjiNumberPattern})(${quantityUnitPattern})`,
  "g",
);
// 「一又は二以上」は後半だけ変換すると「一又は2以上」と不揃いになるため、対にして扱う。
const pairedBoundedQuantityRegex = new RegExp(
  `${nonQuantityPrefixPattern}(${kanjiNumberPattern})(又は|若しくは|及び|、)(${kanjiNumberPattern})(?=${quantityLimitPattern})`,
  "g",
);
// 「二以上」のような助数詞を伴わない数量。「第四章の二以下」は枝番号なので直前の構造名で除外する。
const boundedQuantityRegex = new RegExp(
  `${nonQuantityPrefixPattern}(?<![編章節款目条項号表]の)(${kanjiNumberPattern})(?=${quantityLimitPattern})`,
  "g",
);

// 「一一」「一六〇」のような位取り表記は、法令番号・日付・条番号では 11・160 と読める。
// 一方で数量の「二三日」（二、三日）や「一一人」は位取りではないため、
// 位取りとして読んでよい文脈からのみ allowPositional を渡す。
export const toArabicNumber = (
  kanjiNumber: string,
  { allowPositional = false }: { allowPositional?: boolean } = {},
): number | undefined => {
  if (!new RegExp(`^${kanjiNumberPattern}$`, "u").test(kanjiNumber)) {
    return undefined;
  }

  const chars = Array.from(kanjiNumber);

  if (chars.every((char) => digitByKanji.has(char))) {
    // 位取り表記は桁をそのまま並べて読む。単位語（十・百・千）を伴わない 1 桁は
    // 従来どおり読めるため、位取りを許さない文脈でも変換できる。
    if (!allowPositional && (chars.length > 1 || chars[0] === "〇")) {
      return undefined;
    }

    return Number(chars.map((char) => String(digitByKanji.get(char))).join(""));
  }

  if (chars.includes("〇")) {
    // 「一〇十」のように位取りと単位語が混じった表記は読み方が定まらない。
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

const replaceKanjiNumber = (kanjiNumber: string, allowPositional = false): string => {
  const arabicNumber = toArabicNumber(kanjiNumber, { allowPositional });

  return arabicNumber === undefined ? kanjiNumber : String(arabicNumber);
};

// 法令番号・日付・条番号のように、位取り表記として読んでよい文脈で使う。
const replaceNumberingKanji = (kanjiNumber: string): string =>
  replaceKanjiNumber(kanjiNumber, true);

// 成分が一つでも読めなければ、部分的に算用数字へ変えず原文のまま残す。
// 「平成十十年一二月八日」を「平成十十年一二月8日」と混在させると、かえって読みにくい。
const replaceKanjiNumbersAll = (
  values: string[],
  allowPositional = false,
): string[] | undefined => {
  const replaced = values.map((value) => toArabicNumber(value, { allowPositional }));

  return replaced.every((value) => value !== undefined)
    ? replaced.map((value) => String(value))
    : undefined;
};

const replaceNumberingKanjiAll = (values: string[]): string[] | undefined =>
  replaceKanjiNumbersAll(values, true);

// 元号の「元年」は算用数字にできないため、そのまま元年として残す。
const replaceEraYear = (year: string): string | undefined =>
  year === "元" ? year : toArabicNumber(year, { allowPositional: true })?.toString();

// 見やすい表示では丸括弧を全角に揃える。法令本文は全角が既定で、半角が混じるのは
// 出典側の揺れであるため、半角を全角へ寄せて表示を統一する。
const transformParentheses = (text: string): string =>
  text.replaceAll("(", "（").replaceAll(")", "）");

// 全角のアラビア数字（０-９）を半角に揃える。民法の項番号「２」と憲法の「2」など、
// 出典で全角/半角が混在する数字を見やすい表示で統一する。
const transformFullWidthDigits = (text: string): string =>
  text.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 0x30));

const replaceLegalNumber = (_match: string, kanjiNumber: string, suffix: string): string => {
  return `第${replaceNumberingKanji(kanjiNumber)}${suffix}`;
};

const replaceBranchNumbers = (_match: string, prefix: string, branchNumbers: string): string =>
  `${prefix}の${branchNumbers.split("の").map(replaceNumberingKanji).join("の")}`;

const replaceStructuralNumber = (
  match: string,
  kanjiNumber: string,
  suffix: string,
  branchNumbers: string,
): string => {
  const arabicNumber = toArabicNumber(kanjiNumber, { allowPositional: true });

  // 構造番号が読めないときは枝番も変換しない。「第十十章の二」のように番号が
  // 壊れている参照は、原文のまま残したほうが誤読を招かない。
  if (arabicNumber === undefined) {
    return match;
  }

  return `第${String(arabicNumber)}${suffix}${branchNumbers.split("の").map(replaceNumberingKanji).join("の")}`;
};

const transformArticleNumbers = (text: string): string =>
  text
    .replace(articleNumberRegex, replaceLegalNumber)
    .replace(appendixTableNumberRegex, (_match, prefix: string, tableNumber: string) => {
      return `${prefix}${replaceNumberingKanji(tableNumber)}`;
    })
    .replace(branchNumberRegex, replaceBranchNumbers)
    .replace(structuralNumberRegex, replaceStructuralNumber);

const transformStructuralHeadingNumber = (text: string): string =>
  text.replace(
    structuralHeadingPrefixRegex,
    (match, kanjiNumber: string, suffix: string, branchNumbers: string | undefined) => {
      const arabicNumber = toArabicNumber(kanjiNumber, { allowPositional: true });

      if (arabicNumber === undefined) {
        return match;
      }

      const displayBranchNumbers =
        branchNumbers === undefined
          ? ""
          : `の${branchNumbers.split("の").map(replaceNumberingKanji).join("の")}`;

      return `第${String(arabicNumber)}${suffix}${displayBranchNumbers}`;
    },
  );

const transformDates = (text: string): string =>
  text.replace(eraDateRegex, (match, era: string, year: string, month: string, day: string) => {
    const displayYear = replaceEraYear(year);
    const replaced = replaceNumberingKanjiAll([month, day]);

    return displayYear === undefined || replaced === undefined
      ? match
      : `${era}${displayYear}年${replaced[0]}月${replaced[1]}日`;
  });

const transformLawNumbers = (text: string): string =>
  text.replace(lawNumberRegex, (match, era: string, year: string, lawNumber: string) => {
    const displayYear = replaceEraYear(year);
    const replaced = replaceNumberingKanjiAll([lawNumber]);

    return displayYear === undefined || replaced === undefined
      ? match
      : `${era}${displayYear}年法律第${replaced[0]}号`;
  });

// 分数 → 歩合 → 月日 → 助数詞 → 裸の数量の順に適用する。
// 「三分の二以上」は分数を先に処理しないと「三分の2以上」で止まり、
// 「四月一日」は月日を先に処理しないと「四月1日」と揃わない。
// 「前三条」「前二項」のような条項の相対参照は、法律書の慣行に合わせて漢数字のまま残す。
const transformQuantities = (text: string): string =>
  text
    .replace(fractionRegex, (match, denominator: string, numerator: string) => {
      const replaced = replaceKanjiNumbersAll([denominator, numerator]);

      return replaced === undefined ? match : `${replaced[0]}分の${replaced[1]}`;
    })
    .replace(rateRegex, (match, tenths: string, hundredths: string) => {
      const replaced = replaceKanjiNumbersAll([tenths, hundredths]);

      return replaced === undefined ? match : `${replaced[0]}割${replaced[1]}分`;
    })
    .replace(monthDayRegex, (match, month: string, day: string) => {
      const replaced = replaceKanjiNumbersAll([month, day]);

      return replaced === undefined ? match : `${replaced[0]}月${replaced[1]}日`;
    })
    .replace(
      quantityUnitRegex,
      (_match, kanjiNumber: string, unit: string) => `${replaceKanjiNumber(kanjiNumber)}${unit}`,
    )
    .replace(
      pairedBoundedQuantityRegex,
      (match, first: string, conjunction: string, second: string) => {
        const replaced = replaceKanjiNumbersAll([first, second]);

        return replaced === undefined ? match : `${replaced[0]}${conjunction}${replaced[1]}`;
      },
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
