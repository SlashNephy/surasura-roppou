import type { LawNode } from "@/core/domain";

import { generateArticleNumberCandidates } from "./rules/article-number";
import { generateDefinitionCandidates } from "./rules/definition";
import { generateFillBlankCandidates } from "./rules/fill-blank";
import { generateTrueFalseCandidates } from "./rules/true-false";
import { isDeletedArticle } from "./text";
import type { GenerationContext, QuizCandidate } from "./types";

// 条文からクイズ候補を決定的に生成する。乱数・時刻・外部 API に依存しないため、
// 同じ条文からは常に同じ候補が得られる。粗い候補の取捨選択はプレビュー UI に委ねる。
export const generateQuizCandidates = (
  article: LawNode,
  context: GenerationContext,
): QuizCandidate[] => {
  if (article.type !== "Article") {
    return [];
  }

  const nodesById = new Map(context.nodes.map((node) => [node.id, node]));

  if (isDeletedArticle(article, nodesById)) {
    return [];
  }

  // プレビューの種別グループ表示に合わせた固定順で連結する。
  return [
    ...generateDefinitionCandidates(article, context, nodesById),
    ...generateFillBlankCandidates(article, nodesById),
    ...generateArticleNumberCandidates(article, context, nodesById),
    ...generateTrueFalseCandidates(article, nodesById),
  ];
};
