import { describe, expect, it } from "vitest";

import type { LawNode, LawNodeType } from "@/core/domain";

import { buildSearchableText, isSearchableNode } from "./searchable-node";

// テスト用の LawNode を作る。省略した optional（title / caption）は
// 条件付きスプレッドで付与せず、exactOptionalPropertyTypes を守る。
const node = (parts: {
  type?: LawNodeType;
  title?: string | undefined;
  caption?: string | undefined;
  plainText?: string;
}): LawNode => ({
  id: "L1:R1:node:1",
  lawId: "L1",
  revisionId: "R1",
  type: parts.type ?? "Article",
  path: "node:1",
  rawText: parts.plainText ?? "本文",
  plainText: parts.plainText ?? "本文",
  children: [],
  ...(parts.title === undefined ? {} : { title: parts.title }),
  ...(parts.caption === undefined ? {} : { caption: parts.caption }),
});

describe("isSearchableNode", () => {
  it.each([
    { name: "条は索引対象", type: "Article", expected: true },
    { name: "附則は索引対象", type: "SupplementaryProvision", expected: true },
    { name: "別表は索引対象", type: "AppdxTable", expected: true },
    { name: "別記様式は索引対象", type: "AppdxStyle", expected: true },
    { name: "項は索引対象外（条の plainText に含まれる）", type: "Paragraph", expected: false },
    { name: "号は索引対象外", type: "Item", expected: false },
    { name: "章は索引対象外", type: "Chapter", expected: false },
    { name: "編は索引対象外", type: "Part", expected: false },
  ] satisfies { name: string; type: LawNodeType; expected: boolean }[])(
    "$name",
    ({ type, expected }) => {
      expect(isSearchableNode(node({ type }))).toBe(expected);
    },
  );
});

describe("buildSearchableText", () => {
  it.each([
    {
      name: "見出し・かっこ書き・本文を半角スペースで連結する",
      title: "第一条",
      caption: "（目的）",
      plainText: "この法律は基本理念を定める",
      expected: "第一条 （目的） この法律は基本理念を定める",
    },
    {
      name: "本文のみのときは本文だけを返す",
      plainText: "この法律は基本理念を定める",
      expected: "この法律は基本理念を定める",
    },
    {
      name: "かっこ書きが無ければ見出しと本文を連結する",
      title: "第一条",
      plainText: "この法律は基本理念を定める",
      expected: "第一条 この法律は基本理念を定める",
    },
    {
      name: "空文字の要素は連結から除外する",
      title: "",
      caption: "（目的）",
      plainText: "この法律は基本理念を定める",
      expected: "（目的） この法律は基本理念を定める",
    },
  ] satisfies {
    name: string;
    title?: string;
    caption?: string;
    plainText: string;
    expected: string;
  }[])("$name", ({ title, caption, plainText, expected }) => {
    expect(buildSearchableText(node({ title, caption, plainText }))).toBe(expected);
  });
});
