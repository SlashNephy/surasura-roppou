# 検索バー Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームの検索バーとコマンドパレットから、参照ジャンプ（`民709`→民法709条）と法令カタログ検索で目的の条文・法令へ移動できるようにする。

**Architecture:** query 分類と統合候補生成を `core/jump/quick-search.ts` の純粋コーディネータに集約し（route/UI 非依存・OCR 再利用可）、app 層は候補→ルート写像・パレットのライブ候補・`/search?q=` 候補画面を配線する。パレット開閉状態は `AppShell` 直下の Context に持ち上げ、ホームバーからも開けるようにする。

**Tech Stack:** React 19 / TanStack Router / Vitest + Testing Library / `core/jump`（`resolveReferenceInput`）/ `core/search`（`createCatalogSearchService`）。

## Global Constraints

- 表示テキスト・コメントは日本語、ログ/エラーメッセージは英語（AGENTS.md）。
- UI はデスクトップ幅・モバイル幅の両方を意識し、テキストをコンテナからはみ出させない。アクセシブルネーム／ランドマーク／キーボード操作を維持する。
- 検索の正規ルートは `/search?q=...`（Design Doc §16）。Issue 文言の `/jump?q=` は `/search` と読み替える。
- 候補スコープは参照ジャンプ＋カタログ検索の 2 系統。全文検索の配線はスコープ外。
- core（`src/core/**`）は route も UI も import しない。候補→URL の写像は app 層に置く。
- autoJump 閾値は `AUTO_JUMP_THRESHOLD = 0.7`。参照 parse score は絶対参照＋具体条番号で 0.75〜0.90、法令名のみで 0.45〜0.55（`src/core/jump/reference-parser.ts` の `scoreReference`）。この gap により閾値 0.7 は「具体的な条番号を持つ単一候補」を意味する。
- 検証ゲート: `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `pnpm test`。コミット前に必ず実行する。
- 既存の DI パターンに従う: モジュール既定シングルトン＋任意の prop/option 注入。router 経由の依存は `createAppRouter` options に追加する。

---

## File Structure

**新規**

- `src/core/jump/quick-search.ts` — query 分類 + 統合候補コーディネータ（純粋、catalog 注入）。
- `src/core/jump/quick-search.test.ts` — coordinator の table test。
- `src/app/search-navigation.ts` — `QuickSearchCandidate` → TanStack Router 遷移先の純粋写像。
- `src/app/search-navigation.test.ts` — 写像の単体テスト。
- `src/app/search-palette-context.tsx` — パレット開閉状態の Context と `useSearchPalette` フック。
- `src/app/quick-search.ts` — app の既定 `QuickSearch` シングルトン（catalog を egov + index から構築）。
- `src/app/search-page.tsx` — `/search?q=` の候補画面コンポーネント。
- `src/app/search-page.test.tsx` — 候補描画・autoJump・unresolved のテスト。

**変更**

- `src/core/jump/index.ts` — quick-search の公開エクスポート追加。
- `src/app/AppShell.tsx` — `SearchPaletteProvider` で全体を包み、`quickSearch` を受けて `SearchPalette` へ渡す。
- `src/app/SearchPalette.tsx` — 開閉を Context 化し、ライブ候補表示を追加。
- `src/app/SearchPalette.test.tsx` — ライブ候補の期待に更新。
- `src/app/home-page.tsx` — 検索バーを「パレットを開く」トリガーへ置換。
- `src/app/home-page.test.tsx` — 検索バーがパレットを開くテストへ更新／追加。
- `src/app/router.tsx` — `/search` ルート（`validateSearch`）追加、`quickSearch` を options として配線。
- `src/app/router.test.tsx` — `/search` ルート解決の確認（既存があれば追記）。

---

## Task 1: core コーディネータ `quick-search.ts`

**Files:**

- Create: `src/core/jump/quick-search.ts`
- Test: `src/core/jump/quick-search.test.ts`
- Modify: `src/core/jump/index.ts`

**Interfaces:**

- Consumes:
  - `resolveReferenceInput(input: string, options?: { resolver?: AliasResolver }): ReferenceResolution | undefined`（`./candidate-resolver`）。
  - `ReferenceResolution = { status: "resolved"; candidates: Readonly<LawReferenceCandidate>[] } | { status: "unresolved"; reason: UnresolvedReason; parsed: ParsedReference }`。
  - `LawReferenceCandidate = { lawId: string; lawTitle: string; score: number; reason: string[]; article?: string; paragraph?: string; item?: string }`（`@/core/domain`）。
  - `CatalogSearchService.search(query: string, options?: { online?: boolean; limit?: number }): Promise<{ hits: LawCatalogHit[]; source: "online" | "cache" }>`（`@/core/search`）。
  - `LawCatalogHit = { lawId: string; title: string; lawNumber?: string; matchedField: "name" | "number" | "alias" }`。
- Produces:
  - `QuickSearchCandidate = { kind: "reference" | "catalog"; lawId: string; lawTitle: string; article?: string; paragraph?: string; item?: string; reason: string[]; score: number }`
  - `QuickSearchOutcome = { status: "candidates"; candidates: QuickSearchCandidate[]; autoJump: boolean } | { status: "unresolved"; reason: UnresolvedReason; parsed: ParsedReference } | { status: "empty" }`
  - `createQuickSearch(deps: { catalog: CatalogSearchService; resolver?: AliasResolver }): QuickSearch`
  - `QuickSearch = { search(query: string, options?: { limit?: number; online?: boolean }): Promise<QuickSearchOutcome> }`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/jump/quick-search.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { CatalogSearchResult, CatalogSearchService, LawCatalogHit } from "@/core/search";

import { createQuickSearch } from "./quick-search";

// カタログはネットワーク層。テストではモックを注入する。
const createCatalogStub = (hits: LawCatalogHit[]): CatalogSearchService => ({
  search: vi.fn(async (): Promise<CatalogSearchResult> => ({ hits, source: "cache" })),
});

const catalogHit = (overrides: Partial<LawCatalogHit> = {}): LawCatalogHit => ({
  lawId: "129AC0000000089",
  title: "民法",
  lawNumber: "明治二十九年法律第八十九号",
  matchedField: "name",
  ...overrides,
});

describe("createQuickSearch", () => {
  it("空クエリは empty を返す", async () => {
    const quickSearch = createQuickSearch({ catalog: createCatalogStub([]) });

    await expect(quickSearch.search("   ")).resolves.toEqual({ status: "empty" });
  });

  it("単一の具体参照は autoJump 付きで返し、カタログ検索を呼ばない", async () => {
    const catalog = createCatalogStub([catalogHit()]);
    const quickSearch = createQuickSearch({ catalog });

    const outcome = await quickSearch.search("民709");

    expect(outcome.status).toBe("candidates");
    if (outcome.status !== "candidates") return;
    expect(outcome.autoJump).toBe(true);
    expect(outcome.candidates).toHaveLength(1);
    expect(outcome.candidates[0]).toMatchObject({
      kind: "reference",
      lawId: "129AC0000000089",
      article: "709",
    });
    // autoJump 確定時はネットワークを叩かない
    expect(catalog.search).not.toHaveBeenCalled();
  });

  it("法令名のみ（条なし）は autoJump せず、カタログ候補と併記する", async () => {
    const catalog = createCatalogStub([catalogHit({ matchedField: "name" })]);
    const quickSearch = createQuickSearch({ catalog });

    const outcome = await quickSearch.search("民法");

    expect(outcome.status).toBe("candidates");
    if (outcome.status !== "candidates") return;
    expect(outcome.autoJump).toBe(false);
    // 参照（民法・法令レベル）が上位、同一 lawId のカタログ重複は除去される
    expect(outcome.candidates.map((candidate) => candidate.kind)).toEqual(["reference"]);
    expect(outcome.candidates[0].article).toBeUndefined();
  });

  it("相対参照は unresolved(needs-context) を返す", async () => {
    const quickSearch = createQuickSearch({ catalog: createCatalogStub([]) });

    const outcome = await quickSearch.search("前条");

    expect(outcome).toMatchObject({ status: "unresolved", reason: "needs-context" });
  });

  it("辞書外の絶対参照でもカタログ該当があればカタログ候補を返す", async () => {
    const catalog = createCatalogStub([
      catalogHit({ lawId: "347AC0000000057", title: "銀行法", matchedField: "name" }),
    ]);
    const quickSearch = createQuickSearch({ catalog });

    const outcome = await quickSearch.search("銀行法");

    expect(outcome.status).toBe("candidates");
    if (outcome.status !== "candidates") return;
    expect(outcome.candidates[0]).toMatchObject({ kind: "catalog", lawId: "347AC0000000057" });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run src/core/jump/quick-search.test.ts`
