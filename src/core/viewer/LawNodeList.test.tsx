import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";

import { LawNodeList } from "./LawNodeList";

const node = (overrides: Partial<LawNode> & Pick<LawNode, "id" | "path" | "type">): LawNode => ({
  lawId: "129AC0000000089",
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  rawText: "",
  plainText: "",
  children: [],
  ...overrides,
});

const nodes: LawNode[] = [
  node({
    id: "part:1",
    type: "Part",
    path: "part:1",
    number: "1",
    title: "第一編　総則",
    plainText: "第一編　総則 第一章　通則 第一条 私権は、公共の福祉に適合しなければならない。",
    children: ["chapter:1"],
  }),
  node({
    id: "chapter:1",
    type: "Chapter",
    path: "part:1/chapter:1",
    number: "1",
    title: "第一章　通則",
    plainText: "第一章　通則 第一条 私権は、公共の福祉に適合しなければならない。",
    children: ["article:1"],
    parentId: "part:1",
  }),
  node({
    id: "article:1",
    type: "Article",
    path: "part:1/chapter:1/article:1",
    number: "1",
    title: "第一条",
    plainText: "第一条 私権は、公共の福祉に適合しなければならない。 一 第一号の本文。",
    children: ["paragraph:1"],
    parentId: "chapter:1",
  }),
  node({
    id: "paragraph:1",
    type: "Paragraph",
    path: "part:1/chapter:1/article:1/paragraph:1",
    number: "1",
    plainText: "私権は、公共の福祉に適合しなければならない。 一 第一号の本文。",
    children: ["item:1"],
    parentId: "article:1",
  }),
  node({
    id: "item:1",
    type: "Item",
    path: "part:1/chapter:1/article:1/paragraph:1/item:1",
    number: "1",
    title: "一",
    plainText: "一 第一号の本文。",
    parentId: "paragraph:1",
  }),
  node({
    id: "supplementary:1",
    type: "SupplementaryProvision",
    path: "supplementary-provision:1",
    title: "附　則",
    plainText: "附　則 この法律は、公布の日から施行する。",
  }),
  node({
    id: "appdx:1",
    type: "AppdxTable",
    path: "appdx-table:1",
    title: "別表第一",
    plainText: "別表第一 項目",
  }),
];

describe("LawNodeList", () => {
  it("renders LawNode hierarchy as readable legal text blocks", () => {
    render(<LawNodeList nodes={nodes} />);

    expect(screen.getByRole("heading", { name: "第一編　総則" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "第一章　通則" })).toBeInTheDocument();

    const article = screen.getByRole("article", { name: "第一条" });
    expect(within(article).getByRole("heading", { name: "第一条" })).toBeInTheDocument();
    expect(
      within(article).getByText("私権は、公共の福祉に適合しなければならない。"),
    ).toBeInTheDocument();
    expect(within(article).getByText("一")).toHaveClass("text-muted-foreground");
    expect(within(article).getByText("第一号の本文。")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "附　則" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "別表第一" })).toBeInTheDocument();
  });

  it("keeps parent body text when the same text appears before child text", () => {
    render(
      <LawNodeList
        nodes={[
          node({
            id: "article:1",
            type: "Article",
            path: "article:1",
            title: "第一条",
            plainText: "第一条 第一号の本文。 親だけの本文。 一 第一号の本文。",
            children: ["paragraph:1"],
          }),
          node({
            id: "paragraph:1",
            type: "Paragraph",
            path: "article:1/paragraph:1",
            plainText: "第一号の本文。 親だけの本文。 一 第一号の本文。",
            children: ["item:1"],
            parentId: "article:1",
          }),
          node({
            id: "item:1",
            type: "Item",
            path: "article:1/paragraph:1/item:1",
            title: "一",
            plainText: "一 第一号の本文。",
            parentId: "paragraph:1",
          }),
        ]}
      />,
    );

    const article = screen.getByRole("article", { name: "第一条" });

    expect(article).toHaveTextContent("第一号の本文。 親だけの本文。");
    expect(within(article).getByText("一")).toHaveClass("text-muted-foreground");
    expect(within(article).getByText("第一号の本文。")).toBeInTheDocument();
  });

  it("keeps parent body text when child text is empty", () => {
    render(
      <LawNodeList
        nodes={[
          node({
            id: "article:1",
            type: "Article",
            path: "article:1",
            title: "第一条",
            plainText: "第一条 空文字の子を持つ親本文。",
            children: ["paragraph:1"],
          }),
          node({
            id: "paragraph:1",
            type: "Paragraph",
            path: "article:1/paragraph:1",
            plainText: "空文字の子を持つ親本文。",
            children: ["item:1"],
            parentId: "article:1",
          }),
          node({
            id: "item:1",
            type: "Item",
            path: "article:1/paragraph:1/item:1",
            title: "一",
            plainText: "",
            parentId: "paragraph:1",
          }),
        ]}
      />,
    );

    const article = screen.getByRole("article", { name: "第一条" });

    expect(within(article).getByText("空文字の子を持つ親本文。")).toBeInTheDocument();
  });
});
