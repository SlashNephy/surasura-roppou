import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { CardSchedule, StudyCard } from "@/core/domain";
import type { StorageRepository } from "@/core/storage";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { createAppRouter } from "./router";

setupScrollMocks();

const makeCard = (id: string, createdAt = "2026-07-01T00:00:00.000Z"): StudyCard => ({
  id,
  source: "manual",
  target: { lawId: "129AC0000000089", revisionId: "rev-1", article: "1" },
  type: "fill_blank",
  question: `Q ${id}`,
  answer: `A ${id}`,
  tags: [],
  examPinned: false,
  createdAt,
  updatedAt: createdAt,
});

// 過去日時の dueAt なので常に出題対象になる。
const dueSchedule = (cardId: string): CardSchedule => ({
  cardId,
  dueAt: "2026-07-01T00:00:00.000Z",
  intervalDays: 1,
  lapses: 0,
  reviews: 1,
  recentMistakeRate: 0,
  derivedFrom: `log-${cardId}`,
});

const renderReviewPage = (path: string, storageRepository: StorageRepository) => {
  const history = createMemoryHistory({ initialEntries: [path] });

  render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);
};

describe("StudyReviewPage", () => {
  it("runs a due review from question to completion", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository({
      studyCards: [makeCard("card-1")],
      cardSchedules: [dueSchedule("card-1")],
    });

    renderReviewPage("/study/review", storage.repository);

    expect(await screen.findByRole("heading", { name: "今日の復習" })).toBeInTheDocument();
    expect(screen.getByText("残り 1 件")).toBeInTheDocument();
    expect(screen.getByText("Q card-1")).toBeInTheDocument();
    expect(screen.getByText("穴埋め")).toBeInTheDocument();
    // 出題段階では答えを表示しない。
    expect(screen.queryByText("A card-1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "答えを見る" }));

    expect(await screen.findByText("A card-1")).toBeInTheDocument();
    // 評価ボタンに次回間隔の目安が付く(履歴なしのカードの easy は即卒業 3 日)。
    expect(await screen.findByRole("button", { name: /簡単.*3日後/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /簡単/ }));

    // easy は即卒業なのでセッション完了。
    expect(await screen.findByText("復習が完了しました")).toBeInTheDocument();
    expect(screen.getByText("簡単: 1 件")).toBeInTheDocument();

    // 回答ログが sessionId とスケジューラ ID 付きで保存されている。
    const logs = await storage.repository.listReviewLogs("card-1");
    expect(logs).toHaveLength(1);
    expect(logs[0].grade).toBe("easy");
    expect(logs[0].scheduler).toBe("fixed-interval@1");
    expect(logs[0].sessionId).toBeDefined();
    expect(logs[0].durationMs).toBeDefined();

    // セッションが開始・完了として記録されている。
    const sessions = await storage.repository.listStudySessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].cardIds).toEqual(["card-1"]);
    expect(sessions[0].finishedAt).toBeDefined();
  });

  it("requeues an again-graded card within the session", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository({
      studyCards: [makeCard("card-1")],
      cardSchedules: [dueSchedule("card-1")],
    });

    renderReviewPage("/study/review", storage.repository);

    await user.click(await screen.findByRole("button", { name: "答えを見る" }));
    // again は学習ステップに落ちる(1 分)ためキュー末尾へ戻り、出題段階から再開する。
    await user.click(await screen.findByRole("button", { name: /もう一度/ }));

    expect(await screen.findByRole("button", { name: "答えを見る" })).toBeInTheDocument();
    expect(screen.getByText("残り 1 件")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "答えを見る" }));
    await user.click(await screen.findByRole("button", { name: /簡単/ }));

    expect(await screen.findByText("復習が完了しました")).toBeInTheDocument();
    expect(screen.getByText("もう一度: 1 件")).toBeInTheDocument();
    expect(screen.getByText("簡単: 1 件")).toBeInTheDocument();
  });

  it("offers new cards from the finished screen when unscheduled cards remain", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository({
      // card-1 は復習対象、card-fresh はスケジュール未作成の未学習カード。
      studyCards: [makeCard("card-1"), makeCard("card-fresh")],
      cardSchedules: [dueSchedule("card-1")],
    });

    renderReviewPage("/study/review", storage.repository);

    await user.click(await screen.findByRole("button", { name: "答えを見る" }));
    await user.click(await screen.findByRole("button", { name: /簡単/ }));

    expect(await screen.findByText("復習が完了しました")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "新しく覚える（1 件）" })).toHaveAttribute(
      "href",
      "/study/review?mode=new",
    );
  });

  it("starts a new-cards session capped at ten oldest cards", async () => {
    const cards = Array.from({ length: 11 }, (_, index) =>
      makeCard(
        `card-${String(index).padStart(2, "0")}`,
        `2026-07-01T00:${String(index).padStart(2, "0")}:00.000Z`,
      ),
    );
    const storage = createMemoryStorageRepository({ studyCards: cards });

    renderReviewPage("/study/review?mode=new", storage.repository);

    expect(await screen.findByRole("heading", { name: "新しく覚える" })).toBeInTheDocument();
    // 未学習 11 件のうち上限 10 件だけをキューに載せる。
    expect(await screen.findByText("残り 10 件")).toBeInTheDocument();
    // createdAt が最古のカードから出題する。
    expect(screen.getByText("Q card-00")).toBeInTheDocument();
  });

  it("shows the due-mode empty state with a link to new cards", async () => {
    const storage = createMemoryStorageRepository({ studyCards: [makeCard("card-1")] });

    renderReviewPage("/study/review", storage.repository);

    expect(await screen.findByText("今日の復習はありません。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /新しく覚える/ })).toHaveAttribute(
      "href",
      "/study/review?mode=new",
    );
  });

  it("shows the new-mode empty state when every card is scheduled", async () => {
    const storage = createMemoryStorageRepository({
      studyCards: [makeCard("card-1")],
      cardSchedules: [{ ...dueSchedule("card-1"), dueAt: "2099-01-01T00:00:00.000Z" }],
    });

    renderReviewPage("/study/review?mode=new", storage.repository);

    expect(await screen.findByText("未学習のカードがありません。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "カード一覧を開く" })).toHaveAttribute(
      "href",
      "/study/cards",
    );
  });

  it("stays on the answer and shows an error when recording fails", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository({
      studyCards: [makeCard("card-1")],
      cardSchedules: [dueSchedule("card-1")],
    });
    const failingRepository = {
      ...storage.repository,
      recordReview: () => Promise.reject(new Error("record failed")),
    };

    renderReviewPage("/study/review", failingRepository);

    await user.click(await screen.findByRole("button", { name: "答えを見る" }));
    await user.click(await screen.findByRole("button", { name: /できた/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("回答を保存できませんでした");
    // 回答段階に留まり、再度評価できる。
    expect(screen.getByRole("button", { name: /できた/ })).toBeEnabled();
  });

  it("shows an error with retry when the queue cannot be loaded", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository({
      studyCards: [makeCard("card-1")],
      cardSchedules: [dueSchedule("card-1")],
    });
    let shouldFail = true;
    const flakyRepository = {
      ...storage.repository,
      listDueStudyCards: (dueAtOrBefore: string) =>
        shouldFail
          ? Promise.reject(new Error("load failed"))
          : storage.repository.listDueStudyCards(dueAtOrBefore),
    };

    renderReviewPage("/study/review", flakyRepository);

    expect(await screen.findByRole("alert")).toHaveTextContent("復習項目を読み込めませんでした");

    shouldFail = false;
    await user.click(screen.getByRole("button", { name: "再試行" }));

    expect(await screen.findByRole("button", { name: "答えを見る" })).toBeInTheDocument();
  });

  it("supports keyboard shortcuts for reveal and grading", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository({
      studyCards: [makeCard("card-1")],
      cardSchedules: [dueSchedule("card-1")],
    });

    renderReviewPage("/study/review", storage.repository);

    await screen.findByRole("button", { name: "答えを見る" });
    await user.keyboard(" ");

    expect(await screen.findByText("A card-1")).toBeInTheDocument();

    // "3" = good。履歴なしのカードは学習 step 1(10 分)に進み再出題される。
    await user.keyboard("3");

    expect(await screen.findByRole("button", { name: "答えを見る" })).toBeInTheDocument();

    const logs = await storage.repository.listReviewLogs("card-1");
    expect(logs).toHaveLength(1);
    expect(logs[0].grade).toBe("good");
  });
});
