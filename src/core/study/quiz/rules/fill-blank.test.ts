import { describe, expect, it } from "vitest";

import type { LawNode } from "@/core/domain";
import { createQuizLawNodes, findQuizArticle } from "@/test/fixtures/quizNodes";

import { generateFillBlankCandidates } from "./fill-blank";

const setup = (paragraphs: string[]) => {
  const nodes = createQuizLawNodes([{ number: "1", title: "第一条", paragraphs }]);
  const article = findQuizArticle(nodes, "1");
  const nodesById = new Map<string, LawNode>(nodes.map((node) => [node.id, node]));

  return { article, nodesById };
};

describe("generateFillBlankCandidates", () => {
  it.each([
    {
      name: "extracts a kanji-number period with its boundary qualifier",
      paragraphs: ["十年以下の懲役に処する。"],
      expected: [{ question: "（　　）の懲役に処する。", answer: "十年以下" }],
    },
    {
      name: "extracts an arabic-number period before the effect term",
      paragraphs: ["30日以内に届出をしなければならない。"],
      expected: [
        { question: "（　　）に届出をしなければならない。", answer: "30日以内" },
        { question: "30日以内に届出を（　　）。", answer: "しなければならない" },
      ],
    },
    {
      name: "extracts a fraction",
      paragraphs: ["各共有者の持分は、十分の一とする。"],
      expected: [{ question: "各共有者の持分は、（　　）とする。", answer: "十分の一" }],
    },
    {
      name: "prefers the longest effect term",
      paragraphs: ["債務者に対抗することができない。"],
      expected: [{ question: "債務者に（　　）。", answer: "対抗することができない" }],
    },
    {
      name: "returns no candidates when nothing matches",
      paragraphs: ["権利の濫用は、これを許さない。"],
      expected: [],
    },
  ])("$name", ({ paragraphs, expected }) => {
    const { article, nodesById } = setup(paragraphs);

    const candidates = generateFillBlankCandidates(article, nodesById);

    expect(candidates.map(({ question, answer }) => ({ question, answer }))).toEqual(expected);
    for (const candidate of candidates) {
      expect(candidate).toMatchObject({
        type: "fill_blank",
        ruleId: "fill-blank@1",
        sourceNodeId: article.id,
      });
    }
  });

  it("masks every occurrence of the extracted phrase in the sentence", () => {
    const { article, nodesById } = setup(["三年ごとに三年を超えない範囲で定める。"]);

    const [candidate] = generateFillBlankCandidates(article, nodesById);

    // 答えの語句が問題文に残っていると答えが露出するため、同一語句はすべて置換する。
    expect(candidate.question).toBe("（　　）ごとに（　　）を超えない範囲で定める。");
    expect(candidate.answer).toBe("三年");
  });

  it("prioritizes number phrases and caps candidates at 4 per paragraph", () => {
    const { article, nodesById } = setup(["一年、二年、三年、四年又は五年とすることができる。"]);

    const candidates = generateFillBlankCandidates(article, nodesById);

    expect(candidates).toHaveLength(4);
    // 数字・期間を優先するため、効果語「することができる」は上限に達して落ちる。
    expect(candidates.map((candidate) => candidate.answer)).toEqual([
      "一年",
      "二年",
      "三年",
      "四年",
    ]);
  });

  it("deduplicates identical question-answer pairs", () => {
    const { article, nodesById } = setup(["十年とする。", "十年とする。"]);

    const candidates = generateFillBlankCandidates(article, nodesById);

    expect(candidates).toHaveLength(1);
  });
});
