import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LawNode, LawNodeType } from "@/core/domain";

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
  it("renders readable text by default", () => {
    render(
      <LawNodeList
        lawId="129AC0000000089"
        nodes={[
          node({
            id: "article:12-2",
            type: "Article",
            path: "article:12-2",
            number: "12の2",
            title: "第十二条の二",
            rawText: "第十二条の二　原文の本文（括弧）。",
            plainText: "第十二条の二 原文の本文（括弧）。",
          }),
        ]}
      />,
    );

    const article = screen.getByRole("article", { name: "第十二条の二" });

    expect(within(article).getByRole("heading", { name: "第12条の2" })).toBeInTheDocument();
    expect(within(article).getByText("第12条の2 原文の本文(括弧)。")).toBeInTheDocument();
  });

  it("renders the article caption in a lighter ink inside the heading", () => {
    render(
      <LawNodeList
        lawId="129AC0000000089"
        nodes={[
          node({
            id: "article:caption",
            type: "Article",
            path: "article:1",
            number: "1",
            title: "第一条",
            caption: "（基本原則）",
            plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
          }),
        ]}
      />,
    );

    // 読みやすい表示では全角かっこが半角化される（本文と同じ表示レイヤー規則）
    const heading = screen.getByRole("heading", { name: "第1条(基本原則)" });

    expect(within(heading).getByText("(基本原則)")).toHaveClass(
      "ml-2",
      "text-base",
      "font-normal",
      "text-secondary-foreground",
    );
  });

  it("renders the heading without a caption span when the article has no caption", () => {
    render(
      <LawNodeList
        lawId="129AC0000000089"
        nodes={[
          node({
            id: "article:no-caption",
            type: "Article",
            path: "article:1",
            number: "1",
            title: "第一条",
            plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
          }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "第1条" })).toBeInTheDocument();
  });

  it("renders article actions only for URL-addressable article nodes", () => {
    render(
      <LawNodeList
        lawId="129AC0000000089"
        nodes={[
          node({
            id: "article:1",
            type: "Article",
            path: "article:1",
            number: "1",
            title: "第一条",
            plainText: "第一条 本文。",
          }),
          node({
            id: "supplementary:1",
            type: "SupplementaryProvision",
            path: "supplementary-provision:1",
            title: "附　則",
            plainText: "附　則 第一条 附則の本文。",
            children: ["supplementary:article:1"],
          }),
          node({
            id: "supplementary:article:1",
            type: "Article",
            path: "supplementary-provision:1/article:1",
            number: "1",
            title: "第一条",
            plainText: "第一条 附則の本文。",
            parentId: "supplementary:1",
          }),
        ]}
        renderArticleActions={(article) => <button type="button">copy {article.number}</button>}
      />,
    );

    expect(screen.getAllByRole("button", { name: "copy 1" })).toHaveLength(1);
  });

  it("renders original raw text when displayMode is original", () => {
    render(
      <LawNodeList
        lawId="129AC0000000089"
        displayMode="original"
        nodes={[
          node({
            id: "article:12-2",
            type: "Article",
            path: "article:12-2",
            number: "12の2",
            title: "第十二条の二",
            rawText: "第十二条の二　原文の本文（括弧）。",
            plainText: "第十二条の二 原文の本文（括弧）。",
          }),
        ]}
      />,
    );

    const article = screen.getByRole("article", { name: "第十二条の二" });

    expect(within(article).getByRole("heading", { name: "第十二条の二" })).toBeInTheDocument();
    expect(
      within(article).getByText((_, element) => {
        return (
          element?.tagName.toLowerCase() === "p" &&
          element.textContent === "第十二条の二　原文の本文（括弧）。"
        );
      }),
    ).toBeInTheDocument();
  });

  it("falls back to plainText in original mode when rawText is empty", () => {
    render(
      <LawNodeList
        lawId="129AC0000000089"
        displayMode="original"
        nodes={[
          node({
            id: "article:1",
            type: "Article",
            path: "article:1",
            title: "第一条",
            plainText: "第一条 rawTextが空の本文。",
          }),
        ]}
      />,
    );

    expect(screen.getByText("第一条 rawTextが空の本文。")).toBeInTheDocument();
  });

  it("keeps legal structure headings unchanged in original mode", () => {
    render(<LawNodeList displayMode="original" lawId="129AC0000000089" nodes={nodes} />);

    expect(screen.getByRole("heading", { level: 2, name: "第一編　総則" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "第一章　通則" })).toBeInTheDocument();
  });

  it.each([
    ["readable", "第4章の2　処分等の求め"],
    ["original", "第四章の二　処分等の求め"],
  ] as const)("renders a branch chapter heading in %s mode", (displayMode, expectedHeading) => {
    render(
      <LawNodeList
        lawId="129AC0000000089"
        displayMode={displayMode}
        nodes={[
          node({
            id: "chapter:4-2",
            type: "Chapter",
            path: "chapter:4-2",
            title: "第四章の二　処分等の求め",
            plainText: "第四章の二　処分等の求め",
          }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: expectedHeading })).toBeInTheDocument();
  });

  it("renders LawNode hierarchy as readable legal text blocks", () => {
    render(<LawNodeList activeArticleNumber="1" lawId="129AC0000000089" nodes={nodes} />);

    expect(screen.getByRole("heading", { level: 2, name: "第1編　総則" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "第1章　通則" })).toBeInTheDocument();
    expect(
      screen.queryByText((_, element) => {
        return (
          element?.tagName.toLowerCase() === "p" &&
          /第(?:一|1)章\u3000通則/u.test(element.textContent)
        );
      }),
    ).not.toBeInTheDocument();

    const article = screen.getByRole("article", { name: "第一条" });
    expect(article).toHaveAttribute("id", "a1");
    expect(article).toHaveAttribute("data-active", "true");
    expect(article).toHaveAttribute("aria-current", "location");
    expect(within(article).getByRole("heading", { level: 4, name: "第1条" })).toBeInTheDocument();
    expect(
      within(article).getByText("私権は、公共の福祉に適合しなければならない。"),
    ).toBeInTheDocument();
    expect(article).toHaveTextContent("私権は、公共の福祉に適合しなければならない。一");
    expect(article).not.toHaveTextContent("第一条1私権");
    expect(within(article).getByText("一")).toHaveClass("text-muted-foreground");
    expect(within(article).getByText("第1号の本文。")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "附　則" })).toBeInTheDocument();
    expect(screen.getByText("この法律は、公布の日から施行する。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "別表1" })).toBeInTheDocument();
    expect(screen.getByText("項目")).toBeInTheDocument();
  });

  it.each([
    ["SupplementaryProvision", "supplementary-provision:1", "附　則"],
    ["AppdxTable", "appdx-table:1", "別表第一"],
    ["AppdxStyle", "appdx-style:1", "別記様式第一"],
  ] satisfies [LawNodeType, string, string][])(
    "does not make article duplicates under %s URL addressable",
    (containerType, containerPath, containerTitle) => {
      const containerId = `${containerType}:1`;

      render(
        <LawNodeList
          lawId="129AC0000000089"
          activeArticleNumber="1"
          nodes={[
            node({
              id: "article:1",
              type: "Article",
              path: "article:1",
              number: "1",
              title: "第一条",
              plainText: "第一条 本則の本文。",
            }),
            node({
              id: containerId,
              type: containerType,
              path: containerPath,
              title: containerTitle,
              plainText: `${containerTitle} 第一条 付属資料の本文。`,
              children: ["container-article:1"],
            }),
            node({
              id: "container-article:1",
              type: "Article",
              path: `${containerPath}/article:1`,
              number: "1",
              title: "第一条",
              plainText: "第一条 付属資料の本文。",
              parentId: containerId,
            }),
          ]}
        />,
      );

      const [mainArticle, nonAddressableArticle] = screen.getAllByRole("article", {
        name: "第一条",
      });

      expect(mainArticle).toHaveAttribute("id", "a1");
      expect(mainArticle).toHaveAttribute("data-active", "true");
      expect(mainArticle).toHaveAttribute("aria-current", "location");
      expect(nonAddressableArticle).not.toHaveAttribute("id");
      expect(nonAddressableArticle).not.toHaveAttribute("data-active");
      expect(nonAddressableArticle).not.toHaveAttribute("aria-current");
    },
  );

  it("keeps parent body text when the same text appears before child text", () => {
    render(
      <LawNodeList
        lawId="129AC0000000089"
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

    expect(article).toHaveTextContent("第1号の本文。 親だけの本文。");
    expect(within(article).getByText("一")).toHaveClass("text-muted-foreground");
    expect(within(article).getByText("第1号の本文。")).toBeInTheDocument();
  });

  it("keeps parent body text when child text is empty", () => {
    render(
      <LawNodeList
        lawId="129AC0000000089"
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

  it("renders untitled heading node text as body copy", () => {
    render(
      <LawNodeList
        lawId="129AC0000000089"
        nodes={[
          node({
            id: "section:1",
            type: "Section",
            path: "section:1",
            plainText: "見出しを持たない節の本文。",
          }),
        ]}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "見出しを持たない節の本文。" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("見出しを持たない節の本文。")).toBeInTheDocument();
  });

  it("numbers second and later paragraphs of an article even without ParagraphNum", () => {
    // 日本国憲法6条は ParagraphNum が空だが、条直下の第2項は Num 由来で番号を出す。
    render(
      <LawNodeList
        lawId="129AC0000000089"
        nodes={[
          node({
            id: "article:6",
            type: "Article",
            path: "article:6",
            number: "6",
            title: "第六条",
            children: ["article:6/paragraph:1", "article:6/paragraph:2"],
          }),
          node({
            id: "article:6/paragraph:1",
            type: "Paragraph",
            path: "article:6/paragraph:1",
            number: "1",
            plainText: "天皇は、国会の指名に基いて、内閣総理大臣を任命する。",
            parentId: "article:6",
          }),
          node({
            id: "article:6/paragraph:2",
            type: "Paragraph",
            path: "article:6/paragraph:2",
            number: "2",
            plainText: "天皇は、内閣の指名に基いて、最高裁判所の長たる裁判官を任命する。",
            parentId: "article:6",
          }),
        ]}
      />,
    );

    const article = screen.getByRole("article", { name: "第六条" });

    expect(within(article).getByText("2")).toBeInTheDocument();
    expect(
      within(article).getByText("天皇は、国会の指名に基いて、内閣総理大臣を任命する。"),
    ).toBeInTheDocument();
    expect(
      within(article).getByText("天皇は、内閣の指名に基いて、最高裁判所の長たる裁判官を任命する。"),
    ).toBeInTheDocument();
  });

  it("does not number preamble-style paragraphs outside an article", () => {
    // 前文の段落は Article 直下ではないので番号を付けない（散文）。
    render(
      <LawNodeList
        lawId="129AC0000000089"
        nodes={[
          node({
            id: "preamble:1",
            type: "Paragraph",
            path: "preamble:1",
            number: "1",
            plainText: "日本国民は、正当に選挙された国会における代表者を通じて行動し、",
          }),
          node({
            id: "preamble:2",
            type: "Paragraph",
            path: "preamble:2",
            number: "2",
            plainText: "日本国民は、恒久の平和を念願し、",
          }),
        ]}
      />,
    );

    expect(screen.queryByText("2")).not.toBeInTheDocument();
  });

  it("gives article-direct paragraphs an anchor id", () => {
    const { container } = render(<LawNodeList lawId="129AC0000000089" nodes={nodes} />);

    expect(container.querySelector("#a1-p1")).not.toBeNull();
  });

  it("does not anchor paragraphs inside supplementary provisions", () => {
    const supplementaryNodes: LawNode[] = [
      node({
        id: "supplementary:2",
        type: "SupplementaryProvision",
        path: "supplementary-provision:2",
        title: "附　則",
        children: ["supplementary-article:1"],
      }),
      node({
        id: "supplementary-article:1",
        type: "Article",
        path: "supplementary-provision:2/article:1",
        number: "1",
        title: "第一条",
        children: ["supplementary-paragraph:1"],
        parentId: "supplementary:2",
      }),
      node({
        id: "supplementary-paragraph:1",
        type: "Paragraph",
        path: "supplementary-provision:2/article:1/paragraph:1",
        number: "1",
        plainText: "この法律は、公布の日から施行する。",
        parentId: "supplementary-article:1",
      }),
    ];

    const { container } = render(
      <LawNodeList lawId="129AC0000000089" nodes={supplementaryNodes} />,
    );

    expect(container.querySelector("#a1-p1")).toBeNull();
  });

  describe("reference links", () => {
    const referenceNodes: LawNode[] = [
      node({
        id: "article:15",
        type: "Article",
        path: "article:15",
        number: "15",
        title: "第十五条",
        caption: "（補助開始の審判）",
        children: ["article:15/paragraph:1"],
      }),
      node({
        id: "article:15/paragraph:1",
        type: "Paragraph",
        path: "article:15/paragraph:1",
        number: "1",
        plainText: "家庭裁判所は、補助開始の審判をすることができる。",
        parentId: "article:15",
      }),
      node({
        id: "article:16",
        type: "Article",
        path: "article:16",
        number: "16",
        title: "第十六条",
        children: ["article:16/paragraph:1", "article:16/paragraph:2"],
      }),
      node({
        id: "article:16/paragraph:1",
        type: "Paragraph",
        path: "article:16/paragraph:1",
        number: "1",
        plainText: "第十五条の審判を受けた者は、被補助人とする。",
        parentId: "article:16",
      }),
      node({
        id: "article:16/paragraph:2",
        type: "Paragraph",
        path: "article:16/paragraph:2",
        number: "2",
        plainText: "前項の規定を適用する。",
        parentId: "article:16",
      }),
    ];

    it("renders a cross article reference as a link to the article route", () => {
      render(<LawNodeList lawId="129AC0000000089" nodes={referenceNodes} />);

      const link = screen.getByRole("link", { name: /第15条/ });

      expect(link).toHaveAttribute("href", "/laws/129AC0000000089/articles/15");
    });

    it("renders a same article paragraph reference as an in-page link", () => {
      render(<LawNodeList lawId="129AC0000000089" nodes={referenceNodes} />);

      expect(screen.getByRole("link", { name: "前項" })).toHaveAttribute("href", "#a16-p1");
    });

    it("shows the target caption in readable mode", () => {
      render(<LawNodeList lawId="129AC0000000089" nodes={referenceNodes} />);

      expect(screen.getByRole("link", { name: /第15条/ })).toHaveTextContent(
        "第15条〈補助開始の審判〉",
      );
    });

    it("omits the caption in original mode", () => {
      render(<LawNodeList displayMode="original" lawId="129AC0000000089" nodes={referenceNodes} />);

      expect(screen.getByRole("link", { name: /第十五条/ })).not.toHaveTextContent(
        "補助開始の審判",
      );
    });

    it("navigates through the callback instead of following the href", async () => {
      const user = userEvent.setup();
      const onSelectArticle = vi.fn();

      render(
        <LawNodeList
          lawId="129AC0000000089"
          nodes={referenceNodes}
          onSelectArticle={onSelectArticle}
        />,
      );

      await user.click(screen.getByRole("link", { name: /第15条/ }));

      expect(onSelectArticle).toHaveBeenCalledWith("15");
    });

    it("does not linkify article numbers inside supplementary provisions", () => {
      const supplementaryReferenceNodes: LawNode[] = [
        ...referenceNodes,
        node({
          id: "supplementary:1",
          type: "SupplementaryProvision",
          path: "supplementary-provision:1",
          title: "附　則",
          children: ["supplementary:1/article:1"],
        }),
        node({
          id: "supplementary:1/article:1",
          type: "Article",
          path: "supplementary-provision:1/article:1",
          number: "1",
          title: "第一条",
          plainText: "第十五条の規定は、当分の間適用しない。",
          parentId: "supplementary:1",
        }),
      ];

      render(<LawNodeList lawId="129AC0000000089" nodes={supplementaryReferenceNodes} />);

      expect(screen.getAllByRole("link", { name: /第15条/ })).toHaveLength(1);
    });
  });
});