Expected: FAIL（`createQuickSearch` が未定義）

- [ ] **Step 3: 最小実装を書く**

`src/core/jump/quick-search.ts`:

```ts
import type { LawReferenceCandidate } from "@/core/domain";
import type { CatalogSearchService, LawCatalogHit } from "@/core/search";

import type { AliasResolver } from "./alias-resolver";
import { resolveReferenceInput } from "./candidate-resolver";
import type { ParsedReference } from "./reference-parser";
import type { UnresolvedReason } from "./candidate-resolver";

export type QuickSearchCandidateKind = "reference" | "catalog";

export interface QuickSearchCandidate {
  kind: QuickSearchCandidateKind;
  lawId: string;
  lawTitle: string;
  article?: string;
  paragraph?: string;
  item?: string;
  // 確認 UI 向けの根拠文言（「正式名称『民法』に一致」など）。
  reason: string[];
  score: number;
}

export type QuickSearchOutcome =
  | { status: "candidates"; candidates: QuickSearchCandidate[]; autoJump: boolean }
  | { status: "unresolved"; reason: UnresolvedReason; parsed: ParsedReference }
  | { status: "empty" };

export interface QuickSearchOptions {
  limit?: number;
  online?: boolean;
}

export interface QuickSearch {
  search(query: string, options?: QuickSearchOptions): Promise<QuickSearchOutcome>;
}

export interface QuickSearchDependencies {
  catalog: CatalogSearchService;
  resolver?: AliasResolver;
}

// 具体的な条番号を持つ単一参照だけを直接ジャンプ対象にする下限。
// 絶対参照＋条番号は 0.75 以上、法令名のみは 0.55 以下（reference-parser の scoreReference）。
const AUTO_JUMP_THRESHOLD = 0.7;

// カタログ候補は service が返す順（略称優先）を保つ。順位付けはこの一定値では行わない。
const CATALOG_CANDIDATE_SCORE = 0.3;

const toReferenceCandidate = (
  candidate: Readonly<LawReferenceCandidate>,
): QuickSearchCandidate => ({
  kind: "reference",
  lawId: candidate.lawId,
  lawTitle: candidate.lawTitle,
  reason: candidate.reason,
  score: candidate.score,
  ...(candidate.article === undefined ? {} : { article: candidate.article }),
  ...(candidate.paragraph === undefined ? {} : { paragraph: candidate.paragraph }),
  ...(candidate.item === undefined ? {} : { item: candidate.item }),
});

const buildCatalogReason = (hit: LawCatalogHit): string[] => {
  switch (hit.matchedField) {
    case "name":
      return [`法令名『${hit.title}』に一致`];
    case "alias":
      return ["略称に一致"];
    case "number":
      return [`法令番号『${hit.lawNumber ?? ""}』に一致`];
  }
};

const toCatalogCandidate = (hit: LawCatalogHit): QuickSearchCandidate => ({
  kind: "catalog",
  lawId: hit.lawId,
  lawTitle: hit.title,
  reason: buildCatalogReason(hit),
  score: CATALOG_CANDIDATE_SCORE,
});

// 具体的な条番号を持ち、閾値以上の単一参照候補か。
const isAutoJumpCandidate = (candidate: QuickSearchCandidate): boolean =>
  candidate.article !== undefined && candidate.score >= AUTO_JUMP_THRESHOLD;

export const createQuickSearch = (dependencies: QuickSearchDependencies): QuickSearch => {
  const { catalog, resolver } = dependencies;

  return {
    async search(query, options = {}) {
      const trimmed = query.trim();

      if (trimmed === "") {
        return { status: "empty" };
      }

      const resolution = resolveReferenceInput(trimmed, { resolver });
      const referenceCandidates =
        resolution?.status === "resolved" ? resolution.candidates.map(toReferenceCandidate) : [];

      // 具体条番号の単一参照は確定ジャンプ。カタログ（ネットワーク）を省く。
      if (referenceCandidates.length === 1 && isAutoJumpCandidate(referenceCandidates[0])) {
        return { status: "candidates", candidates: referenceCandidates, autoJump: true };
      }

      const catalogResult = await catalog.search(trimmed, {
        online: options.online,
        limit: options.limit,
      });

      // 参照候補と同一 lawId のカタログ重複は落とす（同じ法令を二重表示しない）。
      const referenceLawIds = new Set(referenceCandidates.map((candidate) => candidate.lawId));
      const catalogCandidates = catalogResult.hits
        .filter((hit) => !referenceLawIds.has(hit.lawId))
        .map(toCatalogCandidate);

      const candidates = [...referenceCandidates, ...catalogCandidates];

      if (candidates.length === 0 && resolution?.status === "unresolved") {
        return { status: "unresolved", reason: resolution.reason, parsed: resolution.parsed };
      }

      return { status: "candidates", candidates, autoJump: false };
    },
  };
};
```

