import type { LawNode } from "@/core/domain";

import { collectParagraphTexts, formatArticleLabel, splitSentences } from "../text";
import type { GenerationContext, QuizCandidate } from "../types";

export const definitionRuleId = "definition@1";

// 法令の定義規定の定型「「X」とは、Y をいう」。
// かぎ括弧なしの形式は主語の切り出しを誤りやすいため対象外とする（spec 3.2）。
const definitionPattern = /「([^「」]+)」とは、(.+?)をいう/g;

export const generateDefinitionCandidates = (
  article: LawNode,
  context: GenerationContext,
  nodesById: ReadonlyMap<string, LawNode>,
): QuizCandidate[] => {
  const articleLabel = formatArticleLabel(article);

  if (articleLabel === undefined) {
    return [];
  }

  const candidates: QuizCandidate[] = [];

  for (const paragraphText of collectParagraphTexts(article, nodesById)) {
    for (const sentence of splitSentences(paragraphText)) {
      for (const match of sentence.matchAll(definitionPattern)) {
        candidates.push({
          type: "definition",
          ruleId: definitionRuleId,
          question: `${context.lawTitle}${articleLabel}において「${match[1]}」とは何をいうか？`,
          answer: `${match[2]}をいう。`,
          sourceNodeId: article.id,
        });
      }
    }
  }

  return candidates;
};
