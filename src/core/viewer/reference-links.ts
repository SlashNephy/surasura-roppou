import { normalizeArticleNumberForLookup, type LawNode } from "@/core/domain";
import {
  bodyReferencePositionPatternSource,
  parseReference,
  referenceArticleSpanPattern,
  type ParsedReference,
} from "@/core/jump";

import { detectCrossLawSpan } from "./cross-law-span";
import { chapterAnchorId, computeChildArticleContext, partAnchorId } from "./lawToc";

// 本文の参照リンクを解決するために必要な、法令 1 件ぶんの条の一覧。
// 文書順に並び、前条・次条の解決に使う。
export interface ArticleLinkEntry {
  articleNumber: string;
  // 条見出し。格納形の外側の括弧は剥がしてある。
  caption?: string;
  // 条直下の項番号。前項・次項の解決と、存在しない項への着地の抑止に使う。
  paragraphNumbers: string[];
}

const captionParenthesesPattern = /^[（(]([\s\S]*)[）)]$/;

// 条見出しは「（親告罪）」の形で格納されている。〈 〉で囲み直すため外側の括弧を剥がす。
const stripCaptionParentheses = (caption: string | undefined): string | undefined => {
  if (caption === undefined) {
    return undefined;
  }

  const match = captionParenthesesPattern.exec(caption);

  return match === null ? caption : match[1];
};

export const buildArticleLinkEntries = (nodes: LawNode[]): ArticleLinkEntry[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const topLevelNodes = nodes.filter((node) => node.parentId === undefined);

  return topLevelNodes.flatMap((node) => collectArticleLinkEntries(node, nodeById, true));
};

const collectArticleLinkEntries = (
  node: LawNode,
  nodeById: Map<string, LawNode>,
  isUrlAddressableArticleContext: boolean,
): ArticleLinkEntry[] => {
  const children = node.children
    .map((childId) => nodeById.get(childId))
    .filter((child): child is LawNode => child !== undefined);

  if (node.type === "Article") {
    // 附則・別表の中の条は本則の条を指さないため、リンクの着地先にしない。
    if (!isUrlAddressableArticleContext || node.number === undefined) {
      return [];
    }

    const caption = stripCaptionParentheses(node.caption);

    return [
      {
        articleNumber: node.number,
        ...(caption === undefined ? {} : { caption }),
        paragraphNumbers: children.flatMap((child) =>
          child.type === "Paragraph" && child.number !== undefined ? [child.number] : [],
        ),
      },
    ];
  }

  const childArticleContext = computeChildArticleContext(isUrlAddressableArticleContext, node.type);

  return children.flatMap((child) =>
    collectArticleLinkEntries(child, nodeById, childArticleContext),
  );
};

// 本文の参照リンクを解決するために必要な、法令 1 件ぶんの編・章の一覧。
// 文書順に並び、前編・次編・前章・次章の解決に使う。
export interface HeadingLinkEntry {
  // 所属する編の番号。編を持たない法令（日本国憲法など）の章では undefined。
  partNumber?: string;
  // 章番号。編そのものを指すエントリでは undefined。章番号は編ごとにリセットするため、
  // partNumber と組でなければ一意にならない。
  chapterNumber?: string;
  anchorId: string;
}

export const buildHeadingLinkEntries = (nodes: LawNode[]): HeadingLinkEntry[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const topLevelNodes = nodes.filter((node) => node.parentId === undefined);

  return topLevelNodes.flatMap((node) =>
    collectHeadingLinkEntries(node, nodeById, true, undefined),
  );
};

const collectHeadingLinkEntries = (
  node: LawNode,
  nodeById: Map<string, LawNode>,
  isUrlAddressableArticleContext: boolean,
  partNumber: string | undefined,
): HeadingLinkEntry[] => {
  // 附則・別表の中の編・章は本則の編・章を指さないため、リンクの着地先にしない。
  if (!isUrlAddressableArticleContext || node.type === "Article") {
    return [];
  }

  const entry = buildHeadingLinkEntry(node, partNumber);
  const children = node.children
    .map((childId) => nodeById.get(childId))
    .filter((child): child is LawNode => child !== undefined);
  const childContext = computeChildArticleContext(isUrlAddressableArticleContext, node.type);
  const childPartNumber = node.type === "Part" ? (node.number ?? partNumber) : partNumber;

  return [
    ...(entry === undefined ? [] : [entry]),
    ...children.flatMap((child) =>
      collectHeadingLinkEntries(child, nodeById, childContext, childPartNumber),
    ),
  ];
};