- [ ] **Step 4: 公開エクスポートを追加**

`src/core/jump/index.ts` の末尾に追記:

```ts
export { createQuickSearch } from "./quick-search";
export type {
  QuickSearch,
  QuickSearchCandidate,
  QuickSearchCandidateKind,
  QuickSearchDependencies,
  QuickSearchOptions,
  QuickSearchOutcome,
} from "./quick-search";
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm exec vitest run src/core/jump/quick-search.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 6: 検証ゲートを実行**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: すべて PASS

- [ ] **Step 7: コミット**

```bash
git add src/core/jump/quick-search.ts src/core/jump/quick-search.test.ts src/core/jump/index.ts
git commit -m "feat(jump): query 分類と統合候補の coordinator を追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: app 遷移写像 `search-navigation.ts`

**Files:**

- Create: `src/app/search-navigation.ts`
- Test: `src/app/search-navigation.test.ts`

**Interfaces:**

- Consumes: `QuickSearchCandidate`（Task 1、`@/core/jump`）。
- Produces:
  - `SearchNavigationTarget = { to: "/laws/$lawId"; params: { lawId: string } } | { to: "/laws/$lawId/articles/$article"; params: { lawId: string; article: string } }`
  - `toNavigationTarget(candidate: Pick<QuickSearchCandidate, "lawId" | "article">): SearchNavigationTarget`
  - `navigateToCandidate(navigate, candidate, options?): void` — 候補への命令的遷移を 1 箇所に集約（TanStack の union 型ナローイングをここだけに閉じ込め、Task 4/5 の重複を避ける）。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/search-navigation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { toNavigationTarget } from "./search-navigation";

describe("toNavigationTarget", () => {
  it("条番号があれば条文ルートへ写像する", () => {
    expect(toNavigationTarget({ lawId: "129AC0000000089", article: "709" })).toEqual({
      to: "/laws/$lawId/articles/$article",
      params: { lawId: "129AC0000000089", article: "709" },
    });
  });

  it("条番号がなければ法令トップへ写像する", () => {
    expect(toNavigationTarget({ lawId: "129AC0000000089" })).toEqual({
      to: "/laws/$lawId",
      params: { lawId: "129AC0000000089" },
    });
  });

  it("navigateToCandidate は条文候補を条文ルートへ navigate する", () => {
    const navigate = vi.fn();
    navigateToCandidate(navigate, { lawId: "129AC0000000089", article: "709" }, { replace: true });

    expect(navigate).toHaveBeenCalledWith({
      to: "/laws/$lawId/articles/$article",
      params: { lawId: "129AC0000000089", article: "709" },
      replace: true,
    });
  });
});
```

> `vi` を `vitest` から import する（`import { describe, expect, it, vi } from "vitest";`）。`navigate` は最小の `vi.fn()` スタブで、`navigateToCandidate` が正しい引数で呼ぶことだけを見る。

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run src/app/search-navigation.test.ts`
Expected: FAIL（`toNavigationTarget` が未定義）

- [ ] **Step 3: 最小実装を書く**

`src/app/search-navigation.ts`:

