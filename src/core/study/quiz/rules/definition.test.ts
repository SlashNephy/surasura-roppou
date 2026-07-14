import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";
import { createQuizLawNodes, findQuizArticle } from "@/test/fixtures/quizNodes";

import type { GenerationContext } from "../types";
import { generateDefinitionCandidates } from "./definition";

const setup = (paragraphs: string[]) => {
  const nodes = createQuizLawNodes([{ number: "85", title: "第八十五条", paragraphs }]);
  const article = findQuizArticle(nodes, "85");
  const context: GenerationContext = { lawTitle: "民法", nodes };
  const nodesById = new Map<string, LawNode>(nodes.map((node) => [node.id, node]));

  return { article, context, nodesById };
};

describe("generateDefinitionCandidates", () => {
  it("builds a definition quiz from the standard definition sentence", () => {
    const { article, context, nodesById } = setup(["この法律において「物」とは、有体物をいう。"]);

    const candidates = generateDefinitionCandidates(article, context, nodesById);

    expect(candidates).toEqual([
      {
        type: "definition",
        ruleId: "definition@1",
        question: "民法第八十五条において「物」とは何をいうか？",
        answer: "有体物をいう。",
        sourceNodeId: article.id,
      },
    ]);
  });

  it("detects a definition without the この法律において preamble", () => {
    const { article, context, nodesById } = setup([
      "「電子計算機」とは、演算を自動的に行う機器をいう。",
    ]);

    const [candidate] = generateDefinitionCandidates(article, context, nodesById);

    expect(candidate.question).toBe("民法第八十五条において「電子計算機」とは何をいうか？");
    expect(candidate.answer).toBe("演算を自動的に行う機器をいう。");
  });

  it("collects multiple definitions in one article", () => {
    const { article, context, nodesById } = setup([
      "「甲」とは、Aをいう。",
      "「乙」とは、Bをいう。",
    ]);

    const candidates = generateDefinitionCandidates(article, context, nodesById);

    expect(candidates.map((candidate) => candidate.answer)).toEqual(["Aをいう。", "Bをいう。"]);
  });

  it("ignores definitions without kagi brackets", () => {
    // かぎ括弧なしの「X とは、Y をいう」は主語の切り出しを誤りやすいため v1 では対象外（spec 3.2）。
    const { article, context, nodesById } = setup(["時効とは、期間の経過をいう。"]);

    expect(generateDefinitionCandidates(article, context, nodesById)).toEqual([]);
  });
});
