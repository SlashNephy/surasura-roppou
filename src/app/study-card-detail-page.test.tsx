import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { StudyCard } from "@/core/domain";
import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { sampleLawViewerDocument } from "./law-viewer-sample";
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

const renderDetailPage = (
  path = `/study/cards/${card.id}`,
  studyCards: StudyCard[] = [card],
  withSavedLaw = false,
) => {
  const storage = createMemoryStorageRepository({
    studyCards,
    // 法令名解決のテストでは savedLawDocument を注入する。
    ...(withSavedLaw
      ? {
          savedLawDocument: createSavedLawDocument({
            law: sampleLawViewerDocument.law,
            revision: sampleLawViewerDocument.revision,
            nodes: sampleLawViewerDocument.nodes,
          }),
        }
      : {}),
  });
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

  it("resolves law title from saved laws in the basis link", async () => {
    // card の target.lawId は 129AC0000000089 (民法) で sampleLawViewerDocument と一致する。
    renderDetailPage(`/study/cards/${card.id}`, [card], true);

    // 根拠リンクが「民法 第1条」と表示されることを検証する。
    expect(await screen.findByText("民法 第1条")).toBeInTheDocument();
  });

  it("prevents double deletion while a delete is in flight", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository({ studyCards: [card] });

    // resolve を保留して削除処理を in-flight 状態に保つスタブ
    let resolveDelete: (() => void) | undefined;
    const deleteStudyCard = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    // storage のリポジトリの deleteStudyCard だけをスタブに差し替える
    const repository = { ...storage.repository, deleteStudyCard };
    const history = createMemoryHistory({ initialEntries: [`/study/cards/${card.id}`] });

    render(<RouterProvider router={createAppRouter({ history, storageRepository: repository })} />);

    // 削除確認ダイアログを開いて「削除する」を 2 回クリックする
    await user.click(await screen.findByRole("button", { name: "カードを削除" }));
    const confirmButton = await screen.findByRole("button", { name: "削除する" });
    await user.click(confirmButton);
    // 2 回目のクリックは disabled により no-op になるはず
    await user.click(confirmButton);

    // deleteStudyCard は最初の 1 回のみ呼ばれる
    expect(deleteStudyCard).toHaveBeenCalledTimes(1);
    resolveDelete?.();
  });
});
