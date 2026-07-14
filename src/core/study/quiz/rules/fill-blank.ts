import type { LawNode } from "@/core/domain";

import { collectParagraphTexts, effectTerms, splitSentences } from "../text";
import type { QuizCandidate } from "../types";

export const fillBlankRuleId = "fill-blank@1";

// 1 項あたりの候補数上限。長い条文でもプレビューが溢れない量に抑える。
const maxCandidatesPerParagraph = 4;

// 法令文で使われる数の表記。原文は漢数字が主だが、新しい法令の算用数字（半角・全角）にも対応する。
const numberChars = "[0-9０-９〇一二三四五六七八九十百千万億]";

// 数字・期間のパターン。「十分の一」のような分数を単位付き数値より先に試す。
// 「以上」「以下」等の境界修飾は法学上意味を持つ（例: 五年以下）ため語句に含めて出題する。
// g フラグ付きのモジュールシングルトンだが、lastIndex に依存しない String#match 経由でのみ
// 使うこと（exec/test を使うと走査位置が呼び出し間で持ち越される）。
const numberPhrasePattern = new RegExp(
  `(?:${numberChars}+分の${numberChars}+|${numberChars}+(?:箇月|週間|時間|年|月|日|歳|円|倍|人|回|条))(?:以上|以下|以内|未満)?`,
  "g",
);

// 効果語の辞書は長さ降順（text.ts）のため、交替はそのまま最長一致になる。
const effectTermPattern = new RegExp(effectTerms.join("|"), "g");

export const generateFillBlankCandidates = (
  article: LawNode,
  nodesById: ReadonlyMap<string, LawNode>,
): QuizCandidate[] => {
  const candidates: QuizCandidate[] = [];
  const seenKeys = new Set<string>();

  for (const paragraphText of collectParagraphTexts(article, nodesById)) {
    const sentences = splitSentences(paragraphText);
    // 数字・期間の語句を効果語より先に集め、上限に達したら効果語を切り捨てる。
    const extracted = [
      ...sentences.flatMap((sentence) =>
        [...new Set(sentence.match(numberPhrasePattern) ?? [])].map((phrase) => ({
          sentence,
          phrase,
        })),
      ),
      ...sentences.flatMap((sentence) =>
        [...new Set(sentence.match(effectTermPattern) ?? [])].map((phrase) => ({
          sentence,
          phrase,
        })),
      ),
    ];

    let count = 0;

    for (const { sentence, phrase } of extracted) {
      if (count >= maxCandidatesPerParagraph) {
        break;
      }

      // 同一語句が同じ文に複数回現れる場合はすべて伏せる。1 箇所でも残ると答えが問題文に露出する。
      const question = sentence.replaceAll(phrase, "（　　）");
      // \x00 は法令文に現れないため、question と phrase の連結に区切りとして使う。
      const key = `${question}\x00${phrase}`;

      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      candidates.push({
        type: "fill_blank",
        ruleId: fillBlankRuleId,
        question,
        answer: phrase,
        sourceNodeId: article.id,
      });
      count += 1;
    }
  }

  return candidates;
};
