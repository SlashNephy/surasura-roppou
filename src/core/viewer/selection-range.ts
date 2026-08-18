// LawNodeList.tsx が本文を描画する 4 箇所（子を持たない条の p / 条直下の項の span /
// それ以外の項・号の span / 見出しノードの前文の p）に直書きしている属性名と同期している。
// JSX の属性名に定数は使えないため、片方だけ変えないよう注意する。
export const lawNodeIdAttribute = "data-law-node-id";

export interface NodeTextRange {
  lawNodeId: string;
  start: number;
  end: number;
  // 要素に描画されている文字列。plainText への変換に使う。
  text: string;
}

// 本文要素の子は単一のテキストノードとは限らない。条文参照は <a> に、
// ルビ対象語は <ruby><rt> に分割されるため、実データでは複数ノードに割れるのが普通である。
// そこで本文要素配下のテキストノードを文書順に並べ、その連結を表示文字列として扱う。
// <rt>（ルビの読み）は表示文字列に含まれないので走査から除く。
export const collectDisplayTextNodes = (owner: Element): Text[] => {
  const walker = owner.ownerDocument.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof Text && findRubyTextElement(node, owner) === undefined) {
      texts.push(node);
    }
  }

  return texts;
};

export const displayTextOf = (owner: Element): string =>
  joinTextData(collectDisplayTextNodes(owner));

const joinTextData = (texts: Text[]): string => texts.map((text) => text.data).join("");

export const findLawNodeElement = (
  root: ParentNode,
  lawNodeId: string,
): HTMLElement | undefined => {
  // 法令ノード ID は `article:16/paragraph:1` のように記号を含むため、
  // 属性値セレクタでの照合を避けて走査で突き合わせる。
  for (const element of root.querySelectorAll(`[${lawNodeIdAttribute}]`)) {
    if (element instanceof HTMLElement && element.dataset.lawNodeId === lawNodeId) {
      return element;
    }
  }

  return undefined;
};

// 選択を、ちょうど 1 つの本文要素の表示文字列上の範囲へ写す。
// 端点は本文要素の外に出ることがある（項番号 marker span からのドラッグ開始、
// 行末を越えたドラッグ、段落のトリプルクリック）ため、次の 3 通りを扱う。
//
// 1. 両端点が同じ本文要素の内側 … その範囲をそのまま返す。
// 2. 一方の端点だけが内側 … もう一方を [0, 表示文字数] へ丸める。
// 3. 両端点とも外側 … 丸ごと含む本文要素がちょうど 1 つならその全体を返す。
//
// 複数の本文要素にまたがる選択は扱わない。両端点が別々の本文要素の内側にあるとき、
// 2 の丸めが他の本文要素を丸ごと巻き込むとき、3 で該当が 0 個または 2 つ以上のときは、
// いずれも undefined を返す。長さ 0 に潰れる選択も undefined になる。
export const resolveNodeTextRange = (range: Range): NodeTextRange | undefined => {
  const target = findRangeTarget(range);

  if (target === undefined) {
    return undefined;
  }

  const { covered, owner } = target;
  const lawNodeId = owner.dataset.lawNodeId;

  if (lawNodeId === undefined) {
    return undefined;
  }

  const texts = collectDisplayTextNodes(owner);
  const text = joinTextData(texts);
  // 包み込みで選ばれた本文要素は、端点がどちらもその外にあり位置を写せない。全体を採る。
  const start = covered
    ? 0
    : toDisplayOffset(owner, texts, range.startContainer, range.startOffset, "start");
  const end = covered
    ? text.length
    : toDisplayOffset(owner, texts, range.endContainer, range.endOffset, "end");

  // 端点が別ノードでも表示文字列の上では同じ位置になることがある（ノード境界どうしの選択）。
  // その場合 Range は collapsed でないが選択された文字は無いので、範囲として扱わない。
  if (start === undefined || end === undefined || start >= end) {
    return undefined;
  }

  return { lawNodeId, start, end, text };
};

// 表示文字列上の範囲から DOM の Range を作る。ハイライトの描画で使う。
// 表示文字列に収まらない範囲は、丸めずに undefined を返す。
// 条文の改訂などで位置がずれたことを呼び出し側が検知できるようにするためである。
export const createNodeTextRange = (
  owner: Element,
  start: number,
  end: number,
): Range | undefined => {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end) {
    return undefined;
  }

  const texts = collectDisplayTextNodes(owner);
  const startPoint = toNodePoint(texts, start, "start");
  const endPoint = toNodePoint(texts, end, "end");

  if (startPoint === undefined || endPoint === undefined) {
    return undefined;
  }

  const range = owner.ownerDocument.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);

  return range;
};

interface RangeTarget {
  owner: HTMLElement;
  // 端点がどちらも本文要素の外にあり、Range がその要素を丸ごと包んでいる場合。
  covered: boolean;
}

