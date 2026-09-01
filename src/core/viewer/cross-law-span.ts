import {
  createAliasResolver,
  deriveLawIdFromLawNumber,
  initialAliasDictionary,
  lawNumberKey,
  parseLawNumber,
  type ResolvedLawNumber,
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

// 辞書に無い法令名の左境界。句読点・括弧・引用符・空白に加え、位置表現の末尾になる
// 「条」「項」「号」「編」「章」「第」でも切る。位置表現（第n条・前項など）は必ず
// これらのいずれかで終わるため、左スキャンが直前の別参照を越えて飲み込まなくなる。
// 副作用として、法令名自体にこれらの文字を含む場合（「…条約」「国連憲章」等）は
// スキャンがその手前で止まり下線が短くなるが、リンク先は法令番号から決まるため
// 誤リンクにはならない（失敗方向は安全側）。
const lawNameBoundaryPattern = /[\s、。，．・（）()「」『』〔〕［］[\]｛｝{}"'条項号編章第]/;

// スパンの先頭に残る列挙の接続語。reference-links の coordinationGapPattern と同じ語彙。
const leadingCoordinationPattern = /^(?:及び|並びに|又は|若しくは|、|・)+/;

const hanPattern = /\p{Script=Han}/u;

// 位置表現の末尾になる文字。左スキャンはここで止まるため、法令名の直前にこれらが
// あるのは「直前に別の参照がある」だけで、「旧民法」のような接頭辞ではない。
// 漢字ガードの対象から外さないと、参照が連続する条文でリンクを取りこぼす。
const positionTerminators = new Set(["条", "項", "号", "編", "章", "第"]);

interface LawNumberParenthesis {
  startIndex: number;
  lawId?: string;
  title?: string;
}

// 位置表現の直前にある法令番号の括弧書きを読む。括弧が無い、または中身が
// 法令番号でなければ undefined。中身が法令番号なら、導出できた lawId を載せる。
const readLawNumberParenthesis = (
  text: string,
  matchStart: number,
  minIndex: number,
  lawByLawNumber: ReadonlyMap<string, ResolvedLawNumber> | undefined,
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

    const resolvedLaw = lawByLawNumber?.get(lawNumberKey(parsed));
    const lawId = deriveLawIdFromLawNumber(parsed) ?? resolvedLaw?.lawId;

    return {
      startIndex: index,
      ...(lawId === undefined ? {} : { lawId }),
      ...(resolvedLaw?.title === undefined ? {} : { title: resolvedLaw.title }),
    };
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

// 法令番号から引いた正式名称が括弧の直前にそのまま置かれていれば、境界はそこで厳密に決まる。
// 表記ゆれは吸収しない。正規化すると長さが変わり、開始位置の算出が狂うため。
const readTitledLawName = (
  text: string,
  nameEnd: number,
  minIndex: number,
  title: string | undefined,
): number | undefined => {
  // 空文字列だと slice 比較が常に一致し、開き括弧の位置に境界が潰れてしまう。
  if (title === undefined || title === "") {
    return undefined;
  }

  const start = nameEnd - title.length;

  // 直前に確定したセグメントを越えて遡らない。
  if (start < minIndex) {
    return undefined;
  }

  return text.slice(start, nameEnd) === title ? start : undefined;
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
  lawByLawNumber?: ReadonlyMap<string, ResolvedLawNumber>,
): CrossLawSpan | undefined => {
  const parenthesis = readLawNumberParenthesis(text, matchStart, minIndex, lawByLawNumber);
  const nameEnd = parenthesis?.startIndex ?? matchStart;
  const dictionary = readDictionaryLawName(text, nameEnd, minIndex);

  if (dictionary === undefined && parenthesis === undefined) {
    return undefined;
  }

  // 正式名称は法令番号が決めるので最も確か。次に辞書の最長一致、最後に左スキャン。
  const startIndex =
    readTitledLawName(text, nameEnd, minIndex, parenthesis?.title) ??
    dictionary?.startIndex ??
    (parenthesis === undefined ? nameEnd : readFreeLawName(text, nameEnd, minIndex));

  // 「旧民法」「新会社法」のように法令名の直前が漢字なら、現行法とは別の法令を
  // 指している可能性が高い。宛先を伏せて無リンクにする。
  // 法令番号を伴う参照を例外にすることも考えられるが、実データで数えると本則の
  // リンク数は例外の有無で変わらなかった（「附則第九条中農業協同組合法（…）」の
  // ような改正条文の言い回しは附則にしか現れない）。利得が無いなら
  // 「誤ったリンクは無リンクより有害」に従い、抑止側に倒す。
  // ただし直前が位置表現の末尾なら、それは別の参照の終わりであって接頭辞ではない。
  if (
    startIndex > 0 &&
    !positionTerminators.has(text[startIndex - 1]) &&
    hanPattern.test(text[startIndex - 1])
  ) {
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
