# 参照候補の解決 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ParsedReference`（#31）を受け取り、法令名/略称を `lawId` 候補へ解決してスコア付き候補列を返す純粋関数 `resolveReferenceCandidates` を `core/jump` に実装する。

**Architecture:** `createAliasResolver`（#22）で法令名テキストを `lawId` 候補へ解決し、`parsed.score` をそのまま候補スコアに採り、`reason[]` を添えて `LawReferenceCandidate[]`（`core/domain` の既存型）を返す。相対参照・辞書外は判別ユニオン `ReferenceResolution` の `unresolved` で表す。ネットワーク・ストレージ非依存の純粋関数。

**Tech Stack:** TypeScript 6, Vitest, `@/core/domain`, `@/core/jump`（alias-resolver / reference-parser）。

## Global Constraints

- 仕様の正典: [docs/superpowers/specs/2026-07-10-reference-candidate-resolution-design.md](../specs/2026-07-10-reference-candidate-resolution-design.md)。
- `LawNode` の実取得・条存在検証はしない（遅延検証。ビューアー遷移時に既存経路が担う）。ネットワーク・ストレージに依存しない。
- 候補スコアは `parsed.score` をそのまま採る（独自スコアを足さない）。ランキングは score 降順、同点は `resolve()` の返却順（辞書登録順）を安定ソートで保つ。
- 相対参照（`kind === "relative"`）は `unresolved: needs-context`。絶対参照だが辞書外は `unresolved: law-not-found`。
- 出力候補には具体的な条・項・号のみ載せる（`"previous"`/`"next"` は absolute では出ない）。値があるときのみフィールドを載せる。
- 出力型は既存 `LawReferenceCandidate`（`@/core/domain`）を再利用する。新しい候補型を作らない。
- コメントは日本語。既存 `core/jump` のコメント密度に合わせる。
- 検証ゲート（コミット直前に必ず実行）: `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `pnpm test`。「通るはず」での省略は禁止。

---

### Task 1: 候補解決の本体

**Files:**

- Create: `src/core/jump/candidate-resolver.ts`
- Test: `src/core/jump/candidate-resolver.test.ts`

**Interfaces:**

- Consumes: `LawReferenceCandidate`（`@/core/domain`）, `createAliasResolver` / `AliasCandidate` / `AliasResolver`（`./alias-resolver`）, `parseReference` / `ParsedReference`（`./reference-parser`）。
- Produces:
  - `resolveReferenceCandidates(parsed: ParsedReference, options?: ResolveReferenceOptions): ReferenceResolution`
  - `resolveReferenceInput(input: string, options?: ResolveReferenceOptions): ReferenceResolution | undefined`
  - `type ReferenceResolution = { status: "resolved"; candidates: LawReferenceCandidate[] } | { status: "unresolved"; reason: UnresolvedReason; parsed: ParsedReference }`
  - `type UnresolvedReason = "needs-context" | "law-not-found"`
  - `interface ResolveReferenceOptions { resolver?: AliasResolver }`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/jump/candidate-resolver.test.ts` を作成する。