```ts
import type { useNavigate } from "@tanstack/react-router";

import type { QuickSearchCandidate } from "@/core/jump";

// core を route 非依存に保つため、候補 → ルート遷移の写像は app 層に置く。
export type SearchNavigationTarget =
  | { to: "/laws/$lawId"; params: { lawId: string } }
  | { to: "/laws/$lawId/articles/$article"; params: { lawId: string; article: string } };

export const toNavigationTarget = (
  candidate: Pick<QuickSearchCandidate, "lawId" | "article">,
): SearchNavigationTarget =>
  candidate.article === undefined
    ? { to: "/laws/$lawId", params: { lawId: candidate.lawId } }
    : {
        to: "/laws/$lawId/articles/$article",
        params: { lawId: candidate.lawId, article: candidate.article },
      };

// 候補への命令的遷移。TanStack の Link/navigate は union の `to` を素直に受けないため、
// リテラルで分岐して params 型を一致させる。この型ナローイングをここ 1 箇所に閉じ込める。
export const navigateToCandidate = (
  navigate: ReturnType<typeof useNavigate>,
  candidate: Pick<QuickSearchCandidate, "lawId" | "article">,
  options: { replace?: boolean } = {},
): void => {
  const target = toNavigationTarget(candidate);

  if (target.to === "/laws/$lawId") {
    void navigate({ to: target.to, params: target.params, replace: options.replace });
  } else {
    void navigate({ to: target.to, params: target.params, replace: options.replace });
  }
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm exec vitest run src/app/search-navigation.test.ts`
Expected: PASS

- [ ] **Step 5: 検証ゲート**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/app/search-navigation.ts src/app/search-navigation.test.ts
git commit -m "feat(app): 検索候補からルート遷移先への写像を追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: パレット開閉 Context と AppShell 配線

パレットの開閉状態を Context に持ち上げ、ホーム・ヘッダの双方から開けるようにする。この Task では**挙動は変えず**、`SearchPalette` のローカル state を Context へ移すリファクタに留める。あわせて `createAppRouter` に `quickSearch` 注入口を用意する（Task 4/5 で使う）。

**Files:**

- Create: `src/app/search-palette-context.tsx`
- Create: `src/app/quick-search.ts`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/app/SearchPalette.tsx`
- Modify: `src/app/router.tsx`

**Interfaces:**

- Produces:
  - `SearchPaletteProvider: (props: { children: React.ReactNode }) => React.ReactElement`
  - `useSearchPalette(): { isOpen: boolean; setOpen: (open: boolean) => void; open: () => void }`
  - `defaultQuickSearch: QuickSearch`（`src/app/quick-search.ts`）
  - `AppShell` は `quickSearch?: QuickSearch` を受け取る（既定 `defaultQuickSearch`）。
  - `createAppRouter` / `createRouteTree` は `quickSearch?: QuickSearch` を受け取る。

- [ ] **Step 1: Context を作る**

`src/app/search-palette-context.tsx`:

```tsx
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";

interface SearchPaletteContextValue {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  open: () => void;
}

// Provider が無い場所（単体テストの一部）でも壊れないよう no-op 既定を持たせる。
const SearchPaletteContext = createContext<SearchPaletteContextValue>({
  isOpen: false,
  setOpen: () => {},
  open: () => {},
});

export const SearchPaletteProvider = ({ children }: { children: ReactNode }): ReactElement => {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo<SearchPaletteContextValue>(
    () => ({ isOpen, setOpen, open: () => setOpen(true) }),
    [isOpen],
  );

  return <SearchPaletteContext.Provider value={value}>{children}</SearchPaletteContext.Provider>;
};

export const useSearchPalette = (): SearchPaletteContextValue => useContext(SearchPaletteContext);
```

- [ ] **Step 2: 既定 QuickSearch シングルトンを作る**

`src/app/quick-search.ts`:

```ts
import { createEgovLawRepository } from "@/core/egov";
import { createQuickSearch } from "@/core/jump";
import type { QuickSearch } from "@/core/jump";
import { createCatalogSearchService, createSearchIndexRepository } from "@/core/search";

// app 既定の QuickSearch。カタログはオンライン優先で e-Gov に委譲し、結果を索引へキャッシュする。
export const defaultQuickSearch: QuickSearch = createQuickSearch({
  catalog: createCatalogSearchService({
    lawRepository: createEgovLawRepository(),
    indexRepository: createSearchIndexRepository(),
  }),
});
```

- [ ] **Step 3: `SearchPalette` の開閉を Context 化する**

`src/app/SearchPalette.tsx` を変更する。`useState` による `isOpen` を削除し、Context を使う。`quickSearch` prop も受け取れるようにする（Task 4 で使用、この Task では未使用でよいが型を通す）。

先頭付近の import と signature:

```tsx
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Camera, GraduationCap, Search, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { QuickSearch } from "@/core/jump";
import { Button } from "@/shared/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";

