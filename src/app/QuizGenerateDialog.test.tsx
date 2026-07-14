import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { computeArticleFingerprint } from "@/core/domain";
import type { LawNode } from "@/core/domain";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";
import { createQuizLawNodes, findQuizArticle } from "@/test/fixtures/quizNodes";

import { QuizGenerateDialog } from "./QuizGenerateDialog";

// 定義語 1 件・穴埋め 1 件・条文番号当て 1 件・正誤 2 件（×1 + ○1）が生成される条文。
const nodes = createQuizLawNodes([
  {
    number: "85",
    title: "第八十五条",
    paragraphs: ["この法律において「物」とは、有体物をいう。十年ごとに見直すものと推定する。"],
  },
  { number: "86", title: "第八十六条", paragraphs: ["土地及びその定着物は、不動産とする。"] },
  { number: "87", title: "第八十七条", paragraphs: ["従物は、主物の処分に従う。"] },
  { number: "88", title: "第八十八条", paragraphs: ["天然果実は、元物から分離する。"] },
]);
const articleNode = findQuizArticle(nodes, "85");

const renderDialog = (
  storageRepository = createMemoryStorageRepository().repository,
  onOpenChange: (open: boolean) => void = () => undefined,
  node: LawNode = articleNode,
) => {
  render(
    <QuizGenerateDialog
      articleNumber="85"
      lawId="129AC0000000089"
      lawTitle="民法"
      node={node}
      nodes={nodes}
      onOpenChange={onOpenChange}
      open
      revisionId="rev-1"
      storageRepository={storageRepository}
    />,
  );
};