```ts
import { describe, expect, it } from "vitest";

import { createAliasResolver } from "./alias-resolver";
import { resolveReferenceCandidates, resolveReferenceInput } from "./candidate-resolver";
import { parseReference } from "./reference-parser";

// テストは parseReference を通した実 ParsedReference を解決に渡す（公開経路の振る舞いを見る）。
const resolveText = (input: string) => {
  const parsed = parseReference(input);

  if (parsed === undefined) {
    throw new Error(`parse failed: ${input}`);
  }

  return resolveReferenceCandidates(parsed);
};

describe("resolveReferenceCandidates", () => {
  it("正式名称 + 条を単一候補に解決する", () => {
    const result = resolveText("国家賠償法第1条");

    expect(result.status).toBe("resolved");

    if (result.status !== "resolved") {
      return;
    }

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      lawId: "322AC0000000125",
      lawTitle: "国家賠償法",
      article: "1",
    });
    expect(result.candidates[0].reason).toContain("正式名称『国家賠償法』に一致");
  });

  it("略称 + 条省略を解決し score を parse から引き継ぐ", () => {
    const parsed = parseReference("民709");

    if (parsed === undefined) {
      throw new Error("parse failed");
    }

    const result = resolveReferenceCandidates(parsed);

    expect(result.status).toBe("resolved");

    if (result.status !== "resolved") {
      return;
    }

    expect(result.candidates[0]).toMatchObject({
      lawId: "129AC0000000089",
      lawTitle: "民法",
      article: "709",
      score: parsed.score,
    });
    expect(result.candidates[0].reason).toContain("略称『民』に一致");
  });

  it("条・項・号を候補へ引き継ぐ", () => {
    const result = resolveText("民法709条1項1号");

    expect(result.status).toBe("resolved");

    if (result.status !== "resolved") {
      return;
    }

    expect(result.candidates[0]).toMatchObject({ article: "709", paragraph: "1", item: "1" });
  });

  it("法令名のみ（条なし）は article を載せない", () => {
    const result = resolveText("国家賠償法");

    expect(result.status).toBe("resolved");

    if (result.status !== "resolved") {
      return;
    }

    expect(result.candidates[0].lawId).toBe("322AC0000000125");
    expect(result.candidates[0].article).toBeUndefined();
  });

  it("辞書外の法令名は law-not-found", () => {
    const result = resolveText("特定商取引法5条");

    expect(result).toEqual(
      expect.objectContaining({ status: "unresolved", reason: "law-not-found" }),
    );
  });

  it.each(["前項", "同条第一号", "本文"])("相対参照 %s は needs-context", (input) => {
    const result = resolveText(input);

    expect(result).toEqual(
      expect.objectContaining({ status: "unresolved", reason: "needs-context" }),
    );
  });

  it("曖昧な略称は複数候補を登録順で返す", () => {
    // 同一略称 "民" を 2 法令へ張ったユーザー辞書を注入する。
    const resolver = createAliasResolver({
      userEntries: [{ lawId: "LAW_X", officialTitle: "架空民事法", aliases: ["民"] }],
    });
    const parsed = parseReference("民709", { resolver });

    if (parsed === undefined) {
      throw new Error("parse failed");
    }

    const result = resolveReferenceCandidates(parsed, { resolver });

    expect(result.status).toBe("resolved");

    if (result.status !== "resolved") {
      return;
    }

    expect(result.candidates.map((candidate) => candidate.lawId)).toEqual([
      "129AC0000000089",
      "LAW_X",
    ]);
  });

  it("同一入力で決定的に同じ結果を返す", () => {
    expect(resolveText("憲法21条1項")).toEqual(resolveText("憲法21条1項"));
  });
});

describe("resolveReferenceInput", () => {
  it("文字列から parse して候補を返す", () => {
    const result = resolveReferenceInput("民709");

    expect(result?.status).toBe("resolved");
  });

  it("パース不能な入力は undefined", () => {
    expect(resolveReferenceInput("")).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test src/core/jump/candidate-resolver.test.ts`
Expected: FAIL（`candidate-resolver` モジュール未作成で import 解決に失敗）。

- [ ] **Step 3: 本体を実装**

`src/core/jump/candidate-resolver.ts` を作成する。

```ts
import type { LawReferenceCandidate } from "@/core/domain";

import { createAliasResolver, type AliasCandidate, type AliasResolver } from "./alias-resolver";
import { parseReference, type ParsedReference } from "./reference-parser";

// 解決結果。候補が得られたか、文脈不足・辞書外で未解決かを判別する。
export type ReferenceResolution =
  | { status: "resolved"; candidates: LawReferenceCandidate[] }
  | { status: "unresolved"; reason: UnresolvedReason; parsed: ParsedReference };

export type UnresolvedReason =
  | "needs-context" // 相対参照。周辺文脈がないと lawId を決められない
  | "law-not-found"; // 絶対参照だが法令名が辞書に無い

export interface ResolveReferenceOptions {
  // 分類・解決に使う resolver。既定は組込辞書のみ。
  resolver?: AliasResolver;
}

// 組込辞書だけの resolver を一度だけ構築して共有する。
const defaultResolver = createAliasResolver();

// 一致種別と条番号から確認 UI 向けの根拠文字列を組み立てる。
const buildReason = (candidate: AliasCandidate, parsed: ParsedReference): string[] => {
  const reason =
    candidate.matchKind === "official"
      ? [`正式名称『${candidate.matchedText}』に一致`]
      : [`略称『${candidate.matchedText}』に一致`];

  if (parsed.article !== undefined) {
    reason.push(`第${parsed.article}条`);
  }

  return reason;
};

// AliasCandidate 1 件を LawReferenceCandidate へ。条・項・号は値があるときのみ載せる。
const toCandidate = (
  candidate: AliasCandidate,
  parsed: ParsedReference,
): LawReferenceCandidate => ({
  lawId: candidate.lawId,
  lawTitle: candidate.officialTitle,
  score: parsed.score,
  reason: buildReason(candidate, parsed),
  ...(parsed.article === undefined ? {} : { article: parsed.article }),
  ...(parsed.paragraph === undefined ? {} : { paragraph: parsed.paragraph }),
  ...(parsed.item === undefined ? {} : { item: parsed.item }),
});

export const resolveReferenceCandidates = (
  parsed: ParsedReference,
  options: ResolveReferenceOptions = {},
): ReferenceResolution => {
  // 相対参照（法令名を持たない）は文脈がないと解決できない。
  if (parsed.kind === "relative") {
    return { status: "unresolved", reason: "needs-context", parsed };
  }

  // absolute なら lawAlias / lawNameCandidate のどちらかが必ずある（parser の契約）。
  const lawText = parsed.lawAlias ?? parsed.lawNameCandidate;

  if (lawText === undefined) {
    return { status: "unresolved", reason: "needs-context", parsed };
  }

  const resolver = options.resolver ?? defaultResolver;
  const aliasCandidates = resolver.resolve(lawText);

  if (aliasCandidates.length === 0) {
    return { status: "unresolved", reason: "law-not-found", parsed };
  }

  // 候補スコアは parse score をそのまま採るため全候補同点。安定ソートで resolve の順を保つ。
  const candidates = aliasCandidates
    .map((candidate) => toCandidate(candidate, parsed))
    .sort((a, b) => b.score - a.score);

  return { status: "resolved", candidates };
};

// 文字列 → parse → 候補解決の便利ラッパー。パース不能なら undefined。
export const resolveReferenceInput = (
  input: string,
  options: ResolveReferenceOptions = {},
): ReferenceResolution | undefined => {
  const parsed = parseReference(input, options);

  return parsed === undefined ? undefined : resolveReferenceCandidates(parsed, options);
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test src/core/jump/candidate-resolver.test.ts`
Expected: PASS（全ケース）。