import { useSearchPalette } from "./search-palette-context";
import type { PrimaryRoute } from "./routes";
import { defaultQuickSearch } from "./quick-search";
```

コンポーネント本体の state を Context 参照に置換する:

```tsx
export const SearchPalette = ({
  quickSearch = defaultQuickSearch,
}: {
  quickSearch?: QuickSearch;
}) => {
  const { isOpen, setOpen } = useSearchPalette();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "/" ||
        event.defaultPrevented ||
        isEditableTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing
      ) {
        return;
      }

      event.preventDefault();
      setOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [setOpen]);

  const navigateTo = (to: PaletteDestination["to"]) => {
    setOpen(false);
    void navigate({ to });
  };

  // 以降の JSX は既存のまま。onClick={() => setOpen(true)}、onOpenChange={setOpen}、open={isOpen} に置換する。
  // quickSearch はこの Task では未使用（Task 4 で使う）。ESLint 未使用回避のため Task 4 まで prop を受けるだけにする。
  // ...
};
```

> 注: この Task で `quickSearch` を受けるが使わないと lint（未使用）に触れる可能性がある。触れる場合は Task 3 では `quickSearch` prop を**追加せず**、Task 4 の Step でまとめて追加する。判断は実装者に委ねるが、挙動非変更を優先する。

- [ ] **Step 4: `AppShell` を Provider で包み、`quickSearch` を渡す**

`src/app/AppShell.tsx`:

- import に `SearchPaletteProvider` と `QuickSearch` 型、`defaultQuickSearch` を追加。
- `Header` が `SearchPalette` を描画している箇所へ `quickSearch` を渡す（Header に prop 追加、または AppShell 内でインライン化）。
- `AppShell` を関数コンポーネント化して `quickSearch` prop を受け、全体を `SearchPaletteProvider` で包む。

```tsx
export const AppShell = ({ quickSearch = defaultQuickSearch }: { quickSearch?: QuickSearch }) => (
  <SearchPaletteProvider>
    <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
      <Header quickSearch={quickSearch} />
      <main aria-label="メインコンテンツ" className="min-w-0 flex-1">
        <Outlet />
      </main>
      <Footer />
      <MobileNavigation />
      <PwaUpdatePrompt />
    </div>
  </SearchPaletteProvider>
);
```

`Header` は `quickSearch` を受けて `<SearchPalette quickSearch={quickSearch} />` を描画するよう変更する。

- [ ] **Step 5: `router.tsx` に `quickSearch` 注入口を追加**

`src/app/router.tsx`:

- `CreateAppRouterOptions` に `quickSearch?: QuickSearch` を追加。
- `createRouteTree` の引数に `quickSearch` を追加。
- root route を closure 化して `quickSearch` を `AppShell` へ渡す:

```tsx
const RootComponent = () => <AppShell quickSearch={quickSearch} />;

const rootRoute = createRootRoute({
  component: RootComponent,
});
```

- `createAppRouter` から `createRouteTree({ lawRepository, storageRepository, quickSearch })` へ受け渡す。

- [ ] **Step 6: 既存テストが緑のままか確認**

Run: `pnpm exec vitest run src/app/SearchPalette.test.tsx src/app/router.test.tsx`
Expected: PASS（開閉挙動は不変）

- [ ] **Step 7: 検証ゲート**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add src/app/search-palette-context.tsx src/app/quick-search.ts src/app/AppShell.tsx src/app/SearchPalette.tsx src/app/router.tsx
git commit -m "refactor(app): パレット開閉状態を Context へ持ち上げる

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: `SearchPalette` のライブ候補表示

**Files:**

- Modify: `src/shared/ui/command.tsx`（`CommandDialog` に `shouldFilter` 透過を追加）
- Modify: `src/app/SearchPalette.tsx`
- Modify: `src/app/SearchPalette.test.tsx`

**Interfaces:**

- Consumes: `QuickSearch`（Task 1）、`toNavigationTarget`（Task 2）、`useSearchPalette`（Task 3）。
- Produces: パレットが query に応じて候補（reference/catalog）を列挙し、選択で遷移、末尾に「『{q}』で検索」で `/search?q=` へ遷移する。

> **前提: cmdk の内部フィルタを無効化する。** `CommandDialog` の `...props` は内側の `Command` ではなく `Dialog` へ流れる（`src/shared/ui/command.tsx` 確認済み）。非同期で得た候補を cmdk が入力文字列で再フィルタして消さないよう、`CommandDialog` に `shouldFilter` を内側 `Command` へ透過する小改修を最初に行う。

- [ ] **Step 1: 失敗するテストへ更新**

`src/app/SearchPalette.test.tsx` の 3 つ目のテスト（"shows a placeholder message..."）を、候補表示の期待へ置き換える。`renderShell` に `quickSearch` を注入できるよう拡張する:

```tsx
import { createQuickSearch } from "@/core/jump";
import type { CatalogSearchResult, CatalogSearchService } from "@/core/search";

const emptyCatalog: CatalogSearchService = {
  search: async (): Promise<CatalogSearchResult> => ({ hits: [], source: "cache" }),
};

const renderShell = async (initialEntry = "/laws") => {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const storageRepository = createMemoryStorageRepository().repository;
  const quickSearch = createQuickSearch({ catalog: emptyCatalog });

  render(<RouterProvider router={createAppRouter({ history, storageRepository, quickSearch })} />);
  await screen.findByRole("banner");

  return { history };
};
```

置き換えるテスト:

```tsx
it("resolves a concrete reference query into a jump candidate", async () => {
  const user = userEvent.setup();
  const { history } = await renderShell();

  await user.keyboard("/");
  await user.type(screen.getByPlaceholderText("国賠法1条、民709、行政手続法14条…"), "国賠1");

  const option = await screen.findByRole("option", { name: /国家賠償法/ });
  await user.click(option);

  await waitFor(() => {
    // 国家賠償法 lawId は src/core/jump/alias-dictionary.ts で確認済み。
    expect(history.location.pathname).toBe("/laws/322AC0000000125/articles/1");
  });
});

it("offers a full search entry that navigates to /search", async () => {
  const user = userEvent.setup();
  const { history } = await renderShell();

  await user.keyboard("/");
  await user.type(screen.getByPlaceholderText("国賠法1条、民709、行政手続法14条…"), "民法");

  await user.click(await screen.findByRole("option", { name: /「民法」で検索/ }));

  await waitFor(() => {
    expect(history.location.pathname).toBe("/search");
    expect(history.location.search).toContain("q=");
  });
});
```

> 国家賠償法 lawId `322AC0000000125`・民法 lawId `129AC0000000089` は `src/core/jump/alias-dictionary.ts` で確認済み。

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run src/app/SearchPalette.test.tsx`
Expected: FAIL（候補 option が無い）

- [ ] **Step 3: ライブ候補を実装**

`src/app/SearchPalette.tsx` に query state・`useDeferredValue`・検索実行 effect・候補描画を追加する。

import 追加:

