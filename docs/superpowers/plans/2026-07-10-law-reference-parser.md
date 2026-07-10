# 条文参照パーサー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 入力文字列を、参照先を表す構造化フィールド（法令名候補・条・項・号・別表・本文/ただし書・数値 score）へ変換する純粋関数 `parseReference` を `core/jump` に実装する。

**Architecture:** design-doc 11.1 のパイプライン（正規化 → 法令名分類 → 条項号パース → スコアリング）を単一の純粋関数に実装する。既存の `normalizeForSearch`（正規化 + sourceIndex）、`toArabicNumber`（漢数字→数値）、`createAliasResolver`（official/alias 分類）を再利用し、`lawId` への実解決は後続 #24 に分離する。

**Tech Stack:** TypeScript 6, Vitest, `@/core/search`, `@/shared/utils/readability`, `@/core/jump`（alias-resolver）。

## Global Constraints

- 仕様の正典: [docs/superpowers/specs/2026-07-10-law-reference-parser-design.md](../specs/2026-07-10-law-reference-parser-design.md)。
- パーサーは `lawId` を出力しない（解決は #24 に分離）。official/alias 分類にのみ resolver を使う。
- `article` の枝番はハイフン連結（`242-2`）。既存 `buildLawArticleUrl` の `:article` 表現と揃える。
- 相対シフトは `article`/`paragraph` の値 `"previous"`/`"next"` で符号化。「同」はシフトなし＝フィールド省略。
- score は 0..1 の決定的な値。各 fixture の `confidenceFloor`（下限）以上であること。
- コメントは日本語。既存 `core/jump` のコメント密度に合わせる。
- 検証ゲート（コミット直前に必ず実行）: `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `pnpm test`。「通るはず」での省略は禁止。

---

### Task 1: テストフィクスチャの拡張

**Files:**

- Modify: `src/test/fixtures/lawReferences.ts`（型に `sentence`/`appendix` を追加、発展表記の 10 ケースを追加）

**Interfaces:**

- Consumes: なし。
- Produces: `lawReferenceParseFixtures`（`LawReferenceParseFixture[]`）に発展表記ケースを追加。`LawReferenceParseFixture["expected"]` に `sentence?: "main" | "proviso"` と `appendix?: string` を追加。

- [ ] **Step 1: fixture 型へ `sentence`/`appendix` を追加**

`src/test/fixtures/lawReferences.ts` の `expected` 型を次のとおり変更する（`confidenceFloor` の直前に 2 行追加）。

```ts
  expected: {
    lawNameCandidate?: string;
    lawAlias?: string;
    article?: string;
    paragraph?: string;
    item?: string;
    // 本文 / ただし書 の位置指定。
    sentence?: "main" | "proviso";
    // 別表番号（別表第一 → "1"）。
    appendix?: string;
    confidenceFloor: number;
  };
