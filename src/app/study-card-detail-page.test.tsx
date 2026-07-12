import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { StudyCard } from "@/core/domain";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { createAppRouter } from "./router";

setupScrollMocks();

const card = {
  id: "card-1",
  source: "manual",
  target: { lawId: "129AC0000000089", revisionId: "rev-1", article: "1" },
  type: "fill_blank",
  question: "私権は、（　　）に適合しなければならない。",
  answer: "公共の福祉",
  explanation: "民法1条。",
  tags: ["総則"],
  examPinned: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
} satisfies StudyCard;

const renderDetailPage = (path = `/study/cards/${card.id}`, studyCards: StudyCard[] = [card]) => {
  const storage = createMemoryStorageRepository({ studyCards });
  const history = createMemoryHistory({ initialEntries: [path] });

  render(
    <RouterProvider router={createAppRouter({ history, storageRepository: storage.repository })} />,
  );

  return { history, storage };
};

describe("StudyCardDetailPage", () => {
  it("edits and saves the card fields", async () => {
    const user = userEvent.setup();
    const { storage } = renderDetailPage();

    const questionInput = await screen.findByLabelText("問題文");
    expect(questionInput).toHaveValue(card.question);

    await user.clear(questionInput);
    await user.type(questionInput, "改訂した問題文");
    await user.selectOptions(screen.getByLabelText("種別"), "true_false");
    await user.click(screen.getByLabelText("試験直前に確認"));
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    await waitFor(() => {
      expect(storage.getStudyCards()[0]).toMatchObject({
        id: card.id,
        question: "改訂した問題文",
        type: "true_false",
        examPinned: true,
      });
    });
    // 保存で updatedAt が進む。
    expect(storage.getStudyCards()[0].updatedAt).not.toBe(card.updatedAt);
    expect(await screen.findByText("保存しました。")).toBeInTheDocument();
  });

  it("deletes the card after confirmation and returns to the list", async () => {
    const user = userEvent.setup();
    const { history, storage } = renderDetailPage();

    await user.click(await screen.findByRole("button", { name: "カードを削除" }));
    await user.click(await screen.findByRole("button", { name: "削除する" }));

    await waitFor(() => {
      expect(storage.getStudyCards()).toHaveLength(0);
    });
    await waitFor(() => {
      expect(history.location.pathname).toBe("/study/cards");
    });
  });

  it("shows a not-found message for unknown ids", async () => {
    renderDetailPage("/study/cards/missing-card", []);

    expect(await screen.findByText("カードが見つかりません。")).toBeInTheDocument();
  });
});