// 選択が指す本文要素を決める。
// 片方の端点だけが本文要素の外に出る選択（行末を越えたドラッグ、項番号 span からの
// ドラッグ開始）は、ブラウザが親 <p> の中に端点を作るため実際に頻出する。
// これを捨てると選択が黙って無視されるので、内側にある端点の本文要素を採る。
// 外に出た端点の丸めは toDisplayOffset の走査が兼ねる。走査は本文要素配下の
// テキストノードしか見ないため、その前にある端点は 0、後ろにある端点は全長になる。
// Range は始点が終点より前という不変条件を持つので、丸め先は端点の前後関係と一致する。
// 両端が別々の本文要素の内側にあるときは、どの本文を指すか決まらないので扱わない。
const findRangeTarget = (range: Range): RangeTarget | undefined => {
  const startOwner = findOwner(range.startContainer);
  const endOwner = findOwner(range.endContainer);

  if (startOwner !== undefined && endOwner !== undefined) {
    return startOwner === endOwner ? { covered: false, owner: startOwner } : undefined;
  }

  const owner = startOwner ?? endOwner;

  if (owner !== undefined) {
    // 丸めが他の本文要素を丸ごと巻き込むなら、複数の本文にまたがる選択である。
    // 巻き込んだ先の本文の内側で離したときだけ undefined になる、という不連続を避ける。
    return findCoveredElements(range, { excluded: owner, limit: 1 }).length === 0
      ? { covered: false, owner }
      : undefined;
  }

  // 両端が外側でも、段落のトリプルクリックのように本文要素を丸ごと包む選択は起きる。
  // 包んだ本文要素がちょうど 1 つに定まるときだけ、その全体を選択として扱う。
  const covered = findCoveredElements(range, { limit: 2 });

  return covered.length === 1 ? { covered: true, owner: covered[0] } : undefined;
};

// Range が丸ごと含む本文要素を、結論が決まる個数（limit）まで集める。
// 法令全体を選択したときは候補が全条文になるうえ、ドラッグ中は選択が変わるたびに
// ここを通るため、判定に要る分を超えて走査しない。
const findCoveredElements = (
  range: Range,
  { excluded, limit }: { excluded?: HTMLElement; limit: number },
): HTMLElement[] => {
  const container = range.commonAncestorContainer;
  const scope = container instanceof Element ? container : container.parentElement;

  if (scope === null) {
    return [];
  }

  const covered: HTMLElement[] = [];

  for (const element of scope.querySelectorAll<HTMLElement>(`[${lawNodeIdAttribute}]`)) {
    if (element === excluded || !containsEntirely(range, element)) {
      continue;
    }

    covered.push(element);

    if (covered.length >= limit) {
      break;
    }
  }

  return covered;
};

// 要素を丸ごと包んでいるか。Range.intersectsNode は部分的な重なりでも true になるため使えない。
// 選択の両境界が要素の両境界の外側（または同位置）にあることを直接見る。
const containsEntirely = (range: Range, element: Element): boolean => {
  const elementRange = element.ownerDocument.createRange();
  elementRange.selectNode(element);

  return (
    range.compareBoundaryPoints(Range.START_TO_START, elementRange) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, elementRange) >= 0
  );
};

const findOwner = (node: Node | null): HTMLElement | undefined => {
  const element = node instanceof Element ? node : (node?.parentElement ?? null);

  if (element === null) {
    return undefined;
  }

  return element.closest<HTMLElement>(`[${lawNodeIdAttribute}]`) ?? undefined;
};

// node が本文要素配下のルビの読みに含まれるなら、その <rt> を返す。
const findRubyTextElement = (node: Node, owner: Element): Element | undefined => {
  for (
    let element = node instanceof Element ? node : node.parentElement;
    element !== null && element !== owner;
    element = element.parentElement
  ) {
    if (element.tagName === "RT") {
      return element;
    }
  }

  return undefined;
};

type OffsetBias = "start" | "end";

// 選択の端点 (ノード, ノード内オフセット) を表示文字列の位置へ写す。
const toDisplayOffset = (
  owner: Element,
  texts: Text[],
  container: Node,
  offset: number,
  bias: OffsetBias,
): number | undefined => {
  const point = normalizeRubyPoint(owner, container, offset, bias);

  if (point === undefined) {
    return undefined;
  }

  const probe = owner.ownerDocument.createRange();
  probe.setStart(point.container, point.offset);
  probe.collapse(true);

  let consumed = 0;

  for (const text of texts) {
    if (text === point.container) {
      return consumed + point.offset;
    }

    // このテキストノードの先頭が端点より後ろなら、端点はここまでの文字数の位置にある。
    if (probe.comparePoint(text, 0) === 1) {
      return consumed;
    }

    consumed += text.data.length;
  }

  return consumed;
};

// ルビの読みの上に落ちた端点は、その語（<ruby>）の外側の境界へ寄せる。
// 読みは表示文字列に無いため、始点は語の先頭、終点は語の末尾として扱い、
// 読みをなぞった選択がその語全体を指すようにする。
const normalizeRubyPoint = (
  owner: Element,
  container: Node,
  offset: number,
  bias: OffsetBias,
): { container: Node; offset: number } | undefined => {
  const rubyText = findRubyTextElement(container, owner);

  if (rubyText === undefined) {
    return { container, offset };
  }

  const ruby = rubyText.parentElement;

  if (ruby === null) {
    return undefined;
  }

  return bias === "start"
    ? { container: ruby, offset: 0 }
    : { container: ruby, offset: ruby.childNodes.length };
};

// 表示文字列の位置を (テキストノード, ノード内オフセット) へ写す。
// ノード境界ちょうどの位置は、始点なら後ろのノードの先頭、終点なら手前のノードの末尾を選ぶ。
// 選択が空ノードを跨いで見えなくなるのを避けるためである。
const toNodePoint = (
  texts: Text[],
  offset: number,
  bias: OffsetBias,
): { node: Text; offset: number } | undefined => {
  let consumed = 0;

  for (const text of texts) {
    const next = consumed + text.data.length;

    if (bias === "start" ? offset < next : offset <= next) {
      return { node: text, offset: offset - consumed };
    }

    consumed = next;
  }

  return undefined;
};
