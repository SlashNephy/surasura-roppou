import type { LawNode } from "@/core/domain";

import { collectParagraphTexts, splitSentences } from "../text";
import type { QuizCandidate } from "../types";

export const trueFalseRuleId = "true-false@1";

// 意味が対になる効果語の交換ペア。置換後も日本語として自然な組に限定する。
// 「みなす」は文中で「みなし」に活用されるが、活用形の置換は不自然な文を作りやすいため
// 終止形で現れたもののみ対象とする。
const swapPairs: readonly (readonly [string, string])[] = [
  ["みなす", "推定する"],
  ["推定する", "みなす"],
  ["することができる", "しなければならない"],
  ["しなければならない", "することができる"],
];

// ×問題の 1 項あたりの上限。同型の問題が並びすぎるのを防ぐ。
const maxFalsePerParagraph = 2;

export const generateTrueFalseCandidates = (
  article: LawNode,
  nodesById: ReadonlyMap<string, LawNode>,
): QuizCandidate[] => {
  const falseCandidates: QuizCandidate[] = [];
  let trueCandidate: QuizCandidate | undefined;

  for (const paragraphText of collectParagraphTexts(article, nodesById)) {
    let falseCount = 0;

    for (const sentence of splitSentences(paragraphText)) {
      // 効果語を最初に含む文を ○ 問題として 1 条につき 1 件だけ確保する。
      // ×問題ばかりだと「この形式は常に×」という形式暗記が成立してしまう。
      const containsSwapTerm = swapPairs.some(([from]) => sentence.includes(from));

      if (trueCandidate === undefined && containsSwapTerm) {
        trueCandidate = {
          type: "true_false",
          ruleId: trueFalseRuleId,
          question: `次の記述は正しいか。\n${sentence}`,
          answer: "○",
          sourceNodeId: article.id,
        };
      }

      if (falseCount >= maxFalsePerParagraph) {
        continue;
      }

      // 文中で最も早く現れる効果語 1 箇所だけを置換する。複数置換すると誤りが特定できない問題になる。
      let earliest: { position: number; from: string; to: string } | undefined;

      for (const [from, to] of swapPairs) {
        const position = sentence.indexOf(from);

        if (position !== -1 && (earliest === undefined || position < earliest.position)) {
          earliest = { position, from, to };
        }
      }

      if (earliest === undefined) {
        continue;
      }

      const modified =
        sentence.slice(0, earliest.position) +
        earliest.to +
        sentence.slice(earliest.position + earliest.from.length);

      falseCandidates.push({
        type: "true_false",
        ruleId: trueFalseRuleId,
        question: `次の記述は正しいか。\n${modified}`,
        answer: `×（正しくは「${earliest.from}」）`,
        sourceNodeId: article.id,
      });
      falseCount += 1;
    }
  }

  return trueCandidate === undefined ? falseCandidates : [...falseCandidates, trueCandidate];
};
