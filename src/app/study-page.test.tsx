import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { StudyCard } from "@/core/domain";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { createAppRouter } from "./router";

setupScrollMocks();

const cardOf = (id: string, lawId: string) =>
  ({
    id,
    source: "manual",
    target: { lawId, revisionId: "rev-1", article: "1" },
    type: "fill_blank",
    question: `${id} の問題`,
    answer: `${id} の答え`,
    tags: [],
    examPinned: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  }) satisfies StudyCard;

const renderStudyPage = (studyCards: StudyCard[]) => {
  const storage = createMemoryStorageRepository({ studyCards });
  const history = createMemoryHistory({ initialEntries: ["/study"] });

  render(
    <RouterProvider router={createAppRouter({ history, storageRepository: storage.repository })} />,
  );
};

describe("StudyPage 科目別プリセット", () => {
  it("科目ごとのカード件数とカード一覧への導線を表示する", async () => {
    renderStudyPage([
      cardOf("card-minpo", "129AC0000000089"), // 民法
      cardOf("card-gyosei", "405AC0000000088"), // 行政手続法
      cardOf("card-jichi", "322AC0000000067"), // 地方自治法
    ]);

    // カード読み込み完了を待つ（条文カードセクションの件数表示）。
    expect(await screen.findByText("3 件のカード")).toBeInTheDocument();

    // 科目リンクが subject 付きのカード一覧を指す。
    const civilLink = screen.getByRole("link", { name: /民法/ });
    expect(civilLink).toHaveAttribute("href", "/study/cards?subject=civil");

    const administrativeLink = screen.getByRole("link", { name: /行政法/ });
    expect(administrativeLink).toHaveAttribute("href", "/study/cards?subject=administrative");

    // 科目ごとの件数（民法 1 件、行政法 2 件、憲法 0 件）。
    const subjectList = screen.getByRole("list", { name: "科目別プリセット" });
    expect(subjectList).toHaveTextContent("民法1 件");
    expect(subjectList).toHaveTextContent("行政法2 件");
    expect(subjectList).toHaveTextContent("憲法0 件");
  });

  it("4 科目すべての導線を表示する", async () => {
    renderStudyPage([]);

    expect(await screen.findByRole("link", { name: /憲法/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /民法/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /行政法/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "商法/会社法" })).toBeInTheDocument();
  });
});
