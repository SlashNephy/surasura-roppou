import type { DetectedLawReference, LawReferenceDetectionSource } from "@/core/domain";
import { normalizeForSearch } from "@/core/search";

import { initialAliasDictionary } from "./alias-dictionary";
import { createAliasResolver, type AliasResolver } from "./alias-resolver";
import { resolveReferenceCandidates } from "./candidate-resolver";
import { parseReference } from "./reference-parser";

export interface DetectLawReferencesOptions {
  // 分類・解決に使う resolver。既定は組込辞書のみ。
  resolver?: AliasResolver;
  // 検出元。既定は OCR。将来のクリップボード・手入力の受け口。
  source?: LawReferenceDetectionSource;
  // ページ全体の OCR confidence（0..100）。confidence 減衰に使う。
  ocrConfidence?: number;
}

const defaultResolver = createAliasResolver();
const defaultSource: LawReferenceDetectionSource = { type: "ocr" };

// 位置表現に使う数字（アラビア・全角・漢数字）。パーサーの数値解釈に合わせる。
const kanjiDigits = "一二三四五六七八九十百千";
const numberClass = `[0-9０-９${kanjiDigits}]+`;

// 行内で条文の位置表現を位置特定するパターン。先頭に必須トークン
// （条/項/号/別表/相対マーカー）を要求して空マッチを防ぎ、続く項・号・本文/ただし書は
// 任意で連結して 1 参照のスパンにする。抽出後の実際の解析は parseReference に委譲する。
const positionPattern =
  `(?:別表第?${numberClass}|第?${numberClass}条(?:の${numberClass})*|前条|次条|第?${numberClass}項|前項|次項|第?${numberClass}号)` +
  `(?:第?${numberClass}項|前項|次項)?` +
  `(?:第?${numberClass}号)?` +
  `(?:本文|ただし書|但書)?`;

// 法令名部を後方から拾う窓幅。辞書の正規化キーの最大長を使う。
const maxLawNameLength = Math.max(
  ...initialAliasDictionary.flatMap((entry) =>
    [entry.officialTitle, ...entry.aliases].map(
      (surface) => normalizeForSearch(surface).normalized.length,
    ),
  ),
);

// anchorStart 直前から、辞書に一致する最長サフィックスの開始位置を返す。
// start を小さい方から試すことで最長一致が最初にヒットする。一致が無ければ
// anchorStart（法令名なし = 相対参照候補）を返す。
const findLawNameStart = (line: string, anchorStart: number, resolver: AliasResolver): number => {
  const from = Math.max(0, anchorStart - maxLawNameLength);

  for (let start = from; start < anchorStart; start += 1) {
    if (resolver.resolve(line.slice(start, anchorStart)).length > 0) {
      return start;
    }
  }

  return anchorStart;
};

// 重複判定キー。候補ありは lawId 列 + 条項号、候補なしは正規化テキストで畳む。
const detectionKey = (
  candidates: DetectedLawReference["candidates"],
  normalizedText: string,
): string => {
  if (candidates.length === 0) {
    return `u:${normalizedText}`;
  }

  const first = candidates[0];
  const lawIds = candidates.map((candidate) => candidate.lawId).join(",");

  return `r:${lawIds}:${first.article ?? ""}:${first.paragraph ?? ""}:${first.item ?? ""}`;
};

export const detectLawReferences = (
  text: string,
  options: DetectLawReferencesOptions = {},
): DetectedLawReference[] => {
  const resolver = options.resolver ?? defaultResolver;
  const source = options.source ?? defaultSource;
  const confidenceScale =
    options.ocrConfidence === undefined ? 1 : Math.min(1, Math.max(0, options.ocrConfidence / 100));

  const detected: DetectedLawReference[] = [];
  const seen = new Set<string>();

  // グローバル正規表現を関数呼び出しごとに 1 度だけ生成し、行ごとに lastIndex をリセットして使い回す。
  // 行をまたいで lastIndex を持ち回さないことで、各行を独立したマッチ対象として扱う。
  const pattern = new RegExp(positionPattern, "g");

  text.split("\n").forEach((line, lineIndex) => {
    // 行の先頭からマッチを開始するため lastIndex をリセットする。
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line)) !== null) {
      // 空マッチ保険。理論上起きないが、起きれば無限ループになるため前進させる。
      if (match[0] === "") {
        pattern.lastIndex += 1;
        continue;
      }

      const anchorStart = match.index;
      const nameStart = findLawNameStart(line, anchorStart, resolver);
      const rawText = line.slice(nameStart, anchorStart + match[0].length);

      const parsed = parseReference(rawText, { resolver });

      if (parsed === undefined) {
        continue;
      }

      const resolution = resolveReferenceCandidates(parsed, { resolver });
      // Readonly 候補を可変コピーへ畳んでドメイン型に載せる。
      const candidates =
        resolution.status === "resolved"
          ? resolution.candidates.map((candidate) => ({ ...candidate }))
          : [];
      const normalizedText = normalizeForSearch(rawText).normalized;
      const key = detectionKey(candidates, normalizedText);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      detected.push({
        // 行番号・行内位置・正規化テキストから決まる決定的 ID。
        id: `ocr-${String(lineIndex)}-${String(anchorStart)}-${normalizedText}`,
        rawText,
        normalizedText,
        ...(parsed.lawNameCandidate === undefined
          ? {}
          : { lawNameCandidate: parsed.lawNameCandidate }),
        ...(parsed.lawAlias === undefined ? {} : { lawAlias: parsed.lawAlias }),
        ...(parsed.article === undefined ? {} : { article: parsed.article }),
        ...(parsed.paragraph === undefined ? {} : { paragraph: parsed.paragraph }),
        ...(parsed.item === undefined ? {} : { item: parsed.item }),
        confidence: parsed.score * confidenceScale,
        source,
        candidates,
      });
    }
  });

  return detected;
};
