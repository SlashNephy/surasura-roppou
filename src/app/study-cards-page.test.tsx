import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { StudyCard } from "@/core/domain";
import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { sampleLawViewerDocument } from "./law-viewer-sample";
import { createAppRouter } from "./router";

setupScrollMocks();

const minpoCard = {
  id: "card-minpo",
  source: "manual",
  target: { lawId: "129AC0000000089", revisionId: "rev-1", article: "1" },
  type: "fill_blank",
  question: "私権は、（　　）に適合しなければならない。",
  answer: "公共の福祉",
  tags: ["総則"],
  examPinned: true,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
} satisfies StudyCard;

const kenpoCard = {
  id: "card-kenpo",
  source: "manual",
  target: { lawId: "321CONSTITUTION", revisionId: "rev-2", article: "13" },
  type: "definition",
  question: "幸福追求権の根拠条文は？",
  answer: "憲法13条",
  tags: [],
  examPinned: false,
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-04T00:00:00.000Z",
} satisfies StudyCard;

const renderStudyCardsPage = (studyCards: StudyCard[]) => {
  const storage = createMemoryStorageRepository({
    // 民法の保存本文があるので lawId → 法令名の解決対象になる。
    savedLawDocument: createSavedLawDocument({
      law: sampleLawViewerDocument.law,
      revision: sampleLawViewerDocument.revision,
      nodes: sampleLawViewerDocument.nodes,
    }),
    studyCards,
  });
  const history = createMemoryHistory({ initialEntries: ["/study/cards"] });

  render(
    <RouterProvider router={createAppRouter({ history, storageRepository: storage.repository })} />,
  );

  return storage;
};

describe("StudyCardsPage", () => {
  it("lists cards newest-updated first with type badges and article links", async () => {
    renderStudyCardsPage([minpoCard, kenpoCard]);

    expect(await screen.findByRole("heading", { name: "条文カード" })).toBeInTheDocument();
    expect(screen.getByText("2 件")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");

    // updatedAt 降順なので憲法カードが先。
    expect(items[0]).toHaveTextContent("幸福追求権の根拠条文は？");
    expect(items[0]).toHaveTextContent("定義語");
    // toHaveTextContent は DOM テキストの空白を正規化して比較するため、
    // 全角スペース（U+3000）は通常スペースに丸められた状態で比較する。
    expect(items[1]).toHaveTextContent("私権は、（ ）に適合しなければならない。");
    expect(items[1]).toHaveTextContent("穴埋め");
    // 保存済み法令は名前で、未保存法令は lawId のまま表示する。
    expect(items[1]).toHaveTextContent("民法");
    expect(items[0]).toHaveTextContent("321CONSTITUTION");
    // examPinned のピン表示。
    expect(items[1]).toHaveTextContent("試験直前");
  });

  it("filters cards by law", async () => {
    const user = userEvent.setup();
    renderStudyCardsPage([minpoCard, kenpoCard]);

    await screen.findByText("2 件");
    await user.selectOptions(screen.getByLabelText("法令で絞り込む"), "129AC0000000089");

    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
    });
    expect(screen.getByText("1 件")).toBeInTheDocument();
    expect(screen.queryByText("幸福追求権の根拠条文は？")).not.toBeInTheDocument();
  });

  it("shows an empty state with guidance", async () => {
    renderStudyCardsPage([]);

    expect(
      await screen.findByText("カードはまだありません。法令ビューアの条文から作成できます。"),
    ).toBeInTheDocument();
  });

  it("renders question as a link pointing to the card detail page", async () => {
    renderStudyCardsPage([minpoCard]);

    // カード一覧が表示されるまで待機する。
    await screen.findByText("1 件");

    // 問題文リンクがカード詳細ページ（/study/cards/<id>）を指すことを確認する。
    // getByRole("link") で各種リンクをすべて取得し、href が目的のパスを指すものを選ぶ。
    const links = screen.getAllByRole("link");
    const questionLink = links.find(
      (link) => link.getAttribute("href") === `/study/cards/${minpoCard.id}`,
    );
    expect(questionLink).toBeInTheDocument();
  });
});
