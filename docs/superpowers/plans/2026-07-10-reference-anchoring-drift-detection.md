# 条文参照の二重アンカーと改正検知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保存した条文参照を「論理条番号 + 作成時 revisionId + 指紋」で持ち、開くときに指紋照合して改正のズレを検知し、バッジと 2 択（付け替え / 版固定）で修復できるようにする。

**Architecture:** 3 層に分ける。指紋計算（core/domain、純粋・非同期）／article ノード探索・検証・修復（core/viewer、純粋）／検証の配線・バッジ・見比べ・保存アクション（ビューワー UI）。既存のブックマーク基盤（#20 完了済み）にアンカーを足す。

**Tech Stack:** TypeScript (strict), Vitest, React 19, @tanstack/react-router, Web Crypto（`crypto.subtle`）, 既存 `@/core/egov` `@/core/storage` `@/core/settings`。

設計根拠: [docs/superpowers/specs/2026-07-10-reference-anchoring-drift-detection-design.md](../specs/2026-07-10-reference-anchoring-drift-detection-design.md)（上位: [2026-07-07-revision-and-asof-design.md](../specs/2026-07-07-revision-and-asof-design.md)）

## Global Constraints

- TypeScript strict。`any` 禁止。型は明示的にエクスポート（`export type`）。
- モジュール横断は `@/` エイリアス、モジュール内は相対 `./x`。
- コメントは日本語。非自明な直値・アルゴリズムの意図には理由を添える。
- `nil` 配列を作らない。空は空配列/`undefined` を使う。
- 検証ゲート（プロジェクト標準 check）: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` を全て通す。コミット前に必ず `pnpm format` を実行してから `pnpm format:check` を確認する。
- 指紋アルゴリズムは spec §4 の値を厳守: `plainText.normalize("NFKC")` → `\s` 除去 → SHA-256 → 16 進の**先頭 16 文字**。小文字化しない（`normalizeForSearch` を再利用しない）。
- `crypto.subtle` は Node 26 / vitest jsdom 環境でグローバルに利用可能（本計画作成時に実測確認済み。モック不要）。
- 既存の未アンカー・ブックマーク（`fingerprint` なし）を壊さない（検証をスキップ）。
- UI を変更するタスクは、コミット前に playwright-cli で実画面を確認する（Task 8 で e-Gov 実 API を用いてエンドツーエンド確認）。

## File Structure

| ファイル                                 | 責務                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `src/core/domain/article-fingerprint.ts` | `computeArticleFingerprint`（NFKC→空白除去→SHA-256 先頭16hex）             |
| `src/core/domain/references.ts`（変更）  | `LawReferenceTarget` に `fingerprint`/`pinned`、`AnchoredArticleReference` |
| `src/core/domain/index.ts`（変更）       | 追加分の barrel                                                            |
| `src/core/viewer/anchor-verification.ts` | `findArticleNode` / `verifyAnchor` / `AnchorStatus`                        |
| `src/core/viewer/anchor-repair.ts`       | `repathAnchor` / `pinAnchor`（純粋な target 変換）                         |
| `src/core/viewer/index.ts`（変更）       | 追加分の barrel                                                            |
| `src/app/use-anchor-verification.ts`     | アクティブ条のアンカーを引き検証するフック                                 |
| `src/app/AnchorDriftBadge.tsx`           | 「改正の可能性」バッジ                                                     |
| `src/app/AnchorCompareDialog.tsx`        | 見比べ画面＋2択修復                                                        |
| `src/app/law-viewer-page.tsx`（変更）    | 保存アクション・バッジ配線・pinned 内部解決                                |

各 UI タスクの実装者は、編集対象 `src/app/law-viewer-page.tsx`（既に大きい）の現状を読んでから配線位置を決める。新規ファイルは本計画のコードをそのまま作る。

---

### Task 1: 条文指紋（core/domain）

**Files:**

- Create: `src/core/domain/article-fingerprint.ts`
- Test: `src/core/domain/article-fingerprint.test.ts`
- Modify: `src/core/domain/index.ts`

**Interfaces:**

- Consumes: なし（グローバル `crypto.subtle`, `TextEncoder`）
- Produces: `computeArticleFingerprint(plainText: string): Promise<string>`（16 文字の hex）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/domain/article-fingerprint.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { computeArticleFingerprint } from "./article-fingerprint";

describe("computeArticleFingerprint", () => {
  it("16 文字の hex を返す", async () => {
    const fp = await computeArticleFingerprint("第一条 この法律は…");
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it("同じ入力には同じ指紋を返す（決定的）", async () => {
    const a = await computeArticleFingerprint("第一条 この法律は…");
    const b = await computeArticleFingerprint("第一条 この法律は…");
    expect(a).toBe(b);
  });

  it("NFKC と空白除去でゆれを吸収する（全角/半角・空白違いは同一指紋）", async () => {
    // "ABC" の全角と、途中の空白・改行違いは NFKC + 空白除去で同一に落ちる。
    const a = await computeArticleFingerprint("ＡＢＣ 第一条");
    const b = await computeArticleFingerprint("ABC第一条");
    expect(a).toBe(b);
  });

  it("句読点程度の差でも不一致になる（改変検知）", async () => {
    const a = await computeArticleFingerprint("第一条 この法律は、…");
    const b = await computeArticleFingerprint("第一条 この法律は。…");
    expect(a).not.toBe(b);
  });

  it("英字の大文字小文字差は保持する（不一致になる）", async () => {
    // 指紋は照合用正規化と違い小文字化しない。改変とみなす。
    const a = await computeArticleFingerprint("Abc");
    const b = await computeArticleFingerprint("abc");
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/core/domain/article-fingerprint.test.ts`
Expected: FAIL（`Cannot find module "./article-fingerprint"`）

