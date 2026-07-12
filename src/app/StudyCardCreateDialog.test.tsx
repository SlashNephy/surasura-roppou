import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { computeArticleFingerprint } from "@/core/domain";
import type { LawNode } from "@/core/domain";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";

import { StudyCardCreateDialog } from "./StudyCardCreateDialog";

const articleNode = {
  id: "129AC0000000089:rev-1:article:1",
  lawId: "129AC0000000089",
  revisionId: "rev-1",
  type: "Article",
  path: "article:1",
  number: "1",
  title: "第一条",
  rawText: "第一条　私権は、公共の福祉に適合しなければならない。",
  plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
  children: [],
} satisfies LawNode;

const renderDialog = (
  storageRepository = createMemoryStorageRepository().repository,
  onOpenChange: (open: boolean) => void = () => undefined,
) => {
  render(
    <StudyCardCreateDialog
      articleNumber="1"
      lawId="129AC0000000089"
      lawTitle="民法"
      node={articleNode}
      onOpenChange={onOpenChange}
      open
      revisionId="rev-1"
      storageRepository={storageRepository}
    />,
  );
};

describe("StudyCardCreateDialog", () => {
  it("saves a manual card anchored to the article", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository();
    const openChanges: boolean[] = [];
    renderDialog(storage.repository, (open) => openChanges.push(open));

    expect(screen.getByText("民法 第一条")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("種別"), "definition");
    await user.type(screen.getByLabelText("問題文"), "私権の基本原則とは？");
    await user.type(screen.getByLabelText("答え"), "公共の福祉への適合");
    await user.type(screen.getByLabelText("解説（任意）"), "民法1条の大原則。");
    await user.type(screen.getByLabelText("タグ（カンマ区切り、任意）"), "民法, 総則, 民法");
    await user.click(screen.getByRole("button", { name: "カードを保存" }));

    await waitFor(() => {
      expect(storage.getStudyCards()).toHaveLength(1);
    });

    const card = storage.getStudyCards()[0];
    const fingerprint = await computeArticleFingerprint(articleNode.plainText);

    expect(card).toMatchObject({
      source: "manual",
      type: "definition",
      question: "私権の基本原則とは？",
      answer: "公共の福祉への適合",
      explanation: "民法1条の大原則。",
      tags: ["民法", "総則"],
      examPinned: false,
      target: {
        lawId: "129AC0000000089",
        article: "1",
        revisionId: "rev-1",
        fingerprint,
      },
    });
    expect(openChanges).toEqual([false]);
  });

  it("requires question and answer", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository();
    renderDialog(storage.repository);

    await user.click(screen.getByRole("button", { name: "カードを保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("問題文と答えを入力してください。");
    expect(storage.getStudyCards()).toHaveLength(0);
  });

  it("clears the form when the dialog is closed", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository();
    let latestOpen = true;
    const handleOpenChange = (open: boolean) => {
      latestOpen = open;
    };
    const view = render(
      <StudyCardCreateDialog
        articleNumber="1"
        lawId="129AC0000000089"
        lawTitle="民法"
        node={articleNode}
        onOpenChange={handleOpenChange}
        open
        revisionId="rev-1"
        storageRepository={storage.repository}
      />,
    );

    await user.type(screen.getByLabelText("問題文"), "途中の入力");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(latestOpen).toBe(false);

    // open を false にしてから true に切り替えると再度ダイアログが開く。
    // 閉じたときに resetForm が呼ばれていれば入力が空になる。
    view.rerender(
      <StudyCardCreateDialog
        articleNumber="1"
        lawId="129AC0000000089"
        lawTitle="民法"
        node={articleNode}
        onOpenChange={handleOpenChange}
        open={false}
        revisionId="rev-1"
        storageRepository={storage.repository}
      />,
    );
    view.rerender(
      <StudyCardCreateDialog
        articleNumber="1"
        lawId="129AC0000000089"
        lawTitle="民法"
        node={articleNode}
        onOpenChange={handleOpenChange}
        open
        revisionId="rev-1"
        storageRepository={storage.repository}
      />,
    );

    expect(screen.getByLabelText("問題文")).toHaveValue("");
  });

  it("keeps the dialog open and shows an error when saving fails", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository();
    const failingRepository = {
      ...storage.repository,
      putStudyCard: () => Promise.reject(new Error("quota exceeded")),
    };
    const openChanges: boolean[] = [];
    renderDialog(failingRepository, (open) => openChanges.push(open));

    await user.type(screen.getByLabelText("問題文"), "Q");
    await user.type(screen.getByLabelText("答え"), "A");
    await user.click(screen.getByRole("button", { name: "カードを保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "カードを保存できませんでした。端末の保存領域を確認してください。",
    );
    // 失敗時はダイアログを閉じず、入力内容を保持する。
    expect(openChanges).toEqual([]);
    expect(screen.getByLabelText("問題文")).toHaveValue("Q");
  });
});