```

- [ ] **Step 2: 発展表記の fixture を追加**

`lawReferenceParseFixtures` 配列の末尾要素（`same paragraph item` のオブジェクト）の後ろ、閉じ `]` の前に次の 10 ケースを追加する。

```ts
  {
    name: "same-law absolute-in-context article",
    kind: "relative",
    input: "同法1条",
    expected: {
      article: "1",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "relative previous article",
    kind: "relative",
    input: "前条",
    expected: {
      article: "previous",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "relative next article",
    kind: "relative",
    input: "次条",
    expected: {
      article: "next",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "main sentence marker",
    kind: "relative",
    input: "本文",
    expected: {
      sentence: "main",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "proviso sentence marker",
    kind: "relative",
    input: "ただし書",
    expected: {
      sentence: "proviso",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "appendix table kanji",
    kind: "relative",
    input: "別表第一",
    expected: {
      appendix: "1",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "alias arabic article roman paragraph",
    kind: "absolute",
    input: "憲21Ⅰ",
    expected: {
      lawAlias: "憲",
      article: "21",
      paragraph: "1",
      confidenceFloor: 0.8,
    },
  },
  {
    name: "kanji article paragraph item no law",
    kind: "relative",
    input: "一条二項三号",
    expected: {
      article: "1",
      paragraph: "2",
      item: "3",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "arabic article paragraph item no law",
    kind: "relative",
    input: "1条1項1号",
    expected: {
      article: "1",
      paragraph: "1",
      item: "1",
      confidenceFloor: 0.4,
    },
  },
  {
    name: "prefixed article paragraph item no law",
    kind: "relative",
    input: "第1条第1項第1号",
    expected: {
      article: "1",
      paragraph: "1",
      item: "1",
      confidenceFloor: 0.4,
    },
  },
```

- [ ] **Step 3: 既存の整合テストがグリーンのままか確認**

Run: `pnpm test src/test/fixtures/lawReferences.test.ts`
Expected: PASS（既存の coherence テストは name 一意・floor 範囲・absolute の lawName 必須のみを見る。追加ケースは相対 or lawAlias 付きで違反しない）。

- [ ] **Step 4: 検証ゲート実行**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: すべて PASS。

- [ ] **Step 5: コミット**

```bash
git add src/test/fixtures/lawReferences.ts
git commit -m "test(jump): 条文参照パーサーの発展表記 fixture を追加する"
```

---

### Task 2: 数値ユーティリティとパーサー本体

**Files:**

- Create: `src/core/jump/reference-parser.ts`
- Test: `src/core/jump/reference-parser.test.ts`

**Interfaces:**

- Consumes: `normalizeForSearch`（`@/core/search`）, `toArabicNumber`（`@/shared/utils/readability`）, `createAliasResolver` / `AliasResolver`（`./alias-resolver`）。
- Produces:
  - `parseReference(input: string, options?: ParseReferenceOptions): ParsedReference | undefined`
  - `interface ParsedReference { kind: "absolute" | "relative"; lawNameCandidate?: string; lawAlias?: string; article?: string; paragraph?: string; item?: string; sentence?: "main" | "proviso"; appendix?: string; score: number }`
  - `interface ParseReferenceOptions { resolver?: AliasResolver }`
  - `type ReferenceKind = "absolute" | "relative"`
  - `type ReferenceSentence = "main" | "proviso"`

- [ ] **Step 1: 代表ケースの失敗テストを書く**

`src/core/jump/reference-parser.test.ts` を作成する。

```ts
import { describe, expect, it } from "vitest";

import { parseReference } from "./reference-parser";

describe("parseReference", () => {
  it.each([
    {
      name: "正式名称 + 第N条",
      input: "国家賠償法第1条",
      expected: { kind: "absolute", lawNameCandidate: "国家賠償法", article: "1" },
    },
    {
      name: "略称 + 条省略",
      input: "国賠1",
      expected: { kind: "absolute", lawAlias: "国賠", article: "1" },
    },
    {
      name: "略称 + 大きい条番号",
      input: "民709",
      expected: { kind: "absolute", lawAlias: "民", article: "709" },
    },
    {
      name: "枝番（アラビア）",
      input: "地方自治法242条の2",
      expected: { kind: "absolute", lawNameCandidate: "地方自治法", article: "242-2" },
    },
    {
      name: "枝番（漢数字）",
      input: "民法第七百九条の二",
      expected: { kind: "absolute", lawNameCandidate: "民法", article: "709-2" },
    },
    {
      name: "条項",
      input: "憲法21条1項",
      expected: { kind: "absolute", lawAlias: "憲法", article: "21", paragraph: "1" },
    },
    {
      name: "漢数字の条項号",
      input: "民法第七百九条第一項第一号",
      expected: {
        kind: "absolute",
        lawNameCandidate: "民法",
        article: "709",
        paragraph: "1",
        item: "1",
      },
    },
    {
      name: "ローマ数字の項",
      input: "憲21Ⅰ",
      expected: { kind: "absolute", lawAlias: "憲", article: "21", paragraph: "1" },
    },
    {
      name: "相対 前項",
      input: "前項",
      expected: { kind: "relative", paragraph: "previous" },
    },
    {
      name: "相対 同条第一号",
      input: "同条第一号",
      expected: { kind: "relative", item: "1" },
    },
    {
      name: "本文",
      input: "本文",
      expected: { kind: "relative", sentence: "main" },
    },
    {
      name: "別表第一",
      input: "別表第一",
      expected: { kind: "relative", appendix: "1" },
    },
  ])("$name を構造化する", ({ input, expected }) => {
    const result = parseReference(input);

    expect(result).toBeDefined();
    expect(result).toMatchObject(expected);
    expect(result?.score).toBeGreaterThan(0);
  });

  it("空文字は undefined を返す", () => {
    expect(parseReference("")).toBeUndefined();
  });

  it("法令名なしの数字のみは非参照として undefined を返す", () => {
    expect(parseReference("123")).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/core/jump/reference-parser.test.ts`
Expected: FAIL（`reference-parser` モジュール未作成で import 解決に失敗）。

- [ ] **Step 3: パーサー本体を実装**

`src/core/jump/reference-parser.ts` を作成する。

```ts
import { normalizeForSearch } from "@/core/search";
import { toArabicNumber } from "@/shared/utils/readability";

import { createAliasResolver, type AliasResolver } from "./alias-resolver";

// 参照が法令名を伴う絶対参照か、文脈依存の相対参照か。
export type ReferenceKind = "absolute" | "relative";

// 本文 / ただし書 の位置指定。
export type ReferenceSentence = "main" | "proviso";

export interface ParsedReference {
  kind: ReferenceKind;
  lawNameCandidate?: string; // 正式名称っぽい原文（official 一致 or 辞書外の推定名）
  lawAlias?: string; // 略称の原文（alias 一致）
  article?: string; // "1" / "242-2" / "previous" / "next"
  paragraph?: string; // "1" / "previous" / "next"
  item?: string; // "1"
  sentence?: ReferenceSentence;
  appendix?: string; // 別表番号
  score: number; // 0..1 の決定的スコア
}

export interface ParseReferenceOptions {
  // official / alias 分類に使う resolver。既定は組込辞書のみ。
  resolver?: AliasResolver;
}

// 組込辞書だけの resolver を一度だけ構築して共有する。
const defaultResolver = createAliasResolver();

// 漢数字 1 文字群。境界検出・数値トークン抽出で共有する。
const kanjiDigits = "一二三四五六七八九十百千";

// 法令名部の直後で位置部（条・項・号や相対マーカー）が始まる位置を検出する。
// 単字マーカー（本・別・前・次・同・た・但）が法令名（例: 日本国憲法 の「本」）へ
// 誤反応しないよう、複数文字マーカーは語として並べる。
const positionStartPattern = new RegExp(
  `[0-9${kanjiDigits}]|第|前[条項]|次[条項]|同[法条項]|本文|別表|ただし書|但書`,
);

interface NumberToken {
  value: string; // アラビア表記の文字列
  kanji: boolean; // 漢数字由来か（スコア減点の判定に使う）
  len: number; // 消費した元トークンの長さ
}

const numberTokenPattern = new RegExp(`^(\\d+|[${kanjiDigits}]+)`);

// 先頭の数値トークン（アラビアまたは漢数字）を 1 つ読む。
const readNumber = (text: string): NumberToken | undefined => {
  const match = numberTokenPattern.exec(text);

  if (match === null) {
    return undefined;
  }

  const token = match[1];

  if (/^\d+$/.test(token)) {
    // アラビア数字はゼロ埋めを畳んで正準化する（"01" → "1"）。
    return { value: String(Number.parseInt(token, 10)), kanji: false, len: token.length };
  }

  const arabic = toArabicNumber(token);

  return arabic === undefined
    ? undefined
    : { value: String(arabic), kanji: true, len: token.length };
};

const romanValues = new Map([
  ["i", 1],
  ["v", 5],
  ["x", 10],
  ["l", 50],
  ["c", 100],
]);

// 小文字ローマ数字（NFKC + 小文字化で "Ⅰ" → "i" 等）をアラビア数値へ。
// 項番号用途のため通常の減算則で十分。妥当でなければ undefined。
const romanToArabic = (text: string): number | undefined => {
  if (text === "" || !/^[ivxlc]+$/.test(text)) {
    return undefined;
  }

  let total = 0;
  let previous = 0;

  for (let index = text.length - 1; index >= 0; index -= 1) {
    const current = romanValues.get(text[index]) ?? 0;

    if (current < previous) {
      total -= current; // 減算則（iv = 4 等）
    } else {
      total += current;
      previous = current;
    }
  }

  return total;
};

interface ParsePart {
  value: string;
  kanji: boolean;
  rest: string;
}

const stripDai = (text: string): string => (text.startsWith("第") ? text.slice(1) : text);

// 第?<num>条 (の<num>)* を条番号として読む。枝番はハイフン連結。
const readArticle = (text: string): ParsePart | undefined => {
  const body = stripDai(text);
  const head = readNumber(body);

  if (head === undefined) {
    return undefined;
  }

  let rest = body.slice(head.len);

  if (!rest.startsWith("条")) {
    return undefined; // 条を伴わない数値は条省略形として別処理する
  }

  rest = rest.slice(1);
  let value = head.value;
  let kanji = head.kanji;

  while (rest.startsWith("の")) {
    const branch = readNumber(rest.slice(1));

    if (branch === undefined) {
      break;
    }

    value += `-${branch.value}`;
    kanji ||= branch.kanji;
    rest = rest.slice(1 + branch.len);
  }

  return { value, kanji, rest };
};

// 条を伴わない先頭数値を条番号とみなす（法令名がある場合のみ呼ばれる）。
// 直後が 項/号 のときは項・号として扱うべきなので条にしない。
const readBareArticle = (text: string): ParsePart | undefined => {
  const body = stripDai(text);
  const head = readNumber(body);

  if (head === undefined) {
    return undefined;
  }

  const rest = body.slice(head.len);

  if (rest.startsWith("項") || rest.startsWith("号")) {
    return undefined;
  }

  return { value: head.value, kanji: head.kanji, rest };
};

// 第?<num>（項|号）を読む共通処理。
const readSuffixNumber = (text: string, suffix: string): ParsePart | undefined => {
  const body = stripDai(text);
  const head = readNumber(body);

  if (head === undefined) {
    return undefined;
  }

  const rest = body.slice(head.len);

  if (!rest.startsWith(suffix)) {
    return undefined;
  }

  return { value: head.value, kanji: head.kanji, rest: rest.slice(suffix.length) };
};

// 別表第?<num> を読む。
const readAppendix = (text: string): ParsePart | undefined => {
  if (!text.startsWith("別表")) {
    return undefined;
  }

  const afterLabel = stripDai(text.slice(2));
  const head = readNumber(afterLabel);

  if (head === undefined) {
    return undefined;
  }

  return { value: head.value, kanji: head.kanji, rest: afterLabel.slice(head.len) };
};

interface ScoreInput {
  kind: ReferenceKind;
  lawMatchKind: "official" | "alias" | "unknown" | "none";
  article?: string;
  paragraph?: string;
  item?: string;
  sentence?: ReferenceSentence;
  appendix?: string;
  usedKanji: boolean;
}

// 相対シフト（previous/next）でない具体的な番号か。
const isConcrete = (value: string | undefined): boolean =>
  value !== undefined && value !== "previous" && value !== "next";

const clampScore = (score: number): number => Math.min(1, Math.max(0, score));

// design-doc 11.3 の信号のうち、パーサー単体で判定できるものを決定的に加減点する。
// 外部信号（編集距離・OCR confidence・履歴）は後続 #24/#37 が上位で加える。
const scoreReference = (input: ScoreInput): number => {
  let score: number;

  if (input.kind === "absolute") {
    score = input.lawMatchKind === "official" ? 0.55 : input.lawMatchKind === "alias" ? 0.45 : 0.35;

    if (isConcrete(input.article)) {
      score += 0.35;
    }
  } else {
    score = 0.4;

    if (isConcrete(input.article)) {
      score += 0.1;
    }
  }

  if (isConcrete(input.paragraph)) {
    score += 0.05;
  }

  if (input.item !== undefined) {
    score += 0.05;
  }

  if (input.sentence !== undefined) {
    score += 0.02;
  }

  if (input.appendix !== undefined) {
    score += 0.05;
  }

  if (input.usedKanji) {
    // 漢数字は OCR・手入力で誤変換しやすいぶん、わずかに下げる。
    score -= 0.05;
  }

  return clampScore(score);
};

export const parseReference = (
  input: string,
  options: ParseReferenceOptions = {},
): ParsedReference | undefined => {
  const resolver = options.resolver ?? defaultResolver;
  const { normalized } = normalizeForSearch(input);

  if (normalized === "") {
    return undefined;
  }

  // 法令名部と位置部の境界を探す。
  const boundaryMatch = positionStartPattern.exec(normalized);
  const boundary = boundaryMatch === null ? normalized.length : boundaryMatch.index;
  const lawToken = normalized.slice(0, boundary);
  let position = normalized.slice(boundary);

  // --- 法令名の分類（lawId は載せない） ---
  let lawNameCandidate: string | undefined;
  let lawAlias: string | undefined;
  let lawMatchKind: ScoreInput["lawMatchKind"] = "none";

  if (lawToken !== "") {
    const candidates = resolver.resolve(lawToken);
    const official = candidates.find((candidate) => candidate.matchKind === "official");
    const alias = candidates.find((candidate) => candidate.matchKind === "alias");

    if (official !== undefined) {
      lawNameCandidate = official.matchedText;
      lawMatchKind = "official";
    } else if (alias !== undefined) {
      lawAlias = alias.matchedText;
      lawMatchKind = "alias";
    } else {
      // 辞書外。原文トークンをそのまま候補にする（best-effort、低スコア）。
      lawNameCandidate = lawToken;
      lawMatchKind = "unknown";
    }
  }

  const hasLaw = lawNameCandidate !== undefined || lawAlias !== undefined;

  // --- 位置部の解析 ---
  let article: string | undefined;
  let paragraph: string | undefined;
  let item: string | undefined;
  let sentence: ReferenceSentence | undefined;
  let appendix: string | undefined;
  let usedKanji = false;

  // 相対の条マーカー。同法・同条 は「現在位置」= シフトなしで消費する。
  if (position.startsWith("前条")) {
    article = "previous";
    position = position.slice(2);
  } else if (position.startsWith("次条")) {
    article = "next";
    position = position.slice(2);
  } else if (position.startsWith("同条") || position.startsWith("同法")) {
    position = position.slice(2);
  }

  // 相対の項マーカー。同項 は消費のみ。
  if (position.startsWith("前項")) {
    paragraph = "previous";
    position = position.slice(2);
  } else if (position.startsWith("次項")) {
    paragraph = "next";
    position = position.slice(2);
  } else if (position.startsWith("同項")) {
    position = position.slice(2);
  }

  const appendixPart = readAppendix(position);

  if (appendixPart !== undefined) {
    appendix = appendixPart.value;
    usedKanji ||= appendixPart.kanji;
    position = appendixPart.rest;
  }

  const articlePart = readArticle(position);

  if (articlePart !== undefined) {
    article = articlePart.value;
    usedKanji ||= articlePart.kanji;
    position = articlePart.rest;
  } else if (article === undefined && hasLaw) {
    // 条省略形（民709 / 国賠1 / 憲21Ⅰ の 21）。
    const barePart = readBareArticle(position);

    if (barePart !== undefined) {
      article = barePart.value;
      usedKanji ||= barePart.kanji;
      position = barePart.rest;
    }
  }

  const paragraphPart = readSuffixNumber(position, "項");

  if (paragraph === undefined && paragraphPart !== undefined) {
    paragraph = paragraphPart.value;
    usedKanji ||= paragraphPart.kanji;
    position = paragraphPart.rest;
  } else if (paragraph === undefined && article !== undefined) {
    // 憲21Ⅰ: 条番号直後のローマ数字を項とみなす。
    const roman = romanToArabic(position);

    if (roman !== undefined) {
      paragraph = String(roman);
      position = "";
    }
  }

  const itemPart = readSuffixNumber(position, "号");

  if (itemPart !== undefined) {
    item = itemPart.value;
    usedKanji ||= itemPart.kanji;
    position = itemPart.rest;
  }

  // 本文 / ただし書（単独または末尾）。
  if (position.startsWith("本文")) {
    sentence = "main";
    position = position.slice(2);
  } else if (position.startsWith("ただし書")) {
    sentence = "proviso";
    position = position.slice(4);
  } else if (position.startsWith("但書")) {
    sentence = "proviso";
    position = position.slice(2);
  }

  const hasPosition =
    article !== undefined ||
    paragraph !== undefined ||
    item !== undefined ||
    sentence !== undefined ||
    appendix !== undefined;

  // 法令も位置指定も無い（同法だけ等）、または辞書外の法令名で位置指定も無い入力は、
  // 参照として弱すぎるため不成立にする（エラーにはしない）。
  if (!hasPosition && (!hasLaw || lawMatchKind === "unknown")) {
    return undefined;
  }

  const kind: ReferenceKind = hasLaw ? "absolute" : "relative";
  const score = scoreReference({
    kind,
    lawMatchKind,
    article,
    paragraph,
    item,
    sentence,
    appendix,
    usedKanji,
  });

  return {
    kind,
    ...(lawNameCandidate === undefined ? {} : { lawNameCandidate }),
    ...(lawAlias === undefined ? {} : { lawAlias }),
    ...(article === undefined ? {} : { article }),
    ...(paragraph === undefined ? {} : { paragraph }),
    ...(item === undefined ? {} : { item }),
    ...(sentence === undefined ? {} : { sentence }),
    ...(appendix === undefined ? {} : { appendix }),
    score,
  };
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test src/core/jump/reference-parser.test.ts`
Expected: PASS（全 12 表 + 2 境界ケース）。

- [ ] **Step 5: 検証ゲート実行**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: すべて PASS。lint 指摘が出たら suppress せず、命名・構造を既存に合わせて解消する。

- [ ] **Step 6: コミット**

```bash
git add src/core/jump/reference-parser.ts src/core/jump/reference-parser.test.ts
git commit -m "feat(jump): 条文参照パーサーを実装する"
```

---

### Task 3: fixture 駆動の受け入れテストと公開 API

**Files:**

- Modify: `src/core/jump/reference-parser.test.ts`（fixture 駆動テストと境界ケースを追加）
- Modify: `src/core/jump/index.ts`（`parseReference` と型を export）

**Interfaces:**

- Consumes: `parseReference`（Task 2）, `lawReferenceParseFixtures`（Task 1）。
- Produces: `@/core/jump` バレルから `parseReference` / `ParsedReference` / `ParseReferenceOptions` / `ReferenceKind` / `ReferenceSentence` を公開。

- [ ] **Step 1: fixture 駆動の受け入れテストを追加**

`src/core/jump/reference-parser.test.ts` の先頭 import に fixture を足す。

```ts
import { lawReferenceParseFixtures } from "@/test/fixtures/lawReferences";
```

`describe("parseReference", ...)` の閉じ括弧の直前（最後の `it` の後）に次を追加する。

```ts
it.each(lawReferenceParseFixtures)(
  "fixture『$name』を期待フィールドと floor 以上の score で解決する",
  (fixture) => {
    const result = parseReference(fixture.input);

    expect(result).toBeDefined();
    expect(result?.kind).toBe(fixture.kind);
    expect(result?.lawNameCandidate).toBe(fixture.expected.lawNameCandidate);
    expect(result?.lawAlias).toBe(fixture.expected.lawAlias);
    expect(result?.article).toBe(fixture.expected.article);
    expect(result?.paragraph).toBe(fixture.expected.paragraph);
    expect(result?.item).toBe(fixture.expected.item);
    expect(result?.sentence).toBe(fixture.expected.sentence);
    expect(result?.appendix).toBe(fixture.expected.appendix);
    expect(result?.score).toBeGreaterThanOrEqual(fixture.expected.confidenceFloor);
  },
);

it("法令名のみは article なしの absolute 候補を返す", () => {
  expect(parseReference("国家賠償法")).toMatchObject({
    kind: "absolute",
    lawNameCandidate: "国家賠償法",
  });
  expect(parseReference("国家賠償法")?.article).toBeUndefined();
});

it("全角数字と空白のゆれを吸収する", () => {
  const fullWidth = parseReference("国家賠償法第１条");
  const spaced = parseReference("国家賠償法 1条");

  expect(fullWidth).toMatchObject({ lawNameCandidate: "国家賠償法", article: "1" });
  expect(spaced).toMatchObject({ lawNameCandidate: "国家賠償法", article: "1" });
});

it("辞書外の法令名は推定名として低いスコアで返す", () => {
  const result = parseReference("特定商取引法5条");

  expect(result).toMatchObject({
    kind: "absolute",
    lawNameCandidate: "特定商取引法",
    article: "5",
  });
  expect(result?.score).toBeLessThan(0.8);
});

it("同一入力に対し決定的に同じ結果を返す", () => {
  expect(parseReference("憲法21条1項")).toEqual(parseReference("憲法21条1項"));
});
```

- [ ] **Step 2: テストが通ることを確認**

Run: `pnpm test src/core/jump/reference-parser.test.ts`
Expected: PASS（fixture 全 22 件 + 追加境界ケース）。失敗したら fixture の期待値と Task 2 の実装のどちらが正か spec 6 章の検算表で照合して直す。

- [ ] **Step 3: バレルへ公開 API を追加**

`src/core/jump/index.ts` の末尾に追加する。

```ts
export { parseReference } from "./reference-parser";
export type {
  ParsedReference,
  ParseReferenceOptions,
  ReferenceKind,
  ReferenceSentence,
} from "./reference-parser";
```

- [ ] **Step 4: 公開 API 経由で解決できることを確認**

`src/core/jump/reference-parser.test.ts` の import を `./reference-parser` からバレルへ切り替えても解決できることを確認するため、次の 1 ケースを `describe` 内へ追加する。

```ts
it("バレル @/core/jump からも parseReference を使える", async () => {
  const barrel = await import("./index");

  expect(barrel.parseReference("民709")).toMatchObject({ lawAlias: "民", article: "709" });
});
```

Run: `pnpm test src/core/jump/reference-parser.test.ts`
Expected: PASS。

- [ ] **Step 5: 全体検証ゲート実行**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test`
Expected: すべて PASS。

- [ ] **Step 6: コミット**

```bash
git add src/core/jump/reference-parser.test.ts src/core/jump/index.ts
git commit -m "feat(jump): 条文参照パーサーを公開 API へ配線し fixture で受け入れ検証する"
```

---

## 完了条件（Issue #31）との対応

- 入力正規化 → Task 2（`normalizeForSearch` 再利用、全角/空白/漢数字/ローマ数字）。
- 名称と番号の抽出 → Task 2（境界検出 + official 分類 + `readArticle`）。
- 略称と番号の抽出 → Task 2（alias 分類 + 条省略形 `readBareArticle`）。
- 枝番・項・号 → Task 2（`readArticle` 枝番、`readSuffixNumber`）。
- 漢数字表記 → Task 2（`readNumber` + `toArabicNumber`）。
- score を返す → Task 2（`scoreReference`）+ Task 3（fixture floor 検証）。
- 単体テスト → Task 2/Task 3。