const buildHeadingLinkEntry = (
  node: LawNode,
  partNumber: string | undefined,
): HeadingLinkEntry | undefined => {
  if (node.number === undefined) {
    return undefined;
  }

  if (node.type === "Part") {
    return { partNumber: node.number, anchorId: partAnchorId(node.number) };
  }

  if (node.type === "Chapter") {
    return {
      ...(partNumber === undefined ? {} : { partNumber }),
      chapterNumber: node.number,
      anchorId: chapterAnchorId(partNumber, node.number),
    };
  }

  return undefined;
};

// 参照リンクの着地先。項は同じ条の中を指すときだけ載る（条をまたぐ着地は v1 では条単位）。
// lawId があるものは他法令へのリンク。他法令では手元にノードが無いため項・号を検証できず、
// 着地先ページの「指定された条文が見つかりません」を最後の砦にして、そのまま URL へ載せる。
export interface ArticleLinkTarget {
  lawId?: string;
  articleNumber: string;
  paragraphNumber?: string;
  itemNumber?: string;
}

// 編・章の見出しへの着地先。URL は動かさず、ページ内アンカーへ飛ばす（#201 と兼ね合い）。
export interface HeadingLinkTarget {
  anchorId: string;
}

export type ReferenceLinkTarget =
  ({ kind: "article" } & ArticleLinkTarget) | ({ kind: "heading" } & HeadingLinkTarget);

// リンク文字列に差し込む見出し。offset は text 内の挿入位置。
// 「第15条第2項」なら「第15条」の直後に入れて 第15条〈補助開始の審判〉第2項 とする。
export interface ReferenceLinkCaption {
  text: string;
  offset: number;
}

export interface ArticleLinkContext {
  articles: ArticleLinkEntry[];
  headings: HeadingLinkEntry[];
  // 前条・次条・前項の基準となる現在位置。
  currentArticleNumber?: string;
  currentParagraphNumber?: string;
  // 編を伴わない「第2章」を現在の編の中で解決するための祖先文脈。
  // 前編・次編・前章・次章の基準にもなる。
  currentPartNumber?: string;
  currentChapterNumber?: string;
}

export type ReferenceLinkSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; target: ReferenceLinkTarget; caption?: ReferenceLinkCaption };

// alias 辞書は主要法令しか収録しておらず、法令番号の括弧書きも伴わない辞書外の法令名
// （例:「不正競争防止法」）は detectCrossLawSpan でも拾えない。誤ったリンクは無リンクより
// 有害という方針のため、
// 直前 1 文字が法令名・附則・条例の末尾、または既に別の条を指す語（「同条」「当該条」）で
// 終わる場合も抑止する。トレードオフとして「本法第15条」のような正しい自法令参照も
// 抑止されるが、無リンクに倒す。
// 「章」は「国連憲章第7章」のような辞書外の法令名を抑止するために含める。「律」は
// 「…に関する法律」のように「法律」で終わる辞書外の法令名（例:「行政機関の保有する情報の
// 公開に関する法律」）を抑止するために含める。
const lawNameGuardChars = new Set(["法", "令", "則", "例", "律", "章"]);

// 別の条を名指しする語（「同条」「当該条」）と、編を名指しする他法令参照の末尾。
// 法令名の末尾と分けて持つのは、列挙で続く裸の条参照を抑止するかの判断に使うため。
// 「同条」は自法令の条を指すので、続く裸の条参照も自法令の条とみなしてよい。
const sameLawGuardChars = new Set(["条", "編"]);

const precedingGuardChar = (text: string, matchStart: number): string | undefined => {
  if (matchStart === 0) {
    return undefined;
  }

  const char = text[matchStart - 1];

  return lawNameGuardChars.has(char) || sameLawGuardChars.has(char) ? char : undefined;
};

