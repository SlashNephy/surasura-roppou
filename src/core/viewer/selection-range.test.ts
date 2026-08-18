import { afterEach, describe, expect, it } from "vitest";

import {
  createNodeTextRange,
  displayTextOf,
  findLawNodeElement,
  resolveNodeTextRange,
} from "./selection-range";

afterEach(() => {
  document.body.innerHTML = "";
});

const setup = (html: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);

  return host;
};

const elementOf = (host: HTMLElement, selector: string): Element => {
  const element = host.querySelector(selector);

  if (element === null) {
    throw new Error(`element is required: ${selector}`);
  }

  return element;
};

// 文書順 index 番目のテキストノード（<rt> の読みも数える）を取る。
// 選択の端点は読みの上にも置けるため、走査対象外のノードも指定できる必要がある。
const textNodeAt = (root: Element, index: number): Text => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();

  for (let position = 0; position < index; position += 1) {
    current = walker.nextNode();
  }

  if (current === null) {
    throw new Error(`text node is required: ${String(index)}`);
  }

  return current as Text;
};

const rangeOf = (start: [Node, number], end: [Node, number]): Range => {
  const range = document.createRange();
  range.setStart(start[0], start[1]);
  range.setEnd(end[0], end[1]);

  return range;
};

// 地の文だけの本文。
const plainHtml = '<p><span data-law-node-id="n1">私権は、公共の福祉に適合する。</span></p>';

// ルビが 1 語だけ入る本文。
// 表示文字列は「運送品が瑕疵によって滅失し」で、テキストノードは
// 「運送品が」(0-4) / 「瑕疵」(4-6) / 「かし」(rt, 対象外) / 「によって滅失し」(6-13) に割れる。
const singleRubyHtml =
  '<p><span data-law-node-id="n1">運送品が<ruby>瑕疵<rt>かし</rt></ruby>によって滅失し</span></p>';

// ルビ 2 語と参照リンクが同居する本文。
// 表示文字列は「瑕疵ある第15条の抗弁。」で、
// 「瑕疵」(0-2) / 「かし」(rt) / 「ある」(2-4) / 「第15条」(4-8, <a> の中) /
// 「の」(8-9) / 「抗弁」(9-11) / 「こうべん」(rt) / 「。」(11-12) に割れる。
const rubyAndLinkHtml =
  '<p><span data-law-node-id="n1"><ruby>瑕疵<rt>かし</rt></ruby>ある<a href="/laws/x/articles/15">第15条</a>の<ruby>抗弁<rt>こうべん</rt></ruby>。</span></p>';

describe("displayTextOf", () => {
  it("ルビの読みを除いた表示文字列を返す", () => {
    const host = setup(rubyAndLinkHtml);
    const owner = elementOf(host, "[data-law-node-id]");

    expect(owner.textContent).toBe("瑕疵かしある第15条の抗弁こうべん。");
    expect(displayTextOf(owner)).toBe("瑕疵ある第15条の抗弁。");
  });
});