- [ ] **Step 3: 実装**

`src/core/domain/article-fingerprint.ts`:

```ts
// 条ノードの plainText から改変検知用の指紋を作る。
// NFKC 正規化 → 空白除去 → SHA-256 → 16 進表現の先頭 16 文字。
// 目的は改変検知であり衝突耐性は要求しないため 64 bit(16 hex)で十分。
// 照合用の normalizeForSearch は小文字化するため再利用しない（大文字小文字差も検知したい）。
export const computeArticleFingerprint = async (plainText: string): Promise<string> => {
  const normalized = plainText.normalize("NFKC").replace(/\s/gu, "");
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test -- src/core/domain/article-fingerprint.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: barrel に追加**

`src/core/domain/index.ts` の末尾へ次の行を追加する:

```ts
export { computeArticleFingerprint } from "./article-fingerprint";
```

- [ ] **Step 6: 整形して check、コミット**

```bash
pnpm format
pnpm typecheck && pnpm lint && pnpm test -- src/core/domain && pnpm format:check
git add src/core/domain/article-fingerprint.ts src/core/domain/article-fingerprint.test.ts src/core/domain/index.ts
git commit -m "$(cat <<'EOF'
feat(domain): 条文指紋 computeArticleFingerprint を実装する

NFKC 正規化 → 空白除去 → SHA-256 先頭 16 hex。改変検知用。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 参照型の拡張（core/domain）

**Files:**

- Modify: `src/core/domain/references.ts`
- Modify: `src/core/domain/index.ts`
- Test: `src/core/domain/references.test.ts`（既存に追記）

**Interfaces:**

- Consumes: 既存 `LawReferenceTarget`, `ArticleReference`, `buildArticleReferenceKey`
- Produces:
  - `LawReferenceTarget` に `fingerprint?: string | null`, `pinned?: boolean | null`
  - `type AnchoredArticleReference = ArticleReference & { revisionId: string; fingerprint: string }`

- [ ] **Step 1: 失敗するテストを書く（target-key 不変の振る舞い）**

`src/core/domain/references.test.ts` に次の describe を追記する（既存の import に `AnchoredArticleReference` は不要。`buildArticleReferenceKey` は既存 import を使う。無ければ `import { buildArticleReferenceKey } from "./references";` を追加）:

```ts
describe("fingerprint/pinned は参照キーに影響しない", () => {
  it("fingerprint・pinned の有無で buildArticleReferenceKey は変わらない", () => {
    const base = { lawId: "322AC0000000125", article: "1" };
    const anchored = { ...base, revisionId: "r1", fingerprint: "abc123", pinned: true };

    // by-target-key 索引でアンカーを引くため、キーは指紋等に依存してはならない。
    expect(buildArticleReferenceKey(anchored)).toBe(buildArticleReferenceKey(base));
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/core/domain/references.test.ts`
Expected: FAIL（`fingerprint`/`pinned`/`revisionId` を持つオブジェクトが `LawReferenceTarget` 型に通らずコンパイルエラー、または型追加前は型エラーで失敗）

- [ ] **Step 3: 型を拡張する**

`src/core/domain/references.ts` の `LawReferenceTarget` に 2 フィールドを追加し、`AnchoredArticleReference` を追加する:

```ts
export interface LawReferenceTarget {
  lawId: string;
  revisionId?: string | null;
  article?: string | null;
  paragraph?: string | null;
  item?: string | null;
  path?: string | null;
  // 追加: 条文指紋（改変検知）。#20 由来の未アンカー参照は持たない。
  fingerprint?: string | null;
  // 追加: true なら基準日でなく revisionId で解決し、バッジを常設する。
  pinned?: boolean | null;
}

// 保存物（ブックマーク等）のアンカーが満たす制約。revisionId と fingerprint を必須にする。
export interface AnchoredArticleReference extends ArticleReference {
  revisionId: string;
  fingerprint: string;
}
```

（既存の `buildArticleReferenceKey` は `lawId`/`revisionId`/`article`/`paragraph`/`item` のみからキーを作るため、`fingerprint`/`pinned` を無視する。追加変更は不要。）

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test -- src/core/domain/references.test.ts`
Expected: PASS

- [ ] **Step 5: barrel に型を追加**

`src/core/domain/index.ts` の references 型 export を次のとおり広げる:

```ts
export type { ArticleReference, AnchoredArticleReference, LawReferenceTarget } from "./references";
```

- [ ] **Step 6: 整形して check、コミット**

```bash
pnpm format
pnpm typecheck && pnpm lint && pnpm test -- src/core/domain && pnpm format:check
git add src/core/domain/references.ts src/core/domain/references.test.ts src/core/domain/index.ts
git commit -m "$(cat <<'EOF'
feat(domain): 参照型に fingerprint/pinned とアンカー制約を足す

LawReferenceTarget に fingerprint・pinned を追加(非破壊)。
AnchoredArticleReference を導入。参照キーは指紋に依存しない。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 解決・検証（core/viewer）

**Files:**

- Create: `src/core/viewer/anchor-verification.ts`
- Test: `src/core/viewer/anchor-verification.test.ts`
- Modify: `src/core/viewer/index.ts`

**Interfaces:**

- Consumes: `computeArticleFingerprint`（Task 1、`@/core/domain`）、`LawNode`（`@/core/domain`）
- Produces:
  - `findArticleNode(nodes: LawNode[], article: string): LawNode | undefined`
  - `type AnchorStatus = "match" | "drift" | "not_found"`
  - `verifyAnchor(anchor: { article: string; fingerprint: string }, nodes: LawNode[]): Promise<AnchorStatus>`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/viewer/anchor-verification.test.ts`:

```ts
import type { LawNode } from "@/core/domain";
import { computeArticleFingerprint } from "@/core/domain";
import { describe, expect, it } from "vitest";

