import type { LawNode } from "@/core/domain";

import { collectParagraphTexts, formatArticleLabel } from "../text";
import type { GenerationContext, QuizCandidate } from "../types";

export const articleNumberRuleId = "article-number@1";

// snippet の最大文字数。カードの問題文として一覧・ダイアログに収まる長さに抑える。
const snippetMaxLength = 120;
// 誤答選択肢の数。正解と合わせて 4 択にする。
const distractorCount = 3;

export const generateArticleNumberCandidates = (
  article: LawNode,
  context: GenerationContext,
  nodesById: ReadonlyMap<string, LawNode>,
): QuizCandidate[] => {
  const answerLabel = formatArticleLabel(article);

  if (answerLabel === undefined) {
    return [];
  }

  // 附則の条も含む文書順の条一覧。文書順は nodes の並びがそのまま保持している。
  const articles = context.nodes.filter((node) => node.type === "Article");
  const targetIndex = articles.findIndex((node) => node.id === article.id);

  if (targetIndex === -1) {
    return [];
  }

  // .at(0) は空配列で undefined を返すため、undefined チェックで本文なし条を除外できる。
  const firstParagraph = collectParagraphTexts(article, nodesById).at(0);

  if (firstParagraph === undefined) {
    return [];
  }

  const distractorIndexes = pickDistractorIndexes(articles, targetIndex, answerLabel);

  // 誤答が 1 つも作れない法令（1 条のみ等）では多択が成立しないため候補を生成しない。
  if (distractorIndexes.length === 0) {
    return [];
  }

  const snippet =
    firstParagraph.length > snippetMaxLength
      ? `${firstParagraph.slice(0, snippetMaxLength)}…`
      : firstParagraph;
  // 選択肢は文書順に整列する。乱数を使わずに正解の位置が条ごとに自然にばらける。
  const choices = [targetIndex, ...distractorIndexes]
    .sort((left, right) => left - right)
    .map((index) => formatArticleLabel(articles[index]))
    .filter((label): label is string => label !== undefined);

  return [
    {
      type: "article_number",
      ruleId: articleNumberRuleId,
      question: `次の条文は${context.lawTitle}の第何条か？\n「${snippet}」`,
      answer: answerLabel,
      choices,
      sourceNodeId: article.id,
    },
  ];
};

// 誤答の条を決定的に選ぶ。直前・直後・5 つ後を優先し、足りない分は前後に走査を広げて補う。
// 附則で条番号が振り直される法令があるため、表示名の重複は誤答として採用しない。
const pickDistractorIndexes = (
  articles: readonly LawNode[],
  targetIndex: number,
  answerLabel: string,
): number[] => {
  const preferred = [targetIndex - 1, targetIndex + 1, targetIndex + 5];
  const fallbacks: number[] = [];

  for (let distance = 2; distance < articles.length; distance += 1) {
    fallbacks.push(targetIndex - distance, targetIndex + distance);
  }

  const usedIndexes = new Set([targetIndex]);
  const usedLabels = new Set([answerLabel]);
  const result: number[] = [];

  for (const index of [...preferred, ...fallbacks]) {
    if (result.length >= distractorCount) {
      break;
    }

    if (index < 0 || index >= articles.length || usedIndexes.has(index)) {
      continue;
    }

    usedIndexes.add(index);
    const label = formatArticleLabel(articles[index]);

    if (label === undefined || usedLabels.has(label)) {
      continue;
    }

    usedLabels.add(label);
    result.push(index);
  }

  return result;
};