// 条・項の相対シフト（前条・次条・前項・次項）かどうかを判定する。相対シフトは現在位置から
// 一意に解決できるため、文スコープ抑止の対象外にする（裸の数字の項参照とは扱いを分ける）。
const isRelativeShift = (value: string): boolean => value === "previous" || value === "next";

// 条を名指しする参照と、そのあとの裸の項参照とをつなぐ列挙の接続。
// 「第30条第2項及び第3項」のように接続詞・読点だけで並ぶ場合、後半の項は
// 直前に名指しされた条の項を指す。一方「第17条第1項の審判を受けた……に対しては、
// 第1項の期間内に」のように地の文を挟むと、裸の項は現在の条の項へ戻る（issue #204）。
const coordinationGapPattern = /^(?:及び|並びに|又は|若しくは|から|まで|[、・\s])*$/;

// 同参照が指す先の階層。マーカーを増やすときはこの表と本文パターンに足す。
type SameReferenceLevel = "law" | "article" | "paragraph" | "item";

const sameReferenceLevels = new Map<string, SameReferenceLevel>([
  ["同法", "law"],
  ["同条", "article"],
  ["同項", "paragraph"],
  ["同号", "item"],
]);

const sameMarkerLength = 2;

export const segmentReferenceLinks = (
  text: string,
  context: ArticleLinkContext,
): ReferenceLinkSegment[] => {
  const segments: ReferenceLinkSegment[] = [];
  const pattern = new RegExp(bodyReferencePositionPatternSource, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // 同じ文の中で直前に現れた、条を名指しする参照の終端位置。
  // 「第三十条第二項及び第三項」の後半のような、列挙で続く裸の項参照を
  // 現在の条の項として誤解決しないための抑止に使う。
  let articleScopeEndIndex: number | undefined;
  // その条スコープが、現在の法令とは別の法令の条を名指ししていたか。
  // 「商法第798条及び第2条」の後半のような、列挙で続く裸の条参照を
  // 現在の法令の条として誤解決しないための抑止に使う。
  let isArticleScopeCrossLaw = false;
  // 文の境界判定のために見終えたテキストの終端。マッチしなかった箇所も含めて走査する。
  let scannedIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    // 空マッチ保険。理論上起きないが、起きれば無限ループになるため前進させる。
    if (match[0] === "") {
      pattern.lastIndex += 1;
      continue;
    }

    // 文が変われば条のスコープは切れる。リンク化を見送ったマッチも走査済みに含めるため、
    // 以降の continue より前で状態を更新する。
    if (text.slice(scannedIndex, match.index).includes("。")) {
      articleScopeEndIndex = undefined;
      isArticleScopeCrossLaw = false;
    }

    scannedIndex = match.index + match[0].length;

    // 同参照（同法・同条・同項・同号）は先行詞から解決する必要があるため、まだリンクに
    // しない。ここで抑止しないと parseReference が同X を読み飛ばし、「同条第2項」が
    // 現在の条の第2項として誤解決される。
    const sameLevel = sameReferenceLevels.get(match[0].slice(0, sameMarkerLength));

    if (sameLevel !== undefined) {
      // 条を名指しする同参照は、後続の裸の項参照の基準になる。
      // 「同条第1項、第2項」の第2項が現在の条の項へ誤解決しないようスコープを立てる。
      // 同法は直前に名指しした法令を指すため、列挙で続く裸の条もその法令の条とみなす。
      // 同条は自法令の条を指すこともあるため、従来どおり自法令のスコープにする。
      if (sameLevel === "law" || sameLevel === "article") {
        articleScopeEndIndex = scannedIndex;
        isArticleScopeCrossLaw = sameLevel === "law";
      }

      continue;
    }

    const parsed = parseReference(match[0]);

    if (parsed === undefined) {
      continue;
    }

    // 直前の条名指しから、列挙の接続だけでつながっているか。
    const continuesArticleScope =
      articleScopeEndIndex !== undefined &&
      coordinationGapPattern.test(text.slice(articleScopeEndIndex, match.index));

    // 条を名指ししない裸の数字の項参照（第2項）は、列挙で続いていればその条の項を
    // 指している可能性が高い。確信が持てないためリンク化しない。
    // 地の文を挟んだ裸の項参照は現在の条の項を指す起草慣行のため、抑止しない。
    // また前項・次項は常に同じ条の直前・直後の項を指すため、いずれの場合も対象外とする。
    const isSuppressedParagraph =
      parsed.article === undefined &&
      parsed.paragraph !== undefined &&
      !isRelativeShift(parsed.paragraph);

    // 他法令の条に列挙で続く裸の条参照（「商法第798条及び第2条」の第2条）は、
    // その法令の条を指す。現在の法令の条へ解決すると別の条文へ飛ぶため抑止する。
    const isSuppressedArticle =
      isArticleScopeCrossLaw && parsed.article !== undefined && !isRelativeShift(parsed.article);

    const isSuppressedByArticleScope =
      continuesArticleScope && (isSuppressedParagraph || isSuppressedArticle);

    // 条を名指ししていれば、リンクになったかどうかに関わらずスコープを立てる。
    // 抑止した裸の条は列挙の一部なので、他法令というスコープの性質を引き継ぐ。
    if (parsed.article !== undefined) {
      articleScopeEndIndex = scannedIndex;
      isArticleScopeCrossLaw = isSuppressedArticle && continuesArticleScope;
    }

    // 他法令を指す参照は、リンクになったかどうかに関わらず条名指しとしてスコープを立てる。
    // そうしないと「商法第15条第1項及び第2項」の後半の裸の項参照が、
    // 現在の条の項へ誤解決する。
    const crossLawSpan = detectCrossLawSpan(text, match.index, lastIndex);

    if (crossLawSpan !== undefined) {
      articleScopeEndIndex = scannedIndex;
      isArticleScopeCrossLaw = true;

      const crossLawTarget =
        crossLawSpan.lawId === undefined
          ? undefined
          : resolveCrossLawTarget(parsed, crossLawSpan.lawId);

      if (crossLawTarget === undefined) {
        continue;
      }

      if (crossLawSpan.startIndex > lastIndex) {
        segments.push({ kind: "text", text: text.slice(lastIndex, crossLawSpan.startIndex) });
      }

      segments.push({
        kind: "link",
        text: text.slice(crossLawSpan.startIndex, scannedIndex),
        target: crossLawTarget,
      });
      lastIndex = scannedIndex;
      continue;
    }

    // ガード文字（例: 同条）で弾いた参照も、別の条を名指ししているという点では
    // 条名指しと同じ。以降の裸の項参照が現在の条へ誤解決しないようスコープを立てる。
    // 法令名の末尾で弾いた場合は他法令のスコープとして扱い、列挙で続く裸の条も抑止する。
    const guardChar = precedingGuardChar(text, match.index);

    if (guardChar !== undefined) {
      articleScopeEndIndex = scannedIndex;
      isArticleScopeCrossLaw = lawNameGuardChars.has(guardChar);
      continue;
    }

    if (isSuppressedByArticleScope) {
      // 抑止した項も列挙の一部なので、基準を進めておく。
      // そうしないと「第2条第1項、第2項及び第3項」の3つ目が、間に挟まった
      // 「第2項」のせいで列挙と判定されず、現在の条へ誤ってリンクしてしまう。
      articleScopeEndIndex = scannedIndex;
      continue;
    }

    const target = resolveTarget(parsed, context);

    if (target === undefined) {
      continue;
    }

    if (match.index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }

    const caption = buildCaption(match[0], target, context);

    segments.push({
      kind: "link",
      text: match[0],
      target,
      ...(caption === undefined ? {} : { caption }),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return segments;
};

// 参照先の条見出しを、リンク文字列のどこに差し込むかまで含めて決める。
// 現在の条自身への参照（前項など）には付けない。同じ条の見出しを繰り返しても情報がない。
const buildCaption = (
  rawText: string,
  target: ReferenceLinkTarget,
  context: ArticleLinkContext,
): ReferenceLinkCaption | undefined => {
  // 編・章の見出しは「第四編（親族）」のように番号と名称が一体で、本文側も
  // 「第4編（親族）」と名称を伴うことが多い。差し込むと重複するため付けない。
  if (target.kind === "heading") {
    return undefined;
  }

  // 他法令の条には、条番号が偶然一致しただけの自法令の見出しが付いてしまうため付けない。
  if (target.lawId !== undefined) {
    return undefined;
  }

  if (target.articleNumber === context.currentArticleNumber) {
    return undefined;
  }

  const caption = context.articles.find(
    (entry) => entry.articleNumber === target.articleNumber,
  )?.caption;

  if (caption === undefined) {
    return undefined;
  }

  const articleSpan = referenceArticleSpanPattern.exec(rawText);

  return { text: caption, offset: articleSpan === null ? rawText.length : articleSpan[0].length };
};

// 他法令の条・項・号は手元にノードが無いため検証しない。存在しない条・項へ着地しても
// 着地先ページが「指定された条文が見つかりません」を出すため、そのまま URL へ載せる。
const resolveCrossLawTarget = (
  parsed: ParsedReference,
  lawId: string,
): ReferenceLinkTarget | undefined => {
  // 前条・次条・前項・次項は現在位置が基準のため、他法令では解決できない。
  // 条を伴わない参照（項・号だけ、編・章だけ）も他法令では着地先が決まらない。
  if (parsed.article === undefined || isRelativeShift(parsed.article)) {
    return undefined;
  }

  if (parsed.paragraph !== undefined && isRelativeShift(parsed.paragraph)) {
    return undefined;
  }

  return {
    kind: "article",
    lawId,
    articleNumber: parsed.article,
    ...(parsed.paragraph === undefined ? {} : { paragraphNumber: parsed.paragraph }),
    ...(parsed.item === undefined ? {} : { itemNumber: parsed.item }),
  };
};

const resolveTarget = (
  parsed: ParsedReference,
  context: ArticleLinkContext,
): ReferenceLinkTarget | undefined => {
  // 法令名を伴う参照は他法令を指すため、同一法令内リンクの対象外。
  if (parsed.kind === "absolute") {
    return undefined;
  }

  // 「第四編第二章第七百二十五条」のように条まで名指しする参照は、編・章を絞り込みの
  // 文脈として使うだけで着地先は条になる。編・章だけの参照のときに見出しへ着地させる。
  if (parsed.article === undefined && (parsed.part !== undefined || parsed.chapter !== undefined)) {
    return resolveHeadingTarget(parsed, context);
  }

  const articleNumber = resolveArticleNumber(parsed, context);

  if (articleNumber === undefined) {
    return undefined;
  }

  const entry = context.articles.find((candidate) => candidate.articleNumber === articleNumber);

  if (entry === undefined) {
    return undefined;
  }

  if (parsed.paragraph === undefined) {
    // 条も項も伴わない参照（号のみ）と、現在の条自身への参照は、
    // 着地先が現在位置と同じになり動かないリンクが残るためリンク化しない。
    return parsed.article === undefined || articleNumber === context.currentArticleNumber
      ? undefined
      : { kind: "article", articleNumber };
  }

  // 存在しない項への着地を避けるため、項番号は条をまたぐ場合も必ず検証する。
  const paragraphNumber = resolveParagraphNumber(parsed.paragraph, entry, context);

  if (paragraphNumber === undefined) {
    return undefined;
  }

  // v1 では条をまたぐ着地は条単位とし、項アンカーは同一条内のページ内リンクにだけ載せる。
  // 他の条の項を項アンカーで返すと、ページ内リンクになって URL も現在位置も動かない。
  if (articleNumber !== context.currentArticleNumber) {
    return { kind: "article", articleNumber };
  }

  // 着地先が現在位置そのものになるリンクは、押しても動かないため作らない。
  return paragraphNumber === context.currentParagraphNumber
    ? undefined
    : { kind: "article", articleNumber, paragraphNumber };
};

// 編・章の参照を見出しアンカーへ解決する。該当する見出しが無ければリンク化しない。
const resolveHeadingTarget = (
  parsed: ParsedReference,
  context: ArticleLinkContext,
): ReferenceLinkTarget | undefined => {
  const entry =
    parsed.chapter === undefined
      ? resolvePartEntry(parsed.part, context)
      : resolveChapterEntry(parsed, context);

  return entry === undefined ? undefined : { kind: "heading", anchorId: entry.anchorId };
};

const partEntries = (context: ArticleLinkContext): HeadingLinkEntry[] =>
  context.headings.filter((entry) => entry.chapterNumber === undefined);

const chapterEntries = (context: ArticleLinkContext): HeadingLinkEntry[] =>
  context.headings.filter((entry) => entry.chapterNumber !== undefined);

const resolvePartEntry = (
  part: string | undefined,
  context: ArticleLinkContext,
): HeadingLinkEntry | undefined => {
  if (part === undefined) {
    return undefined;
  }

  const entries = partEntries(context);

  if (part !== "previous" && part !== "next") {
    return entries.find((entry) => entry.partNumber === part);
  }

  return shiftEntry(entries, (entry) => entry.partNumber === context.currentPartNumber, part);
};

const resolveChapterEntry = (
  parsed: ParsedReference,
  context: ArticleLinkContext,
): HeadingLinkEntry | undefined => {
  const entries = chapterEntries(context);

  if (parsed.chapter === "previous" || parsed.chapter === "next") {
    // 前章・次章は文書順で隣接する章を指す。編の境界をまたぐ場合も文書順で自然に繋がる。
    return shiftEntry(
      entries,
      (entry) =>
        entry.partNumber === context.currentPartNumber &&
        entry.chapterNumber === context.currentChapterNumber,
      parsed.chapter,
    );
  }

  // 編を名指ししていればその編の章、していなければ現在の編の章を指す。
  // 編を持たない法令ではどちらも undefined で一致する。
  const partNumber =
    parsed.part === undefined
      ? context.currentPartNumber
      : resolvePartEntry(parsed.part, context)?.partNumber;

  if (parsed.part !== undefined && partNumber === undefined) {
    return undefined; // 名指しされた編が存在しない
  }

  return entries.find(
    (entry) => entry.partNumber === partNumber && entry.chapterNumber === parsed.chapter,
  );
};

// 文書順の見出し配列で、現在位置の前後の見出しを返す。
const shiftEntry = (
  entries: HeadingLinkEntry[],
  isCurrent: (entry: HeadingLinkEntry) => boolean,
  shift: "previous" | "next",
): HeadingLinkEntry | undefined => {
  const index = entries.findIndex(isCurrent);

  if (index < 0) {
    return undefined;
  }

  return entries[index + (shift === "previous" ? -1 : 1)];
};

const resolveArticleNumber = (
  parsed: ParsedReference,
  context: ArticleLinkContext,
): string | undefined => {
  // 条を伴わない項参照（前項・第2項）は現在の条の中を指す。
  if (parsed.article === undefined) {
    return context.currentArticleNumber;
  }

  if (parsed.article !== "previous" && parsed.article !== "next") {
    // parsed.article はパーサーの表記（ハイフン連結）。articles 側の表記が
    // アンダースコアでも一致するよう正規化して突き合わせ、見つかった場合は
    // articles 側のエントリが持つアプリ正準表記を返す（parsed.article をそのまま
    // 返すと、アンダースコア表記の条でアンカー id・URL が着地しなくなる）。
    const normalizedTarget = normalizeArticleNumberForLookup(parsed.article);
    const entry = context.articles.find(
      (candidate) => normalizeArticleNumberForLookup(candidate.articleNumber) === normalizedTarget,
    );

    return entry?.articleNumber;
  }

  if (context.currentArticleNumber === undefined) {
    return undefined;
  }

  const index = context.articles.findIndex(
    (entry) => entry.articleNumber === context.currentArticleNumber,
  );

  if (index < 0) {
    return undefined;
  }

  return context.articles[index + (parsed.article === "previous" ? -1 : 1)]?.articleNumber;
};

const resolveParagraphNumber = (
  paragraph: string,
  entry: ArticleLinkEntry,
  context: ArticleLinkContext,
): string | undefined => {
  if (!isRelativeShift(paragraph)) {
    return entry.paragraphNumbers.includes(paragraph) ? paragraph : undefined;
  }

  if (context.currentParagraphNumber === undefined) {
    return undefined;
  }

  const index = entry.paragraphNumbers.indexOf(context.currentParagraphNumber);

  if (index < 0) {
    return undefined;
  }

  return entry.paragraphNumbers[index + (paragraph === "previous" ? -1 : 1)];
};
