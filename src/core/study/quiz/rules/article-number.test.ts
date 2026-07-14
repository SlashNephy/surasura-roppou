import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";
import { createQuizLawNodes, findQuizArticle } from "@/test/fixtures/quizNodes";
import type { QuizFixtureArticle } from "@/test/fixtures/quizNodes";

import type { GenerationContext } from "../types";
import { generateArticleNumberCandidates } from "./article-number";

// 第 n 条 × count 個の連番 fixture。
const sequentialArticles = (count: number): QuizFixtureArticle[] =>
  Array.from({ length: count }, (_, index) => ({
    number: String(index + 1),
    title: `第${String(index + 1)}条`,
    paragraphs: [`第${String(index + 1)}条の本文。`],
  }));

const setup = (articles: QuizFixtureArticle[], targetNumber: string) => {
  const nodes = createQuizLawNodes(articles);
  const article = findQuizArticle(nodes, targetNumber);
  const context: GenerationContext = { lawTitle: "民法", nodes };
  const nodesById = new Map<string, LawNode>(nodes.map((node) => [node.id, node]));

  return { article, context, nodesById };
};

describe("generateArticleNumberCandidates", () => {
  it("picks the previous, next and +5 articles as distractors in document order", () => {
    const { article, context, nodesById } = setup(sequentialArticles(20), "10");

    const [candidate] = generateArticleNumberCandidates(article, context, nodesById);

    expect(candidate).toMatchObject({
      type: "article_number",
      ruleId: "article-number@1",
      answer: "第10条",
      choices: ["第9条", "第10条", "第11条", "第15条"],
      sourceNodeId: article.id,
    });
    expect(candidate.question).toBe("次の条文は民法の第何条か？\n「第10条の本文。」");
  });

  it("fills distractors from the other side for the first article", () => {
    const { article, context, nodesById } = setup(sequentialArticles(20), "1");

    const [candidate] = generateArticleNumberCandidates(article, context, nodesById);

    // 直前が存在しないため、直後・+5 と前後走査のフォールバックで 3 つ埋める。
    expect(candidate.choices).toEqual(["第1条", "第2条", "第3条", "第6条"]);
    expect(candidate.answer).toBe("第1条");
  });

  it("shrinks the choice list when the law has fewer than 4 articles", () => {
    const { article, context, nodesById } = setup(sequentialArticles(3), "2");

    const [candidate] = generateArticleNumberCandidates(article, context, nodesById);

    expect(candidate.choices).toEqual(["第1条", "第2条", "第3条"]);
  });

  it("generates no candidate when the law has a single article", () => {
    const { article, context, nodesById } = setup(sequentialArticles(1), "1");

    expect(generateArticleNumberCandidates(article, context, nodesById)).toEqual([]);
  });

  it("truncates the snippet to 120 characters with an ellipsis", () => {
    const longBody = `${"あ".repeat(150)}。`;
    const { article, context, nodesById } = setup(
      [
        { number: "1", title: "第1条", paragraphs: [longBody] },
        { number: "2", title: "第2条", paragraphs: ["短い本文。"] },
      ],
      "1",
    );

    const [candidate] = generateArticleNumberCandidates(article, context, nodesById);

    expect(candidate.question).toBe(`次の条文は民法の第何条か？\n「${"あ".repeat(120)}…」`);
  });

  it("uses the original branch article title", () => {
    const { article, context, nodesById } = setup(
      [
        { number: "242", title: "第二百四十二条", paragraphs: ["本体条文。"] },
        { number: "242-2", title: "第二百四十二条の二", paragraphs: ["枝番条文。"] },
        { number: "243", title: "第二百四十三条", paragraphs: ["次条。"] },
      ],
      "242-2",
    );

    const [candidate] = generateArticleNumberCandidates(article, context, nodesById);

    expect(candidate.answer).toBe("第二百四十二条の二");
    expect(candidate.choices).toContain("第二百四十二条");
  });
});
