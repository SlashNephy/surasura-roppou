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
            id: "article:1",
            title: "第一条",
            type: "Article",
            depth: 3,
            articleNumber: "1",
            children: [],
          },
        ],
      },
    ],
  },
];

describe("LawTableOfContents", () => {
  it("renders nested items under the legal table of contents navigation", () => {
    render(<LawTableOfContents items={items} />);

    const navigation = screen.getByRole("navigation", { name: "法令目次" });

    expect(within(navigation).getByText(/第一編\s+総則/u)).toBeInTheDocument();
    expect(within(navigation).getByText(/第一章\s+通則/u)).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "第一条" })).toBeInTheDocument();
  });

  it("marks the active article button as the current location", () => {
    render(<LawTableOfContents activeArticleNumber="1" items={items} />);

    expect(screen.getByRole("button", { name: "第一条" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("calls onSelectArticle when an article button is clicked", () => {
    const onSelectArticle = vi.fn();

    render(<LawTableOfContents items={items} onSelectArticle={onSelectArticle} />);
    fireEvent.click(screen.getByRole("button", { name: "第一条" }));

    expect(onSelectArticle).toHaveBeenCalledExactlyOnceWith("1");
  });

  it("renders an empty state when no items are available", () => {
    render(<LawTableOfContents items={[]} />);

    expect(screen.getByText("目次を表示できません")).toBeInTheDocument();
  });
});