describe("resolveNodeTextRange", () => {
  it("単一のテキストノードに収まる選択を返す", () => {
    const host = setup(plainHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    const text = textNodeAt(owner, 0);

    expect(resolveNodeTextRange(rangeOf([text, 4], [text, 8]))).toEqual({
      lawNodeId: "n1",
      start: 4,
      end: 8,
      text: "私権は、公共の福祉に適合する。",
    });
  });

  it("折りたたみ選択は undefined", () => {
    const host = setup(plainHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    const text = textNodeAt(owner, 0);

    expect(resolveNodeTextRange(rangeOf([text, 2], [text, 2]))).toBeUndefined();
  });

  it("隣り合うテキストノードの境界どうしの選択は、長さ 0 なので undefined", () => {
    const host = setup(singleRubyHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    // 「運送品が」の末尾と「瑕疵」の先頭。ノードが違うので Range は collapsed ではないが、
    // 表示文字列の上ではどちらも 4 で、選択された文字は無い。
    const range = rangeOf([textNodeAt(owner, 0), 4], [textNodeAt(owner, 1), 0]);

    expect(range.collapsed).toBe(false);
    expect(resolveNodeTextRange(range)).toBeUndefined();
  });

  it("本文要素の外側から始まる選択は undefined", () => {
    const host = setup(
      '<p><span class="marker">２</span><span data-law-node-id="n1">あいうえお</span></p>',
    );
    const marker = elementOf(host, ".marker");
    const owner = elementOf(host, "[data-law-node-id]");

    expect(
      resolveNodeTextRange(rangeOf([textNodeAt(marker, 0), 0], [textNodeAt(owner, 0), 3])),
    ).toBeUndefined();
  });

  it("2 つの本文要素にまたがる選択は undefined", () => {
    const host = setup(
      '<p><span data-law-node-id="n1">あいう</span><span data-law-node-id="n2">かきく</span></p>',
    );
    const [first, second] = [...host.querySelectorAll("[data-law-node-id]")];

    expect(
      resolveNodeTextRange(rangeOf([textNodeAt(first, 0), 0], [textNodeAt(second, 0), 2])),
    ).toBeUndefined();
  });

  it("ルビをまたぐ選択を表示文字列の位置へ写す", () => {
    const host = setup(singleRubyHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    // 「運送品が」の 2 文字目から、「によって滅失し」の 1 文字目まで。
    const range = rangeOf([textNodeAt(owner, 0), 2], [textNodeAt(owner, 3), 1]);

    expect(resolveNodeTextRange(range)).toEqual({
      lawNodeId: "n1",
      start: 2,
      end: 7,
      text: "運送品が瑕疵によって滅失し",
    });
  });

  it("ルビの読みの中だけの選択は、その語の全体を指す", () => {
    const host = setup(singleRubyHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    const reading = textNodeAt(owner, 2);

    expect(resolveNodeTextRange(rangeOf([reading, 0], [reading, 2]))).toMatchObject({
      start: 4,
      end: 6,
    });
  });

  it("ルビの読みから地の文へ抜ける選択は、その語の先頭から始まる", () => {
    const host = setup(singleRubyHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    const range = rangeOf([textNodeAt(owner, 2), 1], [textNodeAt(owner, 3), 1]);

    expect(resolveNodeTextRange(range)).toMatchObject({ start: 4, end: 7 });
  });

  it("端点が要素ノードでも表示文字列の位置へ写す", () => {
    const host = setup(singleRubyHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    // 子 index 1 は <ruby>。その直前、つまり表示文字列の 4 を指す。
    const range = rangeOf([owner, 1], [textNodeAt(owner, 3), 2]);

    expect(resolveNodeTextRange(range)).toMatchObject({ start: 4, end: 8 });
  });

  it("参照リンクとルビ 2 語で分割された本文をまたぐ選択を写す", () => {
    const host = setup(rubyAndLinkHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    // 「ある」の 2 文字目から「の」の直後まで。
    const range = rangeOf([textNodeAt(owner, 2), 1], [textNodeAt(owner, 4), 1]);

    expect(resolveNodeTextRange(range)).toEqual({
      lawNodeId: "n1",
      start: 3,
      end: 9,
      text: "瑕疵ある第15条の抗弁。",
    });
  });

  it("本文要素の全体を覆う選択は表示文字列の全長になる", () => {
    const host = setup(rubyAndLinkHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    const range = rangeOf([textNodeAt(owner, 0), 0], [textNodeAt(owner, 7), 1]);

    expect(resolveNodeTextRange(range)).toMatchObject({ start: 0, end: 12 });
  });
});

describe("createNodeTextRange", () => {
  it("表示文字列の位置から Range を作る", () => {
    const host = setup(singleRubyHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    const range = createNodeTextRange(owner, 2, 7);

    expect(range?.startContainer).toBe(textNodeAt(owner, 0));
    expect(range?.startOffset).toBe(2);
    expect(range?.endContainer).toBe(textNodeAt(owner, 3));
    expect(range?.endOffset).toBe(1);
  });

  it("作った Range を解決すると元の位置に戻る", () => {
    const host = setup(rubyAndLinkHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    const range = createNodeTextRange(owner, 4, 8);

    if (range === undefined) {
      throw new Error("range is required");
    }

    expect(resolveNodeTextRange(range)).toMatchObject({ start: 4, end: 8 });
  });

  it("ノード境界ちょうどの終端は手前のノードの末尾を指す", () => {
    const host = setup(singleRubyHtml);
    const owner = elementOf(host, "[data-law-node-id]");
    const range = createNodeTextRange(owner, 0, 4);

    expect(range?.endContainer).toBe(textNodeAt(owner, 0));
    expect(range?.endOffset).toBe(4);
  });

  it("表示文字列の範囲外や空範囲は undefined", () => {
    const host = setup(singleRubyHtml);
    const owner = elementOf(host, "[data-law-node-id]");

    expect(createNodeTextRange(owner, 0, 14)).toBeUndefined();
    expect(createNodeTextRange(owner, -1, 3)).toBeUndefined();
    expect(createNodeTextRange(owner, 3, 3)).toBeUndefined();
  });
});

describe("findLawNodeElement", () => {
  it("記号を含む法令ノード ID でも要素を引ける", () => {
    const host = setup(
      '<p><span data-law-node-id="article:16/paragraph:1">あ</span><span data-law-node-id="article:16/paragraph:2">い</span></p>',
    );

    expect(findLawNodeElement(host, "article:16/paragraph:2")?.textContent).toBe("い");
  });

  it("見つからなければ undefined", () => {
    const host = setup('<p><span data-law-node-id="n1">あ</span></p>');

    expect(findLawNodeElement(host, "n2")).toBeUndefined();
  });
});
