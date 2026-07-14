import { describe, expect, it } from "vitest";

import { createQuizLawNodes, findQuizArticle } from "@/test/fixtures/quizNodes";

import { generateQuizCandidates } from "./generate";

describe("generateQuizCandidates", () => {
  it("combines rules in the definition, fill_blank, article_number, true_false order", () => {
    const nodes = createQuizLawNodes([
      {
        number: "85",
        title: "第八十五条",
        caption: "（定義）",
        paragraphs: ["この法律において「物」とは、有体物をいう。三年ごとに見直すものと推定する。"],
      },
      { number: "86", title: "第八十六条", paragraphs: ["土地及びその定着物は、不動産とする。"] },
    ]);
    const article = findQuizArticle(nodes, "85");

    const candidates = generateQuizCandidates(article, { lawTitle: "民法", nodes });

    // 種別ごとにグループ表示する前提の固定順で返す。
    const types = candidates.map((candidate) => candidate.type);
    expect(types).toEqual([...types].sort((a, b) => typeOrder(a) - typeOrder(b)));
    expect(new Set(types)).toEqual(
      new Set(["definition", "fill_blank", "article_number", "true_false"]),
    );
    for (const candidate of candidates) {
      expect(candidate.sourceNodeId).toBe(article.id);
    }
  });

  it("returns no candidates for a deleted article", () => {
    const nodes = createQuizLawNodes([
      { number: "1", title: "第一条", paragraphs: ["削除"] },
      { number: "2", title: "第二条", paragraphs: ["十年とする。"] },
    ]);

    expect(
      generateQuizCandidates(findQuizArticle(nodes, "1"), { lawTitle: "民法", nodes }),
    ).toEqual([]);
  });

  it("returns no candidates for a non-article node", () => {
    const nodes = createQuizLawNodes([
      { number: "1", title: "第一条", paragraphs: ["十年とする。"] },
    ]);
    const paragraph = nodes.find((node) => node.type === "Paragraph");

    if (paragraph === undefined) {
      throw new Error("paragraph not found in fixture");
    }

    expect(generateQuizCandidates(paragraph, { lawTitle: "民法", nodes })).toEqual([]);
  });
});

const typeOrder = (type: string): number =>
  ["definition", "fill_blank", "article_number", "true_false"].indexOf(type);
