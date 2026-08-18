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
    const text = node as Text;

    if (findRubyTextElement(text, owner) === undefined) {
      texts.push(text);
    }
  }

  return texts;
};

export const displayTextOf = (owner: Element): string =>
  collectDisplayTextNodes(owner)
    .map((text) => text.data)
    .join("");

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

// 選択が単一の本文要素に収まるときだけ、表示文字列上の範囲を返す。
// 項番号の marker span や複数の本文要素にまたがる選択は扱わない（v1 のスコープ）。
export const resolveNodeTextRange = (range: Range): NodeTextRange | undefined => {
  const owner = findOwner(range.startContainer);

  if (owner === undefined || owner !== findOwner(range.endContainer)) {
    return undefined;
  }

  const lawNodeId = owner.dataset.lawNodeId;

  if (lawNodeId === undefined) {
    return undefined;
  }

  const texts = collectDisplayTextNodes(owner);
  const start = toDisplayOffset(owner, texts, range.startContainer, range.startOffset, "start");
  const end = toDisplayOffset(owner, texts, range.endContainer, range.endOffset, "end");

  // 端点が別ノードでも表示文字列の上では同じ位置になることがある（ノード境界どうしの選択）。
  // その場合 Range は collapsed でないが選択された文字は無いので、範囲として扱わない。
  if (start === undefined || end === undefined || start >= end) {
    return undefined;
  }

  return {
    lawNodeId,
    start,
    end,
    text: texts.map((text) => text.data).join(""),
  };
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