import { findArticleNode, verifyAnchor } from "./anchor-verification";

const articleNode = (number: string, plainText: string): LawNode => ({
  id: `art-${number}`,
  lawId: "L",
  revisionId: "R",
  type: "Article",
  path: `/Article[${number}]`,
  number,
  rawText: plainText,
  plainText,
  children: [],
});

const nodes: LawNode[] = [
  articleNode("1", "第一条 この法律は…"),
  articleNode("2", "第二条 用語の定義…"),
  { ...articleNode("3", "第三条"), type: "Paragraph" }, // Article でないノードは無視される
];

describe("findArticleNode", () => {
  it("条番号一致で Article ノードを返す", () => {
    expect(findArticleNode(nodes, "2")?.number).toBe("2");
  });

  it("該当条が無ければ undefined", () => {
    expect(findArticleNode(nodes, "99")).toBeUndefined();
  });

  it("同番号でも Article でないノードは拾わない", () => {
    expect(findArticleNode(nodes, "3")).toBeUndefined();
  });
});

describe("verifyAnchor", () => {
  it("指紋一致で match", async () => {
    const fingerprint = await computeArticleFingerprint("第一条 この法律は…");
    expect(await verifyAnchor({ article: "1", fingerprint }, nodes)).toBe("match");
  });

  it("指紋不一致で drift", async () => {
    expect(await verifyAnchor({ article: "1", fingerprint: "deadbeefdeadbeef" }, nodes)).toBe(
      "drift",
    );
  });

  it("該当条が無ければ not_found", async () => {
    expect(await verifyAnchor({ article: "99", fingerprint: "deadbeefdeadbeef" }, nodes)).toBe(
      "not_found",
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/core/viewer/anchor-verification.test.ts`
Expected: FAIL（`Cannot find module "./anchor-verification"`）

- [ ] **Step 3: 実装**

`src/core/viewer/anchor-verification.ts`:

```ts
import type { LawNode } from "@/core/domain";
import { computeArticleFingerprint } from "@/core/domain";

// 現在解決した nodes から、指定の条番号の Article ノードを引く。
// 解決キーは条番号（枝番はビューワー/TOC と同じハイフン表現）で、階層 path は使わない。
export const findArticleNode = (nodes: LawNode[], article: string): LawNode | undefined => {
  return nodes.find((node) => node.type === "Article" && node.number === article);
};

export type AnchorStatus = "match" | "drift" | "not_found";

// アンカーの条番号を現在の nodes から解決し、指紋を再計算して照合する。
// 条が見つからなければ not_found、指紋一致で match、不一致で drift。
export const verifyAnchor = async (
  anchor: { article: string; fingerprint: string },
  nodes: LawNode[],
): Promise<AnchorStatus> => {
  const node = findArticleNode(nodes, anchor.article);

  if (node === undefined) {
    return "not_found";
  }

  const current = await computeArticleFingerprint(node.plainText);

  return current === anchor.fingerprint ? "match" : "drift";
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test -- src/core/viewer/anchor-verification.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: barrel に追加**

`src/core/viewer/index.ts` の末尾へ追加:

```ts
export { findArticleNode, verifyAnchor } from "./anchor-verification";
export type { AnchorStatus } from "./anchor-verification";
```

- [ ] **Step 6: 整形して check、コミット**

```bash
pnpm format
pnpm typecheck && pnpm lint && pnpm test -- src/core/viewer && pnpm format:check
git add src/core/viewer/anchor-verification.ts src/core/viewer/anchor-verification.test.ts src/core/viewer/index.ts
git commit -m "$(cat <<'EOF'
feat(viewer): アンカー検証 verifyAnchor/findArticleNode を実装する

条番号で Article ノードを引き、指紋を再計算して
match/drift/not_found を返す純粋関数。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 修復ロジック（core/viewer、純粋）

**Files:**

- Create: `src/core/viewer/anchor-repair.ts`
- Test: `src/core/viewer/anchor-repair.test.ts`
- Modify: `src/core/viewer/index.ts`

**Interfaces:**

- Consumes: `LawReferenceTarget`（`@/core/domain`）
- Produces:
  - `repathAnchor(target: LawReferenceTarget, next: { revisionId: string; fingerprint: string }): LawReferenceTarget`
  - `pinAnchor(target: LawReferenceTarget): LawReferenceTarget`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/viewer/anchor-repair.test.ts`:

```ts
import type { LawReferenceTarget } from "@/core/domain";
import { describe, expect, it } from "vitest";

import { pinAnchor, repathAnchor } from "./anchor-repair";

const target: LawReferenceTarget = {
  lawId: "322AC0000000125",
  article: "1",
  revisionId: "old-rev",
  fingerprint: "oldfingerprint00",
  pinned: false,
};

describe("repathAnchor", () => {
  it("fingerprint と revisionId を現在の解決先へ更新し pinned を false にする", () => {
    const next = repathAnchor(target, { revisionId: "new-rev", fingerprint: "newfingerprint00" });

    expect(next).toEqual({
      ...target,
      revisionId: "new-rev",
      fingerprint: "newfingerprint00",
      pinned: false,
    });
  });

  it("元の target を変更しない（純粋）", () => {
    repathAnchor(target, { revisionId: "new-rev", fingerprint: "newfingerprint00" });
    expect(target.revisionId).toBe("old-rev");
  });
});

describe("pinAnchor", () => {
  it("pinned を true にし revisionId/fingerprint を保つ", () => {
    expect(pinAnchor(target)).toEqual({ ...target, pinned: true });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/core/viewer/anchor-repair.test.ts`
Expected: FAIL（`Cannot find module "./anchor-repair"`）

- [ ] **Step 3: 実装**

`src/core/viewer/anchor-repair.ts`:

```ts
import type { LawReferenceTarget } from "@/core/domain";

// 「新しい条文に付け替える」: 指紋と revisionId を現在の解決先へ更新し、固定を解除する。
export const repathAnchor = (
  target: LawReferenceTarget,
  next: { revisionId: string; fingerprint: string },
): LawReferenceTarget => ({
  ...target,
  revisionId: next.revisionId,
  fingerprint: next.fingerprint,
  pinned: false,
});

// 「この版のまま固定する」: 以後 revisionId 固定で開き、バッジを常設する。
export const pinAnchor = (target: LawReferenceTarget): LawReferenceTarget => ({
  ...target,
  pinned: true,
});
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test -- src/core/viewer/anchor-repair.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: barrel に追加**

`src/core/viewer/index.ts` の末尾へ追加:

```ts
export { pinAnchor, repathAnchor } from "./anchor-repair";
```

- [ ] **Step 6: 整形して check、コミット**

```bash
pnpm format
pnpm typecheck && pnpm lint && pnpm test -- src/core/viewer && pnpm format:check
git add src/core/viewer/anchor-repair.ts src/core/viewer/anchor-repair.test.ts src/core/viewer/index.ts
git commit -m "$(cat <<'EOF'
feat(viewer): アンカー修復 repathAnchor/pinAnchor を実装する

付け替え(指紋+revisionId 更新, pinned=false)と
版固定(pinned=true)の純粋な target 変換。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: アンカー検証フック（app）

保存済みアンカーを storage から引き、現在の nodes に対して検証状態を返すフックを作る。UI（バッジ・見比べ）はこの状態を消費する。

**Files:**

- Create: `src/app/use-anchor-verification.ts`
- Test: `src/app/use-anchor-verification.test.ts`

**Interfaces:**

- Consumes:
  - `verifyAnchor`, `AnchorStatus`（`@/core/viewer`、Task 3）
  - `buildArticleReferenceKey`, `LawNode`, `Bookmark`（`@/core/domain`）
  - `StorageRepository.listBookmarks(query?: { lawId?: string }): Promise<Bookmark[]>`（`@/core/storage`、既存）
- Produces:
  - `interface AnchorVerification { status: AnchorStatus; bookmark: Bookmark }`
  - `useAnchorVerification(args: { lawId: string; article: string | undefined; nodes: LawNode[]; storageRepository: StorageRepository }): AnchorVerification | undefined`
  - 返り値 `undefined` は「アンカー無し or 指紋なし（未アンカー）で検証対象外」を表す。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/use-anchor-verification.test.ts`:

```ts
import type { Bookmark, LawNode } from "@/core/domain";
import { computeArticleFingerprint } from "@/core/domain";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAnchorVerification } from "./use-anchor-verification";

const articleNode = (number: string, plainText: string): LawNode => ({
  id: `art-${number}`,
  lawId: "L",
  revisionId: "R",
  type: "Article",
  path: `/Article[${number}]`,
  number,
  rawText: plainText,
  plainText,
  children: [],
});

const nodes = [articleNode("1", "第一条 この法律は…")];

const bookmark = (target: Bookmark["target"]): Bookmark => ({
  id: "b1",
  target,
  title: "テスト",
  tags: [],
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
});

const storageWith = (bookmarks: Bookmark[]) =>
  ({ listBookmarks: async () => bookmarks }) as unknown as Parameters<
    typeof useAnchorVerification
  >[0]["storageRepository"];

describe("useAnchorVerification", () => {
  it("アンカー付きブックマークが drift のとき status=drift を返す", async () => {
    const storageRepository = storageWith([
      bookmark({ lawId: "L", article: "1", revisionId: "R", fingerprint: "deadbeefdeadbeef" }),
    ]);

    const { result } = renderHook(() =>
      useAnchorVerification({ lawId: "L", article: "1", nodes, storageRepository }),
    );

    await waitFor(() => expect(result.current?.status).toBe("drift"));
  });

  it("指紋が一致すれば status=match", async () => {
    const fingerprint = await computeArticleFingerprint("第一条 この法律は…");
    const storageRepository = storageWith([
      bookmark({ lawId: "L", article: "1", revisionId: "R", fingerprint }),
    ]);

    const { result } = renderHook(() =>
      useAnchorVerification({ lawId: "L", article: "1", nodes, storageRepository }),
    );

    await waitFor(() => expect(result.current?.status).toBe("match"));
  });

  it("未アンカー（指紋なし）ブックマークは undefined（検証対象外）", async () => {
    const storageRepository = storageWith([bookmark({ lawId: "L", article: "1" })]);

    const { result } = renderHook(() =>
      useAnchorVerification({ lawId: "L", article: "1", nodes, storageRepository }),
    );

    // 非同期解決後も undefined のままであることを確認する。
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeUndefined();
  });

  it("article 未指定なら undefined", () => {
    const storageRepository = storageWith([]);
    const { result } = renderHook(() =>
      useAnchorVerification({ lawId: "L", article: undefined, nodes, storageRepository }),
    );
    expect(result.current).toBeUndefined();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/app/use-anchor-verification.test.ts`
Expected: FAIL（`Cannot find module "./use-anchor-verification"`）

- [ ] **Step 3: 実装**

`src/app/use-anchor-verification.ts`:

```ts
import { useEffect, useState } from "react";

import type { Bookmark, LawNode } from "@/core/domain";
import { buildArticleReferenceKey } from "@/core/domain";
import type { StorageRepository } from "@/core/storage";
import type { AnchorStatus } from "@/core/viewer";
import { verifyAnchor } from "@/core/viewer";

export interface AnchorVerification {
  status: AnchorStatus;
  bookmark: Bookmark;
}

interface UseAnchorVerificationArgs {
  lawId: string;
  article: string | undefined;
  nodes: LawNode[];
  storageRepository: StorageRepository;
}

// アクティブな条について、指紋付きアンカー（ブックマーク）を storage から引き、
// 現在の nodes に対して検証状態を返す。未アンカー・該当なしは undefined。
export const useAnchorVerification = ({
  lawId,
  article,
  nodes,
  storageRepository,
}: UseAnchorVerificationArgs): AnchorVerification | undefined => {
  const [verification, setVerification] = useState<AnchorVerification | undefined>(undefined);

  useEffect(() => {
    if (article === undefined || article === "") {
      setVerification(undefined);
      return;
    }

    let cancelled = false;
    const targetKey = buildArticleReferenceKey({ lawId, article });

    const run = async () => {
      const bookmarks = await storageRepository.listBookmarks({ lawId });
      // by-target-key 相当の突き合わせ。指紋を持つ（アンカー付き）ものだけ検証する。
      const anchored = bookmarks.find(
        (bookmark) =>
          typeof bookmark.target.fingerprint === "string" &&
          buildArticleReferenceKey(bookmark.target) === targetKey,
      );

      if (anchored?.target.fingerprint === undefined || anchored.target.fingerprint === null) {
        if (!cancelled) {
          setVerification(undefined);
        }
        return;
      }

      const status = await verifyAnchor(
        { article, fingerprint: anchored.target.fingerprint },
        nodes,
      );

      if (!cancelled) {
        setVerification({ status, bookmark: anchored });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [lawId, article, nodes, storageRepository]);

  return verification;
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test -- src/app/use-anchor-verification.test.ts`
Expected: PASS（4 tests、出力に警告なし）

- [ ] **Step 5: 整形して check、コミット**

```bash
pnpm format
pnpm typecheck && pnpm lint && pnpm test -- src/app/use-anchor-verification.test.ts && pnpm format:check
git add src/app/use-anchor-verification.ts src/app/use-anchor-verification.test.ts
git commit -m "$(cat <<'EOF'
feat(app): アンカー検証フック useAnchorVerification を追加する

アクティブ条の指紋付きブックマークを引き、現在版と照合して
match/drift/not_found を返す。未アンカーは検証しない。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: バッジと見比べ・2 択修復 UI（app）

**Files:**

- Create: `src/app/AnchorDriftBadge.tsx`
- Create: `src/app/AnchorCompareDialog.tsx`
- Test: `src/app/AnchorCompareDialog.test.tsx`

**Interfaces:**

- Consumes:
  - `AnchorStatus`（`@/core/viewer`）、`repathAnchor`, `pinAnchor`（`@/core/viewer`、Task 4）
  - `Bookmark`, `LawNode`, `computeArticleFingerprint`（`@/core/domain`）
  - `findArticleNode`（`@/core/viewer`）
  - `StorageRepository.putBookmark`（既存）
  - 現在版の nodes と現在版 revisionId（親から props）
  - 作成時版の nodes を取得する関数（親から注入。既定は e-Gov `getLaw(revisionId)`）
- Produces:
  - `AnchorDriftBadge`（`status: "drift" | "not_found"` を受け、クリックで `onOpenCompare` を呼ぶ）
  - `AnchorCompareDialog`（見比べ＋2択。修復後 `onRepaired(updated: Bookmark)` を呼ぶ）

- [ ] **Step 1: 失敗するテストを書く（見比べダイアログの 2 択が target を更新する）**

`src/app/AnchorCompareDialog.test.tsx`:

```tsx
import type { Bookmark, LawNode } from "@/core/domain";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AnchorCompareDialog } from "./AnchorCompareDialog";

const articleNode = (number: string, plainText: string): LawNode => ({
  id: `art-${number}`,
  lawId: "L",
  revisionId: "cur",
  type: "Article",
  path: `/Article[${number}]`,
  number,
  rawText: plainText,
  plainText,
  children: [],
});

const bookmark: Bookmark = {
  id: "b1",
  target: { lawId: "L", article: "1", revisionId: "old", fingerprint: "oldfingerprint00" },
  title: "テスト",
  tags: [],
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

const baseProps = {
  bookmark,
  status: "drift" as const,
  currentNodes: [articleNode("1", "第一条 改正後の本文…")],
  currentRevisionId: "cur",
  loadCreatedNodes: async () => [articleNode("1", "第一条 改正前の本文…")],
  onClose: () => {},
};

describe("AnchorCompareDialog", () => {
  it("「付け替える」で target の指紋と revisionId を現在版へ更新して保存する", async () => {
    const putBookmark = vi.fn(async () => {});
    const onRepaired = vi.fn();

    render(
      <AnchorCompareDialog
        {...baseProps}
        storageRepository={{ putBookmark } as never}
        onRepaired={onRepaired}
      />,
    );

    await screen.findByText("第一条 改正前の本文…");
    await userEvent.click(screen.getByRole("button", { name: "新しい条文に付け替える" }));

    await waitFor(() => expect(putBookmark).toHaveBeenCalledTimes(1));
    const saved = putBookmark.mock.calls[0][0] as Bookmark;
    expect(saved.target.revisionId).toBe("cur");
    expect(saved.target.pinned).toBe(false);
    // 現在版本文の指紋に更新されている（元の指紋とは異なる）。
    expect(saved.target.fingerprint).not.toBe("oldfingerprint00");
    expect(onRepaired).toHaveBeenCalledTimes(1);
  });

  it("「この版のまま固定する」で pinned=true にして保存する", async () => {
    const putBookmark = vi.fn(async () => {});

    render(
      <AnchorCompareDialog
        {...baseProps}
        storageRepository={{ putBookmark } as never}
        onRepaired={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "この版のまま固定する" }));

    await waitFor(() => expect(putBookmark).toHaveBeenCalledTimes(1));
    const saved = putBookmark.mock.calls[0][0] as Bookmark;
    expect(saved.target.pinned).toBe(true);
    expect(saved.target.revisionId).toBe("old");
  });

  it("not_found のとき「付け替える」は無効", async () => {
    render(
      <AnchorCompareDialog
        {...baseProps}
        status="not_found"
        currentNodes={[]}
        storageRepository={{ putBookmark: async () => {} } as never}
        onRepaired={() => {}}
      />,
    );

    expect(screen.getByText("現在の版に該当する条が見つかりません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新しい条文に付け替える" })).toBeDisabled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/app/AnchorCompareDialog.test.tsx`
Expected: FAIL（`Cannot find module "./AnchorCompareDialog"`）

- [ ] **Step 3: バッジを実装**

`src/app/AnchorDriftBadge.tsx`:

```tsx
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

interface AnchorDriftBadgeProps {
  status: "drift" | "not_found";
  onOpenCompare: () => void;
}

// 「改正の可能性」バッジ。クリックで見比べ画面を開く。
export const AnchorDriftBadge = ({ status, onOpenCompare }: AnchorDriftBadgeProps) => (
  <Button
    className="h-auto p-0"
    onClick={onOpenCompare}
    type="button"
    variant="ghost"
    aria-label="改正の可能性を確認する"
  >
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle aria-hidden="true" className="size-3.5" />
      {status === "not_found" ? "条が見つかりません" : "改正の可能性"}
    </Badge>
  </Button>
);
```

- [ ] **Step 4: 見比べダイアログを実装**

`src/app/AnchorCompareDialog.tsx`:

```tsx
import { useEffect, useState } from "react";

import type { Bookmark, LawNode } from "@/core/domain";
import { computeArticleFingerprint } from "@/core/domain";
import type { StorageRepository } from "@/core/storage";
import type { AnchorStatus } from "@/core/viewer";
import { findArticleNode, pinAnchor, repathAnchor } from "@/core/viewer";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

interface AnchorCompareDialogProps {
  bookmark: Bookmark;
  status: AnchorStatus;
  currentNodes: LawNode[];
  currentRevisionId: string;
  loadCreatedNodes: () => Promise<LawNode[]>;
  storageRepository: StorageRepository;
  onRepaired: (updated: Bookmark) => void;
  onClose: () => void;
}

// 作成時版と現在の解決先を見比べ、「付け替える」「この版のまま固定する」の 2 択を提供する。
export const AnchorCompareDialog = ({
  bookmark,
  status,
  currentNodes,
  currentRevisionId,
  loadCreatedNodes,
  storageRepository,
  onRepaired,
  onClose,
}: AnchorCompareDialogProps) => {
  const article = bookmark.target.article ?? "";
  const [createdText, setCreatedText] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadCreatedNodes().then((nodes) => {
      if (!cancelled) {
        setCreatedText(findArticleNode(nodes, article)?.plainText ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadCreatedNodes, article]);

  const currentNode = findArticleNode(currentNodes, article);
  const canRepath = status !== "not_found" && currentNode !== undefined;

  const persist = async (updated: Bookmark) => {
    setIsSaving(true);
    try {
      await storageRepository.putBookmark(updated);
      onRepaired(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRepath = async () => {
    if (currentNode === undefined) {
      return;
    }
    const fingerprint = await computeArticleFingerprint(currentNode.plainText);
    const now = new Date().toISOString();
    await persist({
      ...bookmark,
      updatedAt: now,
      target: repathAnchor(bookmark.target, { revisionId: currentRevisionId, fingerprint }),
    });
  };

  const handlePin = async () => {
    const now = new Date().toISOString();
    await persist({ ...bookmark, updatedAt: now, target: pinAnchor(bookmark.target) });
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>改正の可能性</DialogTitle>
          <DialogDescription>
            作成時の条文と現在の条文を見比べて、参照の扱いを選んでください。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <section>
            <h3 className="mb-1 text-sm font-semibold">作成時の版</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {createdText ?? "読み込み中…"}
            </p>
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold">現在の版</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {status === "not_found"
                ? "現在の版に該当する条が見つかりません"
                : (currentNode?.plainText ?? "")}
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button disabled={!canRepath || isSaving} onClick={handleRepath} type="button">
            新しい条文に付け替える
          </Button>
          <Button disabled={isSaving} onClick={handlePin} type="button" variant="secondary">
            この版のまま固定する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm test -- src/app/AnchorCompareDialog.test.tsx`
Expected: PASS（3 tests）

- [ ] **Step 6: 整形して check、コミット**

```bash
pnpm format
pnpm typecheck && pnpm lint && pnpm test -- src/app/AnchorCompareDialog.test.tsx && pnpm format:check
git add src/app/AnchorDriftBadge.tsx src/app/AnchorCompareDialog.tsx src/app/AnchorCompareDialog.test.tsx
git commit -m "$(cat <<'EOF'
feat(app): 改正バッジと見比べ・2択修復ダイアログを追加する

drift/not_found のバッジと、作成時版/現在版の見比べ、
付け替え/版固定の 2 択で target を更新して保存する。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: ビューワー配線（保存アクション・バッジ・pinned 内部解決）

ビューワー本体に、(a)「この条文を保存」アクション、(b) アンカー検証フックの配線とバッジ表示・見比べダイアログ起動、(c) pinned アンカーの版固定内部解決 を組み込む。

**Files:**

- Modify: `src/app/law-viewer-page.tsx`
- Test: `src/app/law-viewer-page.test.tsx`（既存に追記）

**Interfaces:**

- Consumes:
  - `useAnchorVerification`（Task 5）、`AnchorDriftBadge`, `AnchorCompareDialog`（Task 6）
  - `computeArticleFingerprint`（`@/core/domain`）、`findArticleNode`（`@/core/viewer`）
  - `generateStorageId`（`@/core/storage`、saved-page が使用中）、`StorageRepository.putBookmark`
  - 既存の `loadLawViewerDocument(lawId, repository, storageRepository, asOf?)`（app）
- Produces: ビューワー内の配線のみ（新規 export なし）

実装者はまず `src/app/law-viewer-page.tsx` の現状（アクティブ条の特定 `activeArticleNumber`、`state.nodes`、`state.revision`、ツールバー領域、`storageRepository` の取得箇所）を読むこと。

- [ ] **Step 1: 失敗するテストを書く（保存→再オープンでバッジ、指紋一致でバッジ無し）**

`src/app/law-viewer-page.test.tsx` に、既存のレンダリングヘルパー（このファイルの他テストが使う `renderLawViewer` 相当のセットアップ）に倣って次を追記する。既存テストが使う repository/storage スタブの作り方に合わせること。要点の振る舞い:

```tsx
// 追記するテストの意図（既存ヘルパーに合わせて配線する）:
// 1) アクティブ条にアンカー付きブックマーク(指紋不一致)がある状態で開くと
//    「改正の可能性」バッジが表示される。
// 2) 指紋一致のアンカーではバッジが表示されない。
//
// 既存テストと同様、TanStack Router の初期マッチは非同期なので
// findByText / findByRole で待つこと（同期 getBy… で即アサートしない）。

it("アンカーが drift のとき改正の可能性バッジを表示する", async () => {
  // storageRepository.listBookmarks が
  //   target={lawId, article:"1", revisionId, fingerprint:"deadbeefdeadbeef"} を返すスタブ、
  // repository.getLaw が第1条 plainText を持つ nodes を返すスタブを用意し、
  // /laws/:lawId/articles/1 でレンダリングする。
  // 期待: await screen.findByText("改正の可能性")
});
```

実装者は、このファイルの既存テストが使う `createStubRepository` / `renderAtRoute` 等の実在ヘルパー名に合わせて 2 ケース（drift でバッジ表示、match でバッジ非表示）を具体化する。アサーションは `findByText("改正の可能性")` / `queryByText("改正の可能性")` を使う。

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/app/law-viewer-page.test.tsx`
Expected: FAIL（バッジ未実装のため `findByText("改正の可能性")` がタイムアウト）

- [ ] **Step 3: アンカー検証とバッジを配線する**

`src/app/law-viewer-page.tsx` の ready 状態を描画するコンポーネント（`activeArticleNumber` と `state.nodes` を持つ階層）に次を組み込む:

1. import を追加:

```tsx
import { computeArticleFingerprint } from "@/core/domain";
import { findArticleNode } from "@/core/viewer";
import { createStorageRepository, generateStorageId } from "@/core/storage";

import { useAnchorVerification } from "./use-anchor-verification";
import { AnchorDriftBadge } from "./AnchorDriftBadge";
import { AnchorCompareDialog } from "./AnchorCompareDialog";
```

2. 検証フックとダイアログ開閉 state を宣言（`lawId`・`activeArticleNumber`・`state.nodes`・`storageRepository` は既存のスコープ変数を使う）:

```tsx
const verification = useAnchorVerification({
  lawId,
  article: activeArticleNumber,
  nodes: state.nodes,
  storageRepository,
});
const [isCompareOpen, setIsCompareOpen] = useState(false);
```

3. アクティブ条の見出し付近に、`verification` が drift / not_found のときバッジを出す:

```tsx
{
  verification !== undefined && verification.status !== "match" ? (
    <AnchorDriftBadge status={verification.status} onOpenCompare={() => setIsCompareOpen(true)} />
  ) : null;
}
```

4. ダイアログを条件表示する。作成時版の取得は `repository.getLaw(revisionId)` を使う:

```tsx
{
  isCompareOpen && verification !== undefined ? (
    <AnchorCompareDialog
      bookmark={verification.bookmark}
      status={verification.status}
      currentNodes={state.nodes}
      currentRevisionId={state.revision.revisionId}
      loadCreatedNodes={async () =>
        (await repository.getLaw(verification.bookmark.target.revisionId ?? "")).nodes
      }
      storageRepository={storageRepository}
      onRepaired={() => setIsCompareOpen(false)}
      onClose={() => setIsCompareOpen(false)}
    />
  ) : null;
}
```

- [ ] **Step 4: 「この条文を保存」アクションを追加する**

アクティブ条のツールバー（既存の条コピー/URL コピー付近）に、現在版の指紋付きアンカーを作るボタンを追加する:

```tsx
const handleSaveAnchor = async (articleNumber: string) => {
  const node = findArticleNode(state.nodes, articleNumber);
  if (node === undefined) {
    return;
  }
  const fingerprint = await computeArticleFingerprint(node.plainText);
  const now = new Date().toISOString();
  await storageRepository.putBookmark({
    id: generateStorageId(),
    target: {
      lawId,
      article: articleNumber,
      revisionId: state.revision.revisionId,
      fingerprint,
    },
    title: node.title ?? `第${articleNumber}条`,
    tags: [],
    createdAt: now,
    updatedAt: now,
  });
};
```

ボタン（既存のアイコンボタンに倣う。`activeArticleNumber` があるときのみ表示）:

```tsx
{
  activeArticleNumber !== undefined ? (
    <Button
      onClick={() => void handleSaveAnchor(activeArticleNumber)}
      type="button"
      variant="ghost"
      aria-label="この条文を保存"
    >
      この条文を保存
    </Button>
  ) : null;
}
```

- [ ] **Step 5: pinned アンカーの版固定内部解決を配線する**

アクティブ条のアンカーが `pinned === true` のとき、当該法令の本文を revisionId で再解決する。ローダー呼び出し箇所（`loadLawViewerDocument(lawId, repository, storageRepository, asOf)`）で、`verification?.bookmark.target.pinned === true` の場合は `asOf` の代わりにそのブックマークの `revisionId` を id として渡す。実装者は既存のロード useEffect を読み、次の方針で最小変更する:

- 既存: `loadLawViewerDocument(lawId, repository, storageRepository, resolveAsOf(baseDate))`
- pinned 時: `loadLawViewerDocument(pinnedRevisionId, repository, storageRepository)`（`getLaw(revisionId)` は版固定取得）。
- pinned は「アクティブ条の検証結果に依存」するため二段ロードになりうる。実装者は無限ループを避けるため、依存配列と早期リターンに注意する（`pinned` かつ現在の revisionId が pinnedRevisionId と異なるときだけ再ロード）。

この配線はバッジ常設（pinned では検証が drift 相当のままバッジを出す）を伴う。`useAnchorVerification` は pinned でも通常どおり status を返すため、pinned のときは status が `match` でもバッジを出すよう、バッジ表示条件を次に更新する:

```tsx
{
  verification !== undefined &&
  (verification.status !== "match" || verification.bookmark.target.pinned === true) ? (
    <AnchorDriftBadge
      status={verification.status === "not_found" ? "not_found" : "drift"}
      onOpenCompare={() => setIsCompareOpen(true)}
    />
  ) : null;
}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `pnpm test -- src/app/law-viewer-page.test.tsx`
Expected: PASS（既存 + 追記 2 ケース）。全体も確認: `pnpm test`

- [ ] **Step 7: playwright-cli で実画面確認（この段でのスモーク）**

開発サーバを起動し、任意の条文を開いて「この条文を保存」→ 同じ条を再オープンでバッジが出ないこと（match）を実画面で確認し、スクリーンショットを scratchpad に保存する。詳細な drift の実 API 検証は Task 8 で行う。

- [ ] **Step 8: 整形して check、コミット**

```bash
pnpm format
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
git add src/app/law-viewer-page.tsx src/app/law-viewer-page.test.tsx
git commit -m "$(cat <<'EOF'
feat(app): ビューワーにアンカー保存・改正バッジ・版固定解決を配線する

アクティブ条の指紋付き保存、検証結果に応じたバッジと見比べ起動、
pinned アンカーの revisionId 内部解決を組み込む。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 実 API エンドツーエンド検証と PR（controller 直轄）

このタスクは controller が直接行う（subagent 化しない）。CLAUDE.md の完了報告ゲート（実 API・実画面・証跡）を満たす。

- [ ] **Step 1: 改正で条文が変わった対象を実 e-Gov で確定する**

`https://laws.e-gov.go.jp/api/2/law_data/:lawId?asof=YYYY-MM-DD&law_full_text_format=json&elm=Article=N` を、改正前後 2 つの asof で取得し、同じ条の plainText が異なることを確認する。候補: 民法（`129AC0000000089`）の債権法改正（2020-04-01 施行）で変わった条（例: 第166条 消滅時効）。改正前（例 2019-04-01）と現在で本文が異なる条を 1 つ選ぶ。

- [ ] **Step 2: match の実画面確認**

dev サーバを起動し、対象法令の対象条を現行版で開いて「この条文を保存」→ 同じ条を再オープン → バッジが出ない（match）ことを playwright-cli で確認・撮影。

- [ ] **Step 3: drift の実画面確認**

保存後、設定画面で基準日を改正前（Step 1 で確定した日）へ変更 → 同じ条を再オープン → 「改正の可能性」バッジ表示 → クリックで見比べ（作成時版=現行/現在版=改正前が並ぶ）→「新しい条文に付け替える」/「この版のまま固定する」を各々実行し、期待どおり動くことを確認・撮影。

- [ ] **Step 4: 全ゲートと PR**

`pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` を通し、Draft でない PR を作成する。本文に Close #71、スクリーンショット（match/drift/見比べ/2択の結果）を `github-image-upload` で添付、「動物界における比擬」セクションを付け、SlashNephy を assign する。

---

## Self-Review

**Spec coverage:**

- §3 データモデル（fingerprint/pinned・AnchoredArticleReference）→ Task 2。
- §4 指紋 → Task 1。
- §5 findArticleNode / verifyAnchor（3 状態）→ Task 3。
- §6 解決規則（検証→バッジ→見比べ→2択）→ Task 5（検証）・Task 6（バッジ/見比べ/2択）・Task 7（配線）。pinned 内部解決 → Task 7。
- §7 アンカー付き保存・開く導線 → Task 7（保存）・既存 BookmarkLink（開く）。未アンカー後方互換 → Task 5（指紋なしは undefined）。
- §8 非破壊（DB 版据え置き）→ Task 2 は optional 追加のみ、スキーマ変更なし。
- §9 テスト（指紋/find/verify/修復/コンポーネント/実 API E2E）→ Task 1〜7 の単体・コンポーネント、Task 8 の E2E。

**Placeholder scan:** Task 1〜6 は完全コード。Task 7 は既存の大ファイル `law-viewer-page.tsx` への配線のため、新規ロジックは完全コードで示し、配置は実装者が現状を読んで決める旨を明示（RED は具体挙動、GREEN は全体テスト）。Task 7 Step 1 のテストは既存ヘルパー名に依存するため、実在ヘルパーに合わせて具体化する指示にしている。

**Type consistency:** `computeArticleFingerprint`（Promise<string>）、`AnchorStatus`（"match"|"drift"|"not_found"）、`findArticleNode`/`verifyAnchor`、`repathAnchor`/`pinAnchor`、`AnchorVerification`（{status,bookmark}）、`useAnchorVerification` の引数/返り値は Task 3〜7 とテスト間で一致。`LawReferenceTarget.fingerprint`/`pinned` は Task 2 で定義し Task 4〜7 が参照。
