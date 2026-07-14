import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";
import { createQuizLawNodes, findQuizArticle } from "@/test/fixtures/quizNodes";

import { generateTrueFalseCandidates } from "./true-false";

const setup = (paragraphs: string[]) => {
  const nodes = createQuizLawNodes([{ number: "772", title: "第七百七十二条", paragraphs }]);
  const article = findQuizArticle(nodes, "772");
  const nodesById = new Map<string, LawNode>(nodes.map((node) => [node.id, node]));

  return { article, nodesById };
};

describe("generateTrueFalseCandidates", () => {
  it("swaps みなす with 推定する and appends one true statement", () => {
    const { article, nodesById } = setup(["嫡出であるものと推定する。"]);

    const candidates = generateTrueFalseCandidates(article, nodesById);

    expect(candidates).toEqual([
      {
        type: "true_false",
        ruleId: "true-false@1",
        question: "次の記述は正しいか。\n嫡出であるものとみなす。",
        answer: "×（正しくは「推定する」）",
        sourceNodeId: article.id,
      },
      {
        type: "true_false",
        ruleId: "true-false@1",
        question: "次の記述は正しいか。\n嫡出であるものと推定する。",
        answer: "○",
        sourceNodeId: article.id,
      },
    ]);
  });

  it("swaps only the first effect term in a sentence", () => {
    const { article, nodesById } = setup(["財産とみなすものとし、請求することができる。"]);

    const candidates = generateTrueFalseCandidates(article, nodesById);
    const falseCandidates = candidates.filter((candidate) => candidate.answer !== "○");

    // 「みなす」と「することができる」の両方を含む文でも、置換は最初の 1 箇所（みなす）のみ。
    // 複数置換すると誤り箇所が特定できない問題になる。
    expect(falseCandidates).toHaveLength(1);
    expect(falseCandidates[0]).toMatchObject({
      question: "次の記述は正しいか。\n財産と推定するものとし、請求することができる。",
      answer: "×（正しくは「みなす」）",
    });
  });

  it("caps false statements at 2 per paragraph", () => {
    const { article, nodesById } = setup(["Aと推定する。Bと推定する。Cと推定する。"]);

    const candidates = generateTrueFalseCandidates(article, nodesById);
    const falseCandidates = candidates.filter((candidate) => candidate.answer !== "○");

    expect(falseCandidates).toHaveLength(2);
  });

  it("returns no candidates when the article has no swappable effect term", () => {
    const { article, nodesById } = setup(["権利の濫用は、これを許さない。"]);

    expect(generateTrueFalseCandidates(article, nodesById)).toEqual([]);
  });
});