```tsx
import { useDeferredValue, useEffect, useState } from "react";

import type { QuickSearch, QuickSearchCandidate, QuickSearchOutcome } from "@/core/jump";

import { navigateToCandidate } from "./search-navigation";
```

コンポーネント内:

```tsx
const [query, setQuery] = useState("");
const deferredQuery = useDeferredValue(query);
const [outcome, setOutcome] = useState<QuickSearchOutcome>({ status: "empty" });

useEffect(() => {
  const trimmed = deferredQuery.trim();
  if (trimmed === "") {
    setOutcome({ status: "empty" });
    return;
  }

  let cancelled = false;
  void quickSearch.search(trimmed).then((next) => {
    if (!cancelled) {
      setOutcome(next);
    }
  });

  return () => {
    cancelled = true;
  };
}, [deferredQuery, quickSearch]);

// パレットを閉じるときは入力を空へ戻す。
const handleOpenChange = (open: boolean) => {
  setOpen(open);
  if (!open) {
    setQuery("");
  }
};

const goToCandidate = (candidate: QuickSearchCandidate) => {
  setOpen(false);
  setQuery("");
  navigateToCandidate(navigate, candidate);
};

const goToSearchPage = () => {
  const trimmed = query.trim();
  setOpen(false);
  setQuery("");
  void navigate({ to: "/search", search: { q: trimmed } });
};
```

`CommandDialog` の JSX を候補対応へ:

```tsx
<CommandDialog
  description="法令名や条文参照から目的の条文を開きます"
  onOpenChange={handleOpenChange}
  open={isOpen}
  title="検索"
  shouldFilter={false}
>
  <CommandInput
    placeholder="国賠法1条、民709、行政手続法14条…"
    value={query}
    onValueChange={setQuery}
  />
  <CommandList>
    {query.trim() === "" ? (
      <CommandGroup heading="移動">
        {destinations.map((destination) => (
          <CommandItem
            key={destination.to}
            onSelect={() => {
              navigateTo(destination.to);
            }}
          >
            <destination.icon aria-hidden="true" />
            {destination.label}
          </CommandItem>
        ))}
      </CommandGroup>
    ) : (
      <>
        {outcome.status === "candidates" && outcome.candidates.length > 0 ? (
          <CommandGroup heading="候補">
            {outcome.candidates.map((candidate) => (
              <CommandItem
                key={`${candidate.kind}:${candidate.lawId}:${candidate.article ?? ""}`}
                value={`${candidate.lawTitle} ${candidate.article ?? ""} ${candidate.lawId}`}
                onSelect={() => {
                  goToCandidate(candidate);
                }}
              >
                <span className="grid min-w-0">
                  <span className="truncate">
                    {candidate.lawTitle}
                    {candidate.article !== undefined ? ` 第${candidate.article}条` : ""}
                  </span>
                  {candidate.reason.length > 0 ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {candidate.reason.join(" / ")}
                    </span>
                  ) : null}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {outcome.status === "unresolved" ? (
          <CommandEmpty>
            {outcome.reason === "needs-context"
              ? "相対参照は前後の文脈が必要です。法令名を含めて入力してください。"
              : "該当する法令が見つかりませんでした。"}
          </CommandEmpty>
        ) : null}
        {outcome.status === "candidates" && outcome.candidates.length === 0 ? (
          <CommandEmpty>該当する候補がありません。</CommandEmpty>
        ) : null}
        <CommandGroup>
          <CommandItem
            value="__full_search__"
            onSelect={() => {
              goToSearchPage();
            }}
          >
            <Search aria-hidden="true" />「{query.trim()}」で検索
          </CommandItem>
        </CommandGroup>
      </>
    )}
  </CommandList>
</CommandDialog>
```

**cmdk 内部フィルタ無効化のため `src/shared/ui/command.tsx` を先に改修する。** `CommandDialog` に `shouldFilter` を受け取り、内側 `Command` へ透過する:

```tsx
function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  shouldFilter,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  // cmdk の内部フィルタ切替。候補を上位で絞る場合に false を渡す。
  shouldFilter?: boolean;
}) {
  return (
    <Dialog {...props}>
      {/* ...DialogHeader は既存のまま... */}
      <DialogContent /* ...既存... */>
        <Command
          shouldFilter={shouldFilter}
          className="/* ...既存の className をそのまま維持... */"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}
```

既存の `className` 文字列・`DialogHeader`・`DialogContent` は一切変えず、`shouldFilter` の受け渡しだけを足す。既存コメントは削除しない。

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm exec vitest run src/app/SearchPalette.test.tsx`
Expected: PASS

- [ ] **Step 5: 検証ゲート**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/shared/ui/command.tsx src/app/SearchPalette.tsx src/app/SearchPalette.test.tsx
git commit -m "feat(app): 検索パレットに参照・法令の候補表示を追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: `/search` ルートと候補画面

**Files:**

- Create: `src/app/search-page.tsx`
- Create: `src/app/search-page.test.tsx`
- Modify: `src/app/router.tsx`

**Interfaces:**

- Consumes: `QuickSearch`（Task 1）、`toNavigationTarget`（Task 2）、`defaultQuickSearch`（Task 3）。
- Produces:
  - `SearchPage: (props: { quickSearch?: QuickSearch }) => React.ReactElement`
  - `/search` ルート（`validateSearch` で `{ q?: string }`）。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/search-page.test.tsx`（law-viewer-page.test.tsx のルータ組み立てを参考に、`/search` 単独ルータで描画）:

