import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { sampleLawViewerDocument } from "./law-viewer-sample";
import { createAppRouter } from "./router";

setupScrollMocks();

const renderHome = (storageRepository = createMemoryStorageRepository().repository) => {
  const history = createMemoryHistory({ initialEntries: ["/"] });

  render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);
};

describe("HomePage", () => {
  it("renders the launcher with featured law chips when no data is saved", async () => {
    renderHome();

    expect(
      await screen.findByRole("heading", { name: "撮って、開いて、すらすら読める。" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "日本国憲法" })).toHaveAttribute(
      "href",
      "/laws/321CONSTITUTION",
    );
    expect(screen.getByRole("link", { name: "刑法" })).toHaveAttribute(
      "href",
      "/laws/140AC0000000045",
    );
    expect(screen.queryByRole("heading", { name: "オフライン保存済み" })).not.toBeInTheDocument();
  });

  it("renders the dashboard with saved laws when data exists", async () => {
    const storage = createMemoryStorageRepository(
      createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    );

    renderHome(storage.repository);

    expect(await screen.findByRole("heading", { name: "オフライン保存済み" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "すべて表示" })).toHaveAttribute("href", "/saved");
    expect(screen.getByRole("link", { name: "民法" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089",
    );
  });

  it("keeps the launcher usable and shows an error message when storage fails", async () => {
    const storageRepository = {
      ...createMemoryStorageRepository().repository,
      listSavedLaws: () => Promise.reject(new Error("IndexedDB is unavailable")),
    };

    renderHome(storageRepository);

    expect(
      await screen.findByRole("heading", { name: "撮って、開いて、すらすら読める。" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "保存済み法令を読み込めませんでした。",
    );
    expect(screen.queryByRole("link", { name: "日本国憲法" })).not.toBeInTheDocument();
  });
});

// cmdk の CommandList は ResizeObserver を利用するため最小限のスタブを用意する。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {
      // 高さ計測は行わないため何もしない
    }
    unobserve() {
      // 高さ計測は行わないため何もしない
    }
    disconnect() {
      // 高さ計測は行わないため何もしない
    }
  },
);

it("学習データがあると今日の復習・苦手条文・最近開いた項目を表示する", async () => {
  const { repository } = createMemoryStorageRepository({
    savedLawDocument: createSavedLawDocument({
      law: sampleLawViewerDocument.law,
      revision: sampleLawViewerDocument.revision,
      nodes: sampleLawViewerDocument.nodes,
    }),
    studyCards: [
      {
        id: "weak",
        source: "manual",
        target: { lawId: sampleLawViewerDocument.law.lawId, article: "1" },
        type: "fill_blank",
        question: "第1条の趣旨",
        answer: "…",
        tags: [],
        examPinned: false,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    reviewLogs: [
      {
        id: "l1",
        cardId: "weak",
        grade: "again",
        reviewedAt: "2026-07-10T00:00:00.000Z",
        scheduler: "fixed-interval@1",
      },
      {
        id: "l2",
        cardId: "weak",
        grade: "again",
        reviewedAt: "2026-07-11T00:00:00.000Z",
        scheduler: "fixed-interval@1",
      },
      {
        id: "l3",
        cardId: "weak",
        grade: "good",
        reviewedAt: "2026-07-12T00:00:00.000Z",
        scheduler: "fixed-interval@1",
      },
    ],
  });

  renderHome(repository);

  expect(await screen.findByRole("heading", { name: "苦手な条文" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "最近開いた" })).toBeInTheDocument();
  // 古い「準備中」文言が消えている。
  expect(screen.queryByText("復習機能は準備中です")).not.toBeInTheDocument();
});

it("検索バーをクリックするとパレットが開く", async () => {
  const user = userEvent.setup();
  const storageRepository = createMemoryStorageRepository().repository;
  const history = createMemoryHistory({ initialEntries: ["/"] });

  render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

  // ホーム画面が描画されるまで待機する
  await screen.findByRole("heading", { name: "撮って、開いて、すらすら読める。" });

  // ホームの検索バーをクリックする（ヘッダーの検索ボタンと区別するため main ランドマーク内を絞り込む）
  const main = screen.getByRole("main");
  await user.click(within(main).getByRole("button", { name: /検索/ }));

  // 検索パレットのダイアログが表示されることを確認する
  expect(await screen.findByRole("dialog", { name: "検索" })).toBeInTheDocument();
});
