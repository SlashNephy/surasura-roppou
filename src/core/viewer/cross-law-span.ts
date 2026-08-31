import {
  createAliasResolver,
  deriveLawIdFromLawNumber,
  initialAliasDictionary,
  parseLawNumber,
} from "@/core/jump";
import { normalizeForSearch } from "@/core/search";

// 他法令を指す参照のスパン。startIndex は法令名の先頭位置。
// lawId が無い場合は「他法令参照だが宛先不明」で、呼び出し側は無リンクにする。
export interface CrossLawSpan {
  startIndex: number;
  lawId?: string;
}

// 法令名の判定専用の resolver。組込辞書のみで十分（本文リンク化は候補解決までは行わない）。
const resolver = createAliasResolver();

// 法令名部を後方から拾う窓幅。辞書の正規化キーの最大長を使う。
const maxLawNameLength = Math.max(
  ...initialAliasDictionary.flatMap((entry) =>
    [entry.officialTitle, ...entry.aliases].map(
      (surface) => normalizeForSearch(surface).normalized.length,
    ),
  ),
);

const openingBrackets = new Set(["（", "("]);
const closingBrackets = new Set(["）", ")"]);

// 辞書に無い法令名の左境界。句読点・括弧・引用符・空白で切る。
const lawNameBoundaryPattern = /[\s、。，．・（）()「」『』〔〕［］[\]｛｝{}"']/;

// スパンの先頭に残る列挙の接続語。reference-links の coordinationGapPattern と同じ語彙。
const leadingCoordinationPattern = /^(?:及び|並びに|又は|若しくは|、|・)+/;

const hanPattern = /\p{Script=Han}/u;

interface LawNumberParenthesis {
  startIndex: number;
  lawId?: string;
}

// 位置表現の直前にある法令番号の括弧書きを読む。括弧が無い、または中身が
// 法令番号でなければ undefined。中身が法令番号なら、導出できた lawId を載せる。
const readLawNumberParenthesis = (
  text: string,
  matchStart: number,
  minIndex: number,
): LawNumberParenthesis | undefined => {
  if (matchStart <= minIndex || !closingBrackets.has(text[matchStart - 1])) {
    return undefined;
  }

  for (let index = matchStart - 2; index >= minIndex; index -= 1) {
    if (closingBrackets.has(text[index])) {
      // 入れ子の内側の閉じ括弧に先に当たった場合、それより先の開き括弧を
      // 対応括弧とみなすと入れ子の内側を誤って対応括弧と誤認してしまう。
      return undefined;
    }

    if (!openingBrackets.has(text[index])) {
      continue;
    }

    const parsed = parseLawNumber(text.slice(index + 1, matchStart - 1));

    if (parsed === undefined) {
      return undefined;
    }

    const lawId = deriveLawIdFromLawNumber(parsed);

    return { startIndex: index, ...(lawId === undefined ? {} : { lawId }) };
  }

  return undefined;
};

interface DictionaryLawName {
  startIndex: number;
  lawId?: string; // 正式名称に一致したときだけ載る。略称一致は宛先にしない
}

// 位置表現（または法令番号の括弧）の直前にある法令名を、辞書の最長一致で読む。
// 正式名称に一致したものだけリンクの宛先にする。条文の原文は正式名称と法令番号で
// 引用し、「民」「刑訴」のような学習者略称は現れないため、略称一致は誤検出の面にしかならない。
// ただし略称一致もスパンとしては返す。「民訴第三条」の直前 1 文字は「訴」で
// reference-links 側のガード文字に掛からず、返さないと自法令の第3条へ短絡する。
const readDictionaryLawName = (
  text: string,
  nameEnd: number,
  minIndex: number,
): DictionaryLawName | undefined => {
  const from = Math.max(minIndex, nameEnd - maxLawNameLength);

  for (let start = from; start < nameEnd; start += 1) {
    const candidates = resolver.resolve(text.slice(start, nameEnd));

    if (candidates.length === 0) {
      continue;
    }

    const official = candidates.find((candidate) => candidate.matchKind === "official");

    return { startIndex: start, ...(official === undefined ? {} : { lawId: official.lawId }) };
  }

  return undefined;
};

// 法令番号の括弧書きの直前を、区切り文字に当たるまで法令名として読む。
// 辞書に無い法令名を拾うための経路なので、左境界は厳密には決まらない。
// 助詞を巻き込んで下線が長くなることはあるが、宛先は法令番号で決まるため誤リンクにはならない。
const readFreeLawName = (text: string, nameEnd: number, minIndex: number): number => {
  let start = nameEnd;

  while (start > minIndex && !lawNameBoundaryPattern.test(text[start - 1])) {
    start -= 1;
  }

  const leading = leadingCoordinationPattern.exec(text.slice(start, nameEnd));

  return leading === null ? start : start + leading[0].length;
};

export const detectCrossLawSpan = (
  text: string,
  matchStart: number,
  minIndex: number,
): CrossLawSpan | undefined => {
  const parenthesis = readLawNumberParenthesis(text, matchStart, minIndex);
  const nameEnd = parenthesis?.startIndex ?? matchStart;
  const dictionary = readDictionaryLawName(text, nameEnd, minIndex);

  if (dictionary === undefined && parenthesis === undefined) {
    return undefined;
  }

  const startIndex =
    dictionary?.startIndex ??
    (parenthesis === undefined ? nameEnd : readFreeLawName(text, nameEnd, minIndex));

  // 「旧民法」「新会社法」のように法令名の直前が漢字なら、現行法とは別の法令を
  // 指している可能性が高い。宛先を伏せて無リンクにする。
  if (startIndex > 0 && hanPattern.test(text[startIndex - 1])) {
    return { startIndex };
  }

  const lawId = resolveLawId(parenthesis?.lawId, dictionary?.lawId);

  return { startIndex, ...(lawId === undefined ? {} : { lawId }) };
};

// 法令番号からの導出を優先する。法令番号は一意で、辞書の名寄せより確実なため。
// 両方あって食い違うときは、どちらが正しいか決められないので宛先を伏せる。
const resolveLawId = (
  derived: string | undefined,
  official: string | undefined,
): string | undefined => {
  if (derived !== undefined && official !== undefined && derived !== official) {
    return undefined;
  }

  return derived ?? official;
};
