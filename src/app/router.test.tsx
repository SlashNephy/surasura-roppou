import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createEgovLawRepository } from "@/core/egov";
import { createJsonFetchStub, fixedTestNow as now, lawDataFixture } from "@/test/fixtures/egov";
import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { sampleLawViewerDocument } from "./law-viewer-sample";
import { createAppRouter } from "./router";

setupScrollMocks();

const routes = [
  ["/", "撮って、開いて、すらすら読める。"],
  ["/laws", "法令を探す"],
  ["/laws/129AC0000000089", "民法"],
  ["/laws/129AC0000000089/articles/1", "民法"],
  ["/saved", "保存リスト"],
  ["/saved/collections/missing", "コレクションが見つかりません"],
  ["/scanner", "問題集や資料から条文を開く"],
  ["/study", "復習"],
  ["/study/review", "今日の復習"],
  ["/study/cards", "条文カード"],
  ["/study/cards/missing-card", "条文カード"],
  ["/settings", "設定"],
] as const;

describe("app router", () => {
  it.each(routes)("renders %s", async (path, heading) => {
    const history = createMemoryHistory({ initialEntries: [path] });
    const { fetcher } = createJsonFetchStub(lawDataFixture);
    const lawRepository = createEgovLawRepository({ fetcher, now });
    const storageRepository = createMemoryStorageRepository().repository;

    render(
      <RouterProvider router={createAppRouter({ history, lawRepository, storageRepository })} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  });

  it("uses theme-aware text classes on route placeholder content", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "法令を探す" })).toHaveClass("text-foreground");
      expect(
        screen.getByText("法令名、略称、法令番号から目的の法令へ進むための入口です。"),
      ).toHaveClass("text-muted-foreground");
    });
  });

  it("renders saved laws from storage on the laws route", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storage = createMemoryStorageRepository(
      createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    );

    render(
      <RouterProvider
        router={createAppRouter({ history, storageRepository: storage.repository })}
      />,
    );

    expect(await screen.findByRole("link", { name: "民法" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089",
    );
    expect(screen.getByRole("link", { name: "保存リストを開く" })).toHaveAttribute(
      "href",
      "/saved",
    );
    expect(screen.getByText("最終取得: 2026/07/05")).toBeInTheDocument();
    expect(screen.getByText("6 ノード")).toBeInTheDocument();
  });

  it("keeps saved laws list rendering when fetchedAt is missing at runtime", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = {
      ...createMemoryStorageRepository().repository,
      listSavedLaws: () =>
        Promise.resolve([
          {
            law: sampleLawViewerDocument.law,
            revision: {
              ...sampleLawViewerDocument.revision,
              fetchedAt: undefined as never,
            },
            nodeCount: sampleLawViewerDocument.nodes.length,
            savedAt: "2026-07-06T00:00:00.000Z",
            updatedAt: "2026-07-06T00:00:00.000Z",
          },
        ]),
    };

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    expect(await screen.findByRole("link", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByText("最終取得: 不明")).toBeInTheDocument();
  });

  it("renders an empty saved laws placeholder on the laws route", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    expect(await screen.findByRole("heading", { name: "法令を探す" })).toBeInTheDocument();
    expect(screen.getByText("保存済み法令はまだありません。")).toBeInTheDocument();
  });

  it("keeps the laws route usable when saved law storage fails", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = {
      ...createMemoryStorageRepository().repository,
      listSavedLaws: () => Promise.reject(new Error("IndexedDB is unavailable")),
    };

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    expect(await screen.findByRole("heading", { name: "法令を探す" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("保存済み法令を読み込めませんでした。");
  });

  it("shows the study card count and list link on the study page", async () => {
    const history = createMemoryHistory({ initialEntries: ["/study"] });
    const storage = createMemoryStorageRepository({
      studyCards: [
        {
          id: "card-1",
          source: "manual",
          target: { lawId: "129AC0000000089", revisionId: "rev-1", article: "1" },
          type: "fill_blank",
          question: "Q",
          answer: "A",
          tags: [],
          examPinned: false,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });

    render(
      <RouterProvider
        router={createAppRouter({ history, storageRepository: storage.repository })}
      />,
    );

    expect(await screen.findByText("1 件のカード")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "カード一覧を開く" })).toHaveAttribute(
      "href",
      "/study/cards",
    );
  });

  it("shows due and unscheduled counts with review links on the study page", async () => {
    const history = createMemoryHistory({ initialEntries: ["/study"] });
    const baseCard = {
      id: "card-due",
      source: "manual" as const,
      target: { lawId: "129AC0000000089", revisionId: "rev-1", article: "1" },
      type: "fill_blank" as const,
      question: "Q",
      answer: "A",
      tags: [] as string[],
      examPinned: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
    const storage = createMemoryStorageRepository({
      studyCards: [baseCard, { ...baseCard, id: "card-fresh" }],
      cardSchedules: [
        {
          cardId: "card-due",
          // 過去日時なので出題対象。
          dueAt: "2026-07-01T00:00:00.000Z",
          intervalDays: 1,
          lapses: 0,
          reviews: 1,
          recentMistakeRate: 0,
          derivedFrom: "log-1",
        },
      ],
    });

    render(
      <RouterProvider
        router={createAppRouter({ history, storageRepository: storage.repository })}
      />,
    );

    expect(await screen.findByText("1 件のカードが復習期限です")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "復習を始める" })).toHaveAttribute(
      "href",
      "/study/review",
    );
    expect(screen.getByText("1 件の未学習カード")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "新しく覚える" })).toHaveAttribute(
      "href",
      "/study/review?mode=new",
    );
  });

  it("shows the no-review message when nothing is due on the study page", async () => {
    const history = createMemoryHistory({ initialEntries: ["/study"] });
    const storage = createMemoryStorageRepository();

    render(
      <RouterProvider
        router={createAppRouter({ history, storageRepository: storage.repository })}
      />,
    );

    expect(await screen.findByText("今日の復習はありません")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "復習を始める" })).not.toBeInTheDocument();
  });
});