```tsx
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createQuickSearch } from "@/core/jump";
import type { CatalogSearchResult, CatalogSearchService } from "@/core/search";

import { SearchPage } from "./search-page";

const emptyCatalog: CatalogSearchService = {
  search: async (): Promise<CatalogSearchResult> => ({ hits: [], source: "cache" }),
};

const renderSearch = async (q: string) => {
  const quickSearch = createQuickSearch({ catalog: emptyCatalog });
  const rootRoute = createRootRoute();
  const searchRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "search",
    validateSearch: (search: Record<string, unknown>): { q?: string } => ({
      q: typeof search.q === "string" ? search.q : undefined,
    }),
    component: () => <SearchPage quickSearch={quickSearch} />,
  });
  const lawRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws/$lawId/articles/$article",
    component: () => <div>article page</div>,
  });
  const history = createMemoryHistory({ initialEntries: [`/search?q=${encodeURIComponent(q)}`] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([searchRoute, lawRoute]),
    history,
  });

  render(<RouterProvider router={router} />);
  return { history, router };
};

describe("SearchPage", () => {
  it("単一の確定参照は該当条文へ自動遷移する", async () => {
    const { history } = await renderSearch("民709");

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/709");
    });
  });

  it("相対参照は文脈が必要である旨を表示する", async () => {
    await renderSearch("前条");

    expect(await screen.findByText(/前後の文脈が必要/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run src/app/search-page.test.tsx`
Expected: FAIL（`SearchPage` 未定義）

- [ ] **Step 3: `SearchPage` を実装**

`src/app/search-page.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import type { QuickSearch, QuickSearchCandidate, QuickSearchOutcome } from "@/core/jump";

import { defaultQuickSearch } from "./quick-search";
import { navigateToCandidate, toNavigationTarget } from "./search-navigation";

const candidateLinkClassName = "grid gap-1 rounded-md border p-4 hover:bg-accent";

const CandidateLink = ({ candidate }: { candidate: QuickSearchCandidate }) => {
  const target = toNavigationTarget(candidate);
  const label = `${candidate.lawTitle}${candidate.article !== undefined ? ` 第${candidate.article}条` : ""}`;
  // className と内容は 1 度だけ組み立て、Link ラッパーだけリテラル to で分岐する。
  const content = (
    <>
      <span className="font-serif font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{candidate.reason.join(" / ")}</span>
    </>
  );

  return target.to === "/laws/$lawId" ? (
    <Link className={candidateLinkClassName} to={target.to} params={target.params}>
      {content}
    </Link>
  ) : (
    <Link className={candidateLinkClassName} to={target.to} params={target.params}>
      {content}
    </Link>
  );
};

export const SearchPage = ({ quickSearch = defaultQuickSearch }: { quickSearch?: QuickSearch }) => {
  const { q } = useSearch({ from: "/search" });
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<QuickSearchOutcome>({ status: "empty" });

  useEffect(() => {
    const trimmed = (q ?? "").trim();
    if (trimmed === "") {
      setOutcome({ status: "empty" });
      return;
    }

    let cancelled = false;
    void quickSearch.search(trimmed).then((next) => {
      if (!cancelled) {
        setOutcome(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [q, quickSearch]);

  // 単一の確定候補はページを挟まず該当条文へ置換遷移する。
  useEffect(() => {
    if (outcome.status !== "candidates" || !outcome.autoJump || outcome.candidates.length !== 1) {
      return;
    }

    navigateToCandidate(navigate, outcome.candidates[0], { replace: true });
  }, [outcome, navigate]);

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6 px-5 py-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-xl font-semibold">検索</h1>
        {q !== undefined && q.trim() !== "" ? (
          <p className="text-sm text-muted-foreground">「{q}」の結果</p>
        ) : null}
      </header>

      {outcome.status === "empty" ? (
        <p className="text-sm text-muted-foreground">
          法令名や条文参照（民709、国賠法1条 など）を入力してください。
        </p>
      ) : null}

      {outcome.status === "unresolved" ? (
        <p
          role="status"
          className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground"
        >
          {outcome.reason === "needs-context"
            ? "相対参照は前後の文脈が必要です。法令名を含めて入力してください。"
            : "該当する法令が見つかりませんでした。"}
        </p>
      ) : null}

      {outcome.status === "candidates" && outcome.candidates.length > 0 ? (
        <ul className="grid gap-3">
          {outcome.candidates.map((candidate) => (
            <li key={`${candidate.kind}:${candidate.lawId}:${candidate.article ?? ""}`}>
              <CandidateLink candidate={candidate} />
            </li>
          ))}
        </ul>
      ) : null}

      {outcome.status === "candidates" && outcome.candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">該当する候補がありません。</p>
      ) : null}
    </section>
  );
};
```

- [ ] **Step 4: `/search` ルートを配線**

`src/app/router.tsx`:

- `SearchPage` を import。
- route を追加:

```tsx
const SearchRoute = () => <SearchPage quickSearch={quickSearch} />;

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "search",
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: SearchRoute,
});
```

- `rootRoute.addChildren([...])` に `searchRoute` を追加。

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm exec vitest run src/app/search-page.test.tsx`
Expected: PASS

- [ ] **Step 6: 検証ゲート**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/app/search-page.tsx src/app/search-page.test.tsx src/app/router.tsx
git commit -m "feat(app): /search 候補画面ルートを追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: ホーム検索バーからパレットを開く

**Files:**

- Modify: `src/app/home-page.tsx`
- Modify: `src/app/home-page.test.tsx`

**Interfaces:**

- Consumes: `useSearchPalette`（Task 3）。
- Produces: ホームの検索バーがクリックでパレットを開く（`/laws` リンクを廃止）。

- [ ] **Step 1: 失敗するテストを書く／更新する**

`src/app/home-page.test.tsx` に、検索バーがパレットを開くテストを追加する。`SearchPaletteProvider` と、開いたことを観測するための小さな消費コンポーネントで包む:

```tsx
import { SearchPaletteProvider, useSearchPalette } from "./search-palette-context";

