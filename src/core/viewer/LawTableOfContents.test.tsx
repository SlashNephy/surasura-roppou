import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LawTocItem } from "./lawToc";

import { LawTableOfContents } from "./LawTableOfContents";

const items: LawTocItem[] = [
  {
    id: "part:1",
    title: "第一編　総則",
    type: "Part",
    depth: 1,
    children: [
      {
        id: "chapter:1",
        title: "第一章　通則",
        type: "Chapter",
        depth: 2,
        children: [
          {
            id: "section:1",
            title: "第一節　権利能力",
            type: "Section",
            depth: 3,
            children: [
              {
                id: "subsection:1",
                title: "第一款　総則",
                type: "Subsection",
                depth: 4,
                children: [
                  {
                    id: "division:1",
                    title: "第一目　通則",
                    type: "Division",
                    depth: 5,
                    children: [
                      {
                        id: "article:1",
                        title: "第一条",
                        type: "Article",
                        depth: 6,
                        articleNumber: "1",
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

const noopSelectArticle = () => {
  // テスト上は選択処理を観測しない render case で使う。
};

describe("LawTableOfContents", () => {
  it("renders nested items as readable text by default", () => {
    render(<LawTableOfContents items={items} onSelectArticle={noopSelectArticle} />);

    const navigation = screen.getByRole("navigation", { name: "法令目次" });

    expect(within(navigation).getByText(/第1編\s+総則/u)).toBeInTheDocument();
    expect(within(navigation).getByText(/第1章\s+通則/u)).toBeInTheDocument();
    expect(within(navigation).getByText(/第1節\s+権利能力/u)).toBeInTheDocument();
    expect(within(navigation).getByText(/第1款\s+総則/u)).toBeInTheDocument();
    expect(within(navigation).getByText(/第1目\s+通則/u)).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "第1条" })).toBeInTheDocument();
  });

  it("keeps original table of contents text in original mode", () => {
    render(
      <LawTableOfContents
        displayMode="original"
        items={items}
        onSelectArticle={noopSelectArticle}
      />,
    );

    const navigation = screen.getByRole("navigation", { name: "法令目次" });

    expect(within(navigation).getByText(/第一編\s+総則/u)).toBeInTheDocument();
    expect(within(navigation).getByText(/第一章\s+通則/u)).toBeInTheDocument();
    expect(within(navigation).getByText(/第一節\s+権利能力/u)).toBeInTheDocument();
    expect(within(navigation).getByText(/第一款\s+総則/u)).toBeInTheDocument();
    expect(within(navigation).getByText(/第一目\s+通則/u)).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "第一条" })).toBeInTheDocument();
  });

  it("marks the active article button as the current location", () => {
    render(
      <LawTableOfContents
        activeArticleNumber="1"
        items={items}
        onSelectArticle={noopSelectArticle}
      />,
    );

    expect(screen.getByRole("button", { name: "第1条" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("calls onSelectArticle when an article button is clicked", () => {
    const onSelectArticle = vi.fn();

    render(<LawTableOfContents items={items} onSelectArticle={onSelectArticle} />);
    fireEvent.click(screen.getByRole("button", { name: "第1条" }));

    expect(onSelectArticle).toHaveBeenCalledExactlyOnceWith("1");
  });

  it("renders an article caption next to the number", () => {
    const captionedItems: LawTocItem[] = [
      {
        id: "article:264",
        title: "第二百六十四条",
        caption: "（親告罪）",
        type: "Article",
        depth: 1,
        articleNumber: "264",
        children: [],
      },
    ];

    render(<LawTableOfContents items={captionedItems} onSelectArticle={noopSelectArticle} />);

    const navigation = screen.getByRole("navigation", { name: "法令目次" });

    // 読みやすい表示（既定）では全角括弧が半角化される（（親告罪）→ (親告罪)）。
    expect(within(navigation).getByText("(親告罪)")).toBeInTheDocument();
    // 見出しは条番号ボタンのアクセシブル名にも含まれる（読みやすい表示で第264条）。
    expect(
      within(navigation).getByRole("button", { name: /第264条.*\(親告罪\)/u }),
    ).toBeInTheDocument();
  });

  it("renders an empty state when no items are available", () => {
    render(<LawTableOfContents items={[]} onSelectArticle={noopSelectArticle} />);

    expect(screen.getByText("目次を表示できません")).toBeInTheDocument();
  });
});