describe("QuizGenerateDialog", () => {
  it("shows generated candidates grouped by card type", async () => {
    renderDialog();

    expect(await screen.findByRole("heading", { name: "クイズカードを生成" })).toBeInTheDocument();
    // 種別グループの見出し。studyCardTypeLabels と同じ文言を使う。
    expect(screen.getByRole("heading", { name: "定義語" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "穴埋め" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "条文番号当て" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "正誤" })).toBeInTheDocument();
  });

  it("saves only the selected candidates as auto cards with the anchor and choices", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository();
    const openChanges: boolean[] = [];
    renderDialog(storage.repository, (open) => openChanges.push(open));

    // 既定は全選択。1 件だけ残して他を解除する。
    await user.click(await screen.findByRole("button", { name: "すべて解除" }));
    const articleNumberGroup = screen.getByRole("group", { name: "条文番号当て" });
    await user.click(within(articleNumberGroup).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /選択した 1 件を保存/ }));

    await waitFor(() => {
      expect(storage.getStudyCards()).toHaveLength(1);
    });

    const card = storage.getStudyCards()[0];
    const fingerprint = await computeArticleFingerprint(articleNode.plainText);

    expect(card).toMatchObject({
      source: "auto",
      type: "article_number",
      answer: "第八十五条",
      tags: [],
      examPinned: false,
      target: { lawId: "129AC0000000089", article: "85", revisionId: "rev-1", fingerprint },
    });
    expect(card.choices).toContain("第八十五条");
    expect(card.choices).toHaveLength(4);
    expect(openChanges).toEqual([false]);
  });

  it("reflects inline edits of question and answer in the saved card", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository();
    renderDialog(storage.repository);

    await user.click(await screen.findByRole("button", { name: "すべて解除" }));
    const definitionGroup = screen.getByRole("group", { name: "定義語" });
    await user.click(within(definitionGroup).getByRole("checkbox"));

    const questionInput = within(definitionGroup).getByLabelText("問題文");
    await user.clear(questionInput);
    await user.type(questionInput, "編集した問題文");
    await user.click(screen.getByRole("button", { name: /選択した 1 件を保存/ }));

    await waitFor(() => {
      expect(storage.getStudyCards()).toHaveLength(1);
    });
    expect(storage.getStudyCards()[0].question).toBe("編集した問題文");
  });

  it("shows a validation error when a selected candidate has an empty question", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository();
    renderDialog(storage.repository);

    await user.click(await screen.findByRole("button", { name: "すべて解除" }));
    const definitionGroup = screen.getByRole("group", { name: "定義語" });
    await user.click(within(definitionGroup).getByRole("checkbox"));
    await user.clear(within(definitionGroup).getByLabelText("問題文"));
    await user.click(screen.getByRole("button", { name: /選択した 1 件を保存/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "選択中の候補に未入力の問題文または答えがあります。",
    );
    expect(storage.getStudyCards()).toHaveLength(0);
  });

  it("disables the save button when nothing is selected", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole("button", { name: "すべて解除" }));

    expect(screen.getByRole("button", { name: /選択した 0 件を保存/ })).toBeDisabled();
  });

  it("shows an empty state with manual-creation guidance for a deleted article", async () => {
    const deletedNodes = createQuizLawNodes([
      { number: "1", title: "第一条", paragraphs: ["削除"] },
    ]);

    render(
      <QuizGenerateDialog
        articleNumber="1"
        lawId="129AC0000000089"
        lawTitle="民法"
        node={findQuizArticle(deletedNodes, "1")}
        nodes={deletedNodes}
        onOpenChange={() => undefined}
        open
        revisionId="rev-1"
        storageRepository={createMemoryStorageRepository().repository}
      />,
    );

    expect(
      await screen.findByText(/この条文からクイズ候補が見つかりませんでした/),
    ).toBeInTheDocument();
    expect(screen.getByText(/「カードを作る」から手動で作成できます/)).toBeInTheDocument();
  });

  it("keeps the dialog open and reports the saved count when saving fails midway", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository();
    let callCount = 0;
    const failingRepository = {
      ...storage.repository,
      // 2 件目で失敗させ、途中失敗の報告を検証する。
      putStudyCard: (card: Parameters<typeof storage.repository.putStudyCard>[0]) => {
        callCount += 1;
        return callCount >= 2
          ? Promise.reject(new Error("quota exceeded"))
          : storage.repository.putStudyCard(card);
      },
    };
    const openChanges: boolean[] = [];
    renderDialog(failingRepository, (open) => openChanges.push(open));

    await screen.findByRole("heading", { name: "クイズカードを生成" });
    await user.click(screen.getByRole("button", { name: /選択した \d+ 件を保存/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /1 件を保存した時点で保存に失敗しました/,
    );
    expect(openChanges).toEqual([]);
  });

  it("does not duplicate already saved cards when retrying after a failure", async () => {
    const user = userEvent.setup();
    const storage = createMemoryStorageRepository();
    let callCount = 0;
    const failingOnceRepository = {
      ...storage.repository,
      // 2 件目だけ失敗させ、部分保存後の再試行を検証する。
      putStudyCard: (card: Parameters<typeof storage.repository.putStudyCard>[0]) => {
        callCount += 1;
        return callCount === 2
          ? Promise.reject(new Error("quota exceeded"))
          : storage.repository.putStudyCard(card);
      },
    };
    renderDialog(failingOnceRepository);

    await screen.findByRole("heading", { name: "クイズカードを生成" });
    const candidateCount = screen.getAllByRole("checkbox").length;
    await user.click(screen.getByRole("button", { name: /選択した \d+ 件を保存/ }));
    await screen.findByRole("alert");

    // 保存済みの候補は一覧から取り除かれる。
    expect(screen.getAllByRole("checkbox")).toHaveLength(candidateCount - 1);

    // 再試行すると残りだけが保存され、保存済みカードは重複しない。
    await user.click(screen.getByRole("button", { name: /選択した \d+ 件を保存/ }));
    await waitFor(() => {
      expect(storage.getStudyCards()).toHaveLength(candidateCount);
    });
    const questions = storage.getStudyCards().map((card) => card.question);
    expect(new Set(questions).size).toBe(questions.length);
  });
});