const OpenStateProbe = () => {
  const { isOpen } = useSearchPalette();
  return <div data-testid="palette-open">{isOpen ? "open" : "closed"}</div>;
};

it("検索バーをクリックするとパレットが開く", async () => {
  const user = userEvent.setup();
  const storageRepository = createMemoryStorageRepository().repository;

  render(
    <SearchPaletteProvider>
      <OpenStateProbe />
      <HomePage storageRepository={storageRepository} />
    </SearchPaletteProvider>,
  );

  await user.click(screen.getByRole("button", { name: /検索/ }));

  expect(screen.getByTestId("palette-open")).toHaveTextContent("open");
});
```

> `HomePage` を直接描画するので、ルータ不要。既存の home-page.test.tsx の import（`render`/`screen`/`userEvent`/`createMemoryStorageRepository`）を流用する。無ければ追加する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm exec vitest run src/app/home-page.test.tsx`
Expected: FAIL（検索バーがボタンでなくリンクのまま／open にならない）

- [ ] **Step 3: 検索バーをパレット起動ボタンへ置換**

`src/app/home-page.tsx`:

- `useSearchPalette` を import。
- 現在の検索バー（`<Button asChild variant="outline" ...><Link to="/laws">...</Link></Button>`）を、`open()` を呼ぶボタンへ置換する:

```tsx
const { open } = useSearchPalette();

// ...

<Button
  type="button"
  variant="outline"
  className="h-11 w-full max-w-md justify-start gap-2"
  onClick={open}
>
  <span className="sr-only">検索</span>
  <Search className="size-4 text-muted-foreground" aria-hidden="true" />
  <span className="truncate text-muted-foreground">国賠法1条、民709、行政手続法14条…</span>
</Button>;
```

- 未使用になった `Link` import は、他で使っていれば残し、この箇所専用だったなら整理する（保存済み法令リンク等で使用中なので `Link` は残す想定）。

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm exec vitest run src/app/home-page.test.tsx`
Expected: PASS

- [ ] **Step 5: 検証ゲート（全体）**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test`
Expected: すべて PASS

- [ ] **Step 6: コミット**

```bash
git add src/app/home-page.tsx src/app/home-page.test.tsx
git commit -m "feat(app): ホーム検索バーから検索パレットを開く

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: 実画面確認（Playwright）と仕上げ

**Files:** なし（検証のみ）

- [ ] **Step 1: dev サーバを起動**

Run: `pnpm dev`（バックグラウンド）

- [ ] **Step 2: playwright-cli で導線を確認**

`playwright-cli open --headed` でセッションを確立し、以下を確認する（memory: playwright-cli-quirks に留意）:

1. ホームの検索バーをクリック → パレットが開く。
2. `民709` と入力 → 「民法 第709条」候補が出る → 選択 → `/laws/129AC0000000089/articles/709` へ遷移。
3. `/` キーでパレットが開く。
4. `前条` と入力 → 「前後の文脈が必要」メッセージ。
5. `/search?q=民法` を直接開く → 候補一覧が表示される。
6. デスクトップ幅・モバイル幅の両方でレイアウト崩れ・はみ出しが無い。

- [ ] **Step 3: スクリーンショットを撮る**

各確認について full-page ではなくビューポート単位で撮影（memory の癖に従う）。`/tmp/claude-.../scratchpad` へ保存。

- [ ] **Step 4: Antigravity review**

Run: `pnpm run review:antigravity`
`agy` が使えない環境では skip されるため、その旨と（出力があれば）クォータ/使用量/残量を最終報告に記録する。指摘は鵜呑みにせず妥当性を検証する。

- [ ] **Step 5: Draft PR を作成**

- ブランチ `feat/issue-25-search-bar` を push。
- Draft PR を作成。本文に `Close #25`、変更概要、`github-image-upload` でスクショ添付、「動物界における比擬」セクション（グローバル規約）を含める。
- 作成後にユーザーを Assign する。

---

## Self-Review 結果

**Spec coverage（spec 各節 → 対応 task）:**

- §4 core coordinator → Task 1。
- §5 search-navigation → Task 2。
- §6 `/search` ルート・候補画面 → Task 5。
- §7 SearchPalette ライブ候補 → Task 4。
- §8 ホームバー・開閉 Context → Task 3（Context）＋ Task 6（ホームバー）。
- §9 テスト → 各 Task に TDD で内包。実画面確認 → Task 7。
- §1「OCR 再利用」→ Task 1 の coordinator が route/UI 非依存で満たす。

**Placeholder scan:** 実 lawId（国家賠償法 `322AC0000000125`・民法 `129AC0000000089`）は `alias-dictionary.ts` で確認済みの実値に確定。TBD/TODO は無し。

**Type consistency:** `QuickSearchCandidate` / `QuickSearchOutcome` / `QuickSearch` / `toNavigationTarget` / `SearchNavigationTarget` / `useSearchPalette` / `defaultQuickSearch` は全 task で同一シグネチャ。`CatalogSearchService.search` の戻り値 `CatalogSearchResult`（`{ hits; source }`）もテスト stub と一致。

**解消済みの事前確認（一次ソースで確定）:**

- 国家賠償法 lawId `322AC0000000125`・民法 lawId `129AC0000000089`（`src/core/jump/alias-dictionary.ts`）。
- `CommandDialog` の `...props` は `Dialog` へ流れ、内側 `Command` に `shouldFilter` は届かない（`src/shared/ui/command.tsx`）。→ Task 4 で `command.tsx` に `shouldFilter` 透過を追加する手順を明記済み。
- `CommandInput` は `...props` を `CommandPrimitive.Input` へ透過するため `value`/`onValueChange` は追加配線不要（`src/shared/ui/command.tsx`）。
