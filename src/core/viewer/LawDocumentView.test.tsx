import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Law, LawNode, LawRevision } from "@/core/domain";

import { LawDocumentView } from "./LawDocumentView";

const law: Law = {
  lawId: "129AC0000000089",
  title: "民法",
  lawNumber: "明治二十九年法律第八十九号",
  lawType: "法律",
  aliases: [],
  source: "egov",
};

const revision: LawRevision = {
  lawId: law.lawId,
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  effectiveDate: "2026-06-24",
  fetchedAt: "2026-07-05T10:30:00+09:00",
};

const node = (overrides: Partial<LawNode> & Pick<LawNode, "id" | "path" | "type">): LawNode => ({
  lawId: law.lawId,
  revisionId: revision.revisionId,
  rawText: "",
  plainText: "",
  children: [],
  ...overrides,
});

describe("LawDocumentView", () => {
  it("renders law metadata, unsaved state, and article body", () => {
    render(
      <LawDocumentView
        isSaved={false}
        law={law}
        nodes={[
          node({
            id: "article:1",
            type: "Article",
            path: "article:1",
            number: "1",
            title: "第一条",
            plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
            children: ["paragraph:1"],
          }),
          node({
            id: "paragraph:1",
            type: "Paragraph",
            path: "article:1/paragraph:1",
            number: "1",
            plainText: "私権は、公共の福祉に適合しなければならない。",
            parentId: "article:1",
          }),
        ]}
        revision={revision}
      />,
    );

    const document = screen.getByRole("article", { name: "民法" });

    expect(within(document).getByRole("heading", { level: 1, name: "民法" })).toBeInTheDocument();
    expect(within(document).getByText("明治二十九年法律第八十九号")).toBeInTheDocument();
    expect(within(document).getByText("法律")).toBeInTheDocument();
    expect(within(document).getByText("施行日: 2026-06-24")).toBeInTheDocument();
    expect(within(document).getByText("取得: 2026-07-05")).toBeInTheDocument();
    expect(within(document).getByText("未保存")).toBeInTheDocument();

    const article = within(document).getByRole("article", { name: "第一条" });

    expect(within(article).getByRole("heading", { name: "第一条" })).toBeInTheDocument();
    expect(
      within(article).getByText("私権は、公共の福祉に適合しなければならない。"),
    ).toBeInTheDocument();
  });
});
