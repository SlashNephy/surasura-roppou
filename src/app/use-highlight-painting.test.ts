import type { Annotation, LawNode } from "@/core/domain";
import { afterEach, describe, expect, it } from "vitest";

import { buildPaintedRanges } from "./use-highlight-painting";

afterEach(() => {
  document.body.innerHTML = "";
});

const target = { lawId: "L", path: "Article:1/Paragraph:1" };
const lawNodeId = "L:R:Article:1/Paragraph:1";

const nodes = [
  {
    id: lawNodeId,
    path: "Article:1/Paragraph:1",
    plainText: "私権は、公共の福祉に適合しなければならない。",
  },
] as unknown as LawNode[];

const annotation = (id: string, quote: string): Annotation => ({
  id,
  target,
  anchors: [{ target, quote, prefix: "", suffix: "" }],
  color: "yellow",
  tags: [],
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
});

const mount = (text: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = `<span data-law-node-id="${lawNodeId}">${text}</span>`;
  document.body.append(host);

  return host;
};

describe("buildPaintedRanges", () => {
  it("表示文字列が plainText と同じとき正しい位置に Range を作る", () => {
    const host = mount("私権は、公共の福祉に適合しなければならない。");
    const painted = buildPaintedRanges(host, nodes, [annotation("h1", "公共の福祉")]);

    expect(painted).toHaveLength(1);
    expect(painted[0].range.toString()).toBe("公共の福祉");
    expect(painted[0].annotationId).toBe("h1");
  });

  it("readable 変換で文字数が変わっても正しい位置に Range を作る", () => {
    const readableNodes = [
      { ...nodes[0], plainText: "第三条の規定により、公共の福祉に適合する。" },
    ] as unknown as LawNode[];
    const host = mount("第3条の規定により、公共の福祉に適合する。");
    const painted = buildPaintedRanges(host, readableNodes, [annotation("h1", "公共の福祉")]);

    expect(painted[0].range.toString()).toBe("公共の福祉");
  });

  it("readable 変換をまたぐ引用文は過半数の文字が残っていれば描画する", () => {
    const readableNodes = [
      { ...nodes[0], plainText: "第三条の規定により、公共の福祉に適合する。" },
    ] as unknown as LawNode[];
    const host = mount("第3条の規定により、公共の福祉に適合する。");
    const painted = buildPaintedRanges(host, readableNodes, [annotation("h1", "第三条の規定")]);

    expect(painted[0].range.toString()).toBe("第3条の規定");
  });

  it("色を持たない注釈は描画しない", () => {
    const host = mount("私権は、公共の福祉に適合しなければならない。");
    const noteOnly = { ...annotation("h1", "公共の福祉"), color: undefined } as Annotation;

    expect(buildPaintedRanges(host, nodes, [noteOnly])).toEqual([]);
  });

  it("引用文が見つからない注釈は描画しない", () => {
    const host = mount("まったく別の条文になった。");

    expect(buildPaintedRanges(host, nodes, [annotation("h1", "公共の福祉")])).toEqual([]);
  });

  it("対応する DOM 要素が無ければ描画しない", () => {
    const host = document.createElement("div");
    document.body.append(host);

    expect(buildPaintedRanges(host, nodes, [annotation("h1", "公共の福祉")])).toEqual([]);
  });
});