- [ ] **Step 5: 検証ゲート実行**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: すべて PASS。lint 指摘は suppress せず既存パターンに合わせて解消。解消できなければ BLOCKED で報告。

- [ ] **Step 6: コミット**

```bash
git add src/core/jump/candidate-resolver.ts src/core/jump/candidate-resolver.test.ts
git commit -m "feat(jump): 参照候補の解決を実装する"
```

---

### Task 2: 公開 API への配線

**Files:**

- Modify: `src/core/jump/index.ts`
- Test: `src/core/jump/candidate-resolver.test.ts`（バレル経由テストを追加）

**Interfaces:**

- Consumes: `resolveReferenceCandidates` / `resolveReferenceInput` / `ReferenceResolution` / `UnresolvedReason` / `ResolveReferenceOptions`（Task 1）。
- Produces: `@/core/jump` バレルから上記関数と型を公開。

- [ ] **Step 1: バレルへ export を追加**

`src/core/jump/index.ts` の末尾に追加する。

```ts
export { resolveReferenceCandidates, resolveReferenceInput } from "./candidate-resolver";
export type {
  ReferenceResolution,
  ResolveReferenceOptions,
  UnresolvedReason,
} from "./candidate-resolver";
```

- [ ] **Step 2: バレル経由の失敗テストを追加**

`src/core/jump/candidate-resolver.test.ts` の `describe("resolveReferenceInput", ...)` の閉じ括弧の後（ファイル末尾の最後の `});` の直前ではなく、その `describe` ブロック内の最後の `it` の後）に次を追加する。

```ts
it("バレル @/core/jump からも解決関数を使える", async () => {
  const barrel = await import("./index");

  const result = barrel.resolveReferenceInput("国賠1");

  expect(result?.status).toBe("resolved");
});
```

- [ ] **Step 3: テストが通ることを確認**

Run: `pnpm test src/core/jump/candidate-resolver.test.ts`
Expected: PASS。

- [ ] **Step 4: 全体検証ゲート実行**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test`
Expected: すべて PASS。

- [ ] **Step 5: コミット**

```bash
git add src/core/jump/index.ts src/core/jump/candidate-resolver.test.ts
git commit -m "feat(jump): 参照候補の解決を公開 API へ配線する"
```

---

## 完了条件（Issue #24）との対応

- alias から lawId を解決する → Task 1（`resolver.resolve()` + `toCandidate`）。
- 条番号から `LawNode` を解決する → 遅延検証（spec §1/§8）。条・項・号は候補へ引き継ぎ、実 `LawNode` 取得はビューアー遷移時に委ねる。
- ranking を実装する → Task 1（score 降順・安定ソート・`reason[]`）。
- 候補をスコア付きで返せる → Task 1（`LawReferenceCandidate[]` に `score`）+ Task 2（公開 API）。
