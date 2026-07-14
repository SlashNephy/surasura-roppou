# 学習ダッシュボード Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームと Study 画面に、今日の復習数・正答率・苦手条文・最近開いた項目を表示する学習ダッシュボードを実装する。

**Architecture:** 算出ロジックを `core/study` の純関数（`stats.ts` / `recent.ts`）に集約し、`app/use-study-dashboard.ts` が repository から取得したデータを渡して view model を組み立てる。`HomePage` と `StudyPage` が同じフックを使い、同じ数字を共有する。`core/storage` は読み取りのみで変更しない。

**Tech Stack:** React 19 / TypeScript 6 (strict) / TanStack Router / Tailwind CSS 4 / lucide-react / Vitest + Testing Library。

## Global Constraints

- 正解判定は `grade !== "again"`（again のみを lapse とみなす Anki 準拠）。
- 正答率は通算（全期間）。総回答 0 のとき `accuracy` は `undefined`（0% と区別）。
- 苦手判定の既定しきい値は `minReviews = 3`、表示上限 `limit = 5`。
- 最近開いた項目の表示上限は 5 件。
- `core/study` は `core/domain` 以外に依存しない。storage 型は import しない。
- アイコンは `lucide-react`。デスクトップ幅・モバイル幅の両方でレイアウトが崩れず、テキストがコンテナからはみ出さないこと。
- セクションに見出し・ランドマークを与え、リンクにアクセシブルな名前を付ける。
- 実装詳細の文字列探索だけで通るテストは書かない。純関数は table testing。
- コミット前に `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test` を通す。
- コミットメッセージは Conventional Commits・日本語。末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: `core/study/stats.ts` — 正答率と苦手カードの算出

**Files:**
- Create: `src/core/study/stats.ts`
- Create: `src/core/study/stats.test.ts`
- Modify: `src/core/study/index.ts`

**Interfaces:**
- Consumes: `ReviewLog`, `StudyCard`, `QuizRating` from `@/core/domain`。
- Produces:
  - `computeReviewStats(logs: readonly ReviewLog[]): ReviewStats`
  - `selectWeakCards(cards: readonly StudyCard[], logs: readonly ReviewLog[], options?: { minReviews?: number; limit?: number }): WeakCard[]`
  - `interface ReviewStats { totalReviews: number; correctReviews: number; accuracy: number | undefined }`
  - `interface WeakCard { card: StudyCard; reviews: number; correct: number; accuracy: number }`

- [ ] **Step 1: Write the failing test**

`src/core/study/stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ReviewLog, StudyCard } from "@/core/domain";

import { computeReviewStats, selectWeakCards } from "./stats";

const card = (id: string, overrides: Partial<StudyCard> = {}): StudyCard => ({
  id,
  source: "manual",
  target: { lawId: "129AC0000000089", article: id },
  type: "fill_blank",
  question: `Q${id}`,
  answer: `A${id}`,
  tags: [],
  examPinned: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

const log = (cardId: string, grade: ReviewLog["grade"]): ReviewLog => ({
  id: `${cardId}-${grade}-${Math.random()}`,
  cardId,
  grade,
  reviewedAt: "2026-07-10T00:00:00.000Z",
  scheduler: "fixed-interval@1",
});

describe("computeReviewStats", () => {
  it.each([
    { name: "回答なしは accuracy undefined", logs: [] as ReviewLog[], total: 0, correct: 0, accuracy: undefined },
    { name: "全問 again は accuracy 0", logs: [log("a", "again"), log("a", "again")], total: 2, correct: 0, accuracy: 0 },
    { name: "again 以外は正解", logs: [log("a", "hard"), log("a", "good"), log("a", "easy")], total: 3, correct: 3, accuracy: 1 },
    { name: "混在は正解率を返す", logs: [log("a", "again"), log("a", "good"), log("a", "good"), log("a", "again")], total: 4, correct: 2, accuracy: 0.5 },
  ])("$name", ({ logs, total, correct, accuracy }) => {
    const stats = computeReviewStats(logs);
    expect(stats.totalReviews).toBe(total);
    expect(stats.correctReviews).toBe(correct);
    expect(stats.accuracy).toBe(accuracy);
  });
});

describe("selectWeakCards", () => {
  it("minReviews 未満のカードを除外する", () => {
    const cards = [card("a"), card("b")];
    const logs = [log("a", "again"), log("a", "again"), log("b", "again"), log("b", "again"), log("b", "again")];
    const weak = selectWeakCards(cards, logs);
    expect(weak.map((entry) => entry.card.id)).toEqual(["b"]);
  });

  it("正答率昇順、同率なら復習回数が多い順に並べる", () => {
    const cards = [card("hi"), card("lo"), card("loMore")];
    const logs = [
      log("hi", "good"), log("hi", "good"), log("hi", "again"),
      log("lo", "again"), log("lo", "again"), log("lo", "good"),
      log("loMore", "again"), log("loMore", "again"), log("loMore", "good"), log("loMore", "good"),
    ];
    // 正答率: lo=1/3≈0.33, loMore=2/4=0.5, hi=2/3≈0.67。昇順で lo → loMore → hi。
    const weak = selectWeakCards(cards, logs, { minReviews: 3 });
    expect(weak.map((entry) => entry.card.id)).toEqual(["lo", "loMore", "hi"]);
  });

  it("同率のときは復習回数が多いカードを先に出す", () => {
    const cards = [card("few"), card("many")];
    const logs = [
      log("few", "again"), log("few", "good"), log("few", "good"),
      log("many", "again"), log("many", "again"), log("many", "good"), log("many", "good"), log("many", "good"), log("many", "good"),
    ];
    // few: 2/3≈0.667, many: 4/6≈0.667 → 同率。回数多い many を先に。
    const weak = selectWeakCards(cards, logs, { minReviews: 3 });
    expect(weak.map((entry) => entry.card.id)).toEqual(["many", "few"]);
  });

  it("対応するカードが無いログ（削除済み）は無視する", () => {
    const cards = [card("a")];
    const logs = [log("a", "again"), log("a", "again"), log("a", "good"), log("ghost", "again"), log("ghost", "again"), log("ghost", "again")];
    const weak = selectWeakCards(cards, logs);
    expect(weak.map((entry) => entry.card.id)).toEqual(["a"]);
  });

  it("limit で件数を絞る", () => {
    const cards = Array.from({ length: 8 }, (_, index) => card(`c${String(index)}`));
    const logs = cards.flatMap((entry) => [log(entry.id, "again"), log(entry.id, "again"), log(entry.id, "again")]);
    expect(selectWeakCards(cards, logs, { limit: 5 })).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/study/stats.test.ts`
Expected: FAIL（`./stats` が存在しない）

- [ ] **Step 3: Write minimal implementation**

`src/core/study/stats.ts`:

```ts
import type { ReviewLog, StudyCard } from "@/core/domain";

export interface ReviewStats {
  totalReviews: number;
  correctReviews: number;
  // 総回答 0 のときは 0% と区別するため undefined。
  accuracy: number | undefined;
}

export interface WeakCard {
  card: StudyCard;
  reviews: number;
  correct: number;
  accuracy: number;
}

interface SelectWeakCardsOptions {
  // 苦手判定に必要な最低復習回数。1 回の again での誤検出を防ぐ下限。
  minReviews?: number;
  limit?: number;
}

// again のみを不正解（lapse）とみなす。Anki の Again 相当。
const isCorrect = (grade: ReviewLog["grade"]): boolean => grade !== "again";

export const computeReviewStats = (logs: readonly ReviewLog[]): ReviewStats => {
  const totalReviews = logs.length;
  const correctReviews = logs.filter((log) => isCorrect(log.grade)).length;

  return {
    totalReviews,
    correctReviews,
    accuracy: totalReviews === 0 ? undefined : correctReviews / totalReviews,
  };
};

export const selectWeakCards = (
  cards: readonly StudyCard[],
  logs: readonly ReviewLog[],
  options: SelectWeakCardsOptions = {},
): WeakCard[] => {
  const minReviews = options.minReviews ?? 3;
  const limit = options.limit ?? 5;

  const totalsByCardId = new Map<string, { reviews: number; correct: number }>();
  for (const log of logs) {
    const entry = totalsByCardId.get(log.cardId) ?? { reviews: 0, correct: 0 };
    entry.reviews += 1;
    if (isCorrect(log.grade)) {
      entry.correct += 1;
    }
    totalsByCardId.set(log.cardId, entry);
  }

  const weakCards: WeakCard[] = [];
  for (const card of cards) {
    const totals = totalsByCardId.get(card.id);
    if (totals === undefined || totals.reviews < minReviews) {
      continue;
    }
    weakCards.push({
      card,
      reviews: totals.reviews,
      correct: totals.correct,
      accuracy: totals.correct / totals.reviews,
    });
  }

  // 正答率昇順。同率なら復習回数が多い順（判定の根拠が厚いカードを優先）。
  weakCards.sort((left, right) =>
    left.accuracy !== right.accuracy ? left.accuracy - right.accuracy : right.reviews - left.reviews,
  );

  return weakCards.slice(0, limit);
};
```

- [ ] **Step 4: Add exports to `src/core/study/index.ts`**

`src/core/study/index.ts` の末尾に追記:

```ts
export { computeReviewStats, selectWeakCards } from "./stats";
export type { ReviewStats, WeakCard } from "./stats";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/core/study/stats.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/study/stats.ts src/core/study/stats.test.ts src/core/study/index.ts
git commit -m "feat(study): 正答率と苦手カードの算出を追加

Refs #30

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `core/study/recent.ts` — 最近開いた項目のマージ

**Files:**
- Create: `src/core/study/recent.ts`
- Create: `src/core/study/recent.test.ts`
- Modify: `src/core/study/index.ts`

**Interfaces:**
- Consumes: `ISODateString`, `StudyCard`, `buildArticleReferenceKey` from `@/core/domain`。
- Produces:
  - `mergeRecentItems(inputs: RecentInputs, options?: { limit?: number }): RecentItem[]`
  - `type RecentItem = { kind: "law"; lawId: string; title: string; at: ISODateString } | { kind: "card"; card: StudyCard; at: ISODateString }`
  - `interface RecentInputs { savedLaws: readonly { lawId: string; title: string; at: ISODateString }[]; reviewedCards: readonly { card: StudyCard; at: ISODateString }[] }`

- [ ] **Step 1: Write the failing test**

`src/core/study/recent.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { StudyCard } from "@/core/domain";

import { mergeRecentItems } from "./recent";

const card = (id: string, article: string): StudyCard => ({
  id,
  source: "manual",
  target: { lawId: "129AC0000000089", article },
  type: "fill_blank",
  question: `Q${id}`,
  answer: `A${id}`,
  tags: [],
  examPinned: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

describe("mergeRecentItems", () => {
  it("at 降順（新しい順）でマージする", () => {
    const merged = mergeRecentItems({
      savedLaws: [{ lawId: "L1", title: "民法", at: "2026-07-10T00:00:00.000Z" }],
      reviewedCards: [{ card: card("c1", "709"), at: "2026-07-12T00:00:00.000Z" }],
    });
    expect(merged.map((item) => item.kind)).toEqual(["card", "law"]);
  });

  it("同一条文の重複を除去し、より新しい項目を残す", () => {
    const merged = mergeRecentItems({
      savedLaws: [],
      reviewedCards: [
        { card: card("old", "709"), at: "2026-07-10T00:00:00.000Z" },
        { card: card("new", "709"), at: "2026-07-12T00:00:00.000Z" },
      ],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ kind: "card" });
    expect((merged[0] as { card: StudyCard }).card.id).toBe("new");
  });

  it("法令とカードは粒度が違うので別項目として残る", () => {
    const merged = mergeRecentItems({
      savedLaws: [{ lawId: "129AC0000000089", title: "民法", at: "2026-07-11T00:00:00.000Z" }],
      reviewedCards: [{ card: card("c1", "709"), at: "2026-07-12T00:00:00.000Z" }],
    });
    expect(merged).toHaveLength(2);
  });

  it("limit で件数を絞る", () => {
    const reviewedCards = Array.from({ length: 8 }, (_, index) => ({
      card: card(`c${String(index)}`, String(index)),
      at: `2026-07-${String(10 + index).padStart(2, "0")}T00:00:00.000Z`,
    }));
    expect(mergeRecentItems({ savedLaws: [], reviewedCards }, { limit: 5 })).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/core/study/recent.test.ts`
Expected: FAIL（`./recent` が存在しない）

- [ ] **Step 3: Write minimal implementation**

`src/core/study/recent.ts`:

```ts
import { buildArticleReferenceKey } from "@/core/domain";
import type { ISODateString, StudyCard } from "@/core/domain";

export type RecentItem =
  | { kind: "law"; lawId: string; title: string; at: ISODateString }
  | { kind: "card"; card: StudyCard; at: ISODateString };

export interface RecentInputs {
  savedLaws: readonly { lawId: string; title: string; at: ISODateString }[];
  reviewedCards: readonly { card: StudyCard; at: ISODateString }[];
}

interface MergeRecentItemsOptions {
  limit?: number;
}

// 重複除去キー。法令は法令単位、カードは対象条文単位で正規化する。
const itemKey = (item: RecentItem): string =>
  item.kind === "law"
    ? buildArticleReferenceKey({ lawId: item.lawId })
    : buildArticleReferenceKey(item.card.target);

export const mergeRecentItems = (
  inputs: RecentInputs,
  options: MergeRecentItemsOptions = {},
): RecentItem[] => {
  const limit = options.limit ?? 5;

  const items: RecentItem[] = [
    ...inputs.savedLaws.map(
      (law): RecentItem => ({ kind: "law", lawId: law.lawId, title: law.title, at: law.at }),
    ),
    ...inputs.reviewedCards.map(
      (entry): RecentItem => ({ kind: "card", card: entry.card, at: entry.at }),
    ),
  ];

  // ISO 8601 文字列は辞書順比較が時系列順と一致するので、そのまま降順に並べる。
  items.sort((left, right) => right.at.localeCompare(left.at));

  const seen = new Set<string>();
  const merged: RecentItem[] = [];
  for (const item of items) {
    const key = itemKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }

  return merged.slice(0, limit);
};
```

- [ ] **Step 4: Add exports to `src/core/study/index.ts`**

`src/core/study/index.ts` の末尾に追記:

```ts
export { mergeRecentItems } from "./recent";
export type { RecentInputs, RecentItem } from "./recent";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/core/study/recent.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/study/recent.ts src/core/study/recent.test.ts src/core/study/index.ts
git commit -m "feat(study): 最近開いた項目のマージを追加

Refs #30

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `app/use-study-dashboard.ts` — 共有ダッシュボードフック

**Files:**
- Create: `src/app/use-study-dashboard.ts`
- Create: `src/app/use-study-dashboard.test.ts`

**Interfaces:**
- Consumes: `computeReviewStats`, `selectWeakCards`, `mergeRecentItems`, `RecentItem`, `ReviewStats`, `WeakCard` from `@/core/study`；`StorageRepository`, `createStorageRepository` from `@/core/storage`；`ISODateString`, `ReviewLog`, `StudyCard` from `@/core/domain`。
- Produces:
  - `useStudyDashboard(storageRepository?: StorageRepository): UseStudyDashboardResult`
  - `interface StudyDashboard { dueCount: number; unscheduledCount: number; cardCount: number; stats: ReviewStats; weakCards: WeakCard[]; recentItems: RecentItem[]; cards: StudyCard[] }`
  - `interface UseStudyDashboardResult { dashboard: StudyDashboard | undefined; error: string | undefined }`

- [ ] **Step 1: Write the failing test**

`src/app/use-study-dashboard.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CardSchedule, ReviewLog, StudyCard } from "@/core/domain";

import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";
import { sampleLawViewerDocument } from "./law-viewer-sample";
import { useStudyDashboard } from "./use-study-dashboard";

const card = (id: string): StudyCard => ({
  id,
  source: "manual",
  target: { lawId: "129AC0000000089", article: id },
  type: "fill_blank",
  question: `Q${id}`,
  answer: `A${id}`,
  tags: [],
  examPinned: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const log = (cardId: string, grade: ReviewLog["grade"], reviewedAt: string): ReviewLog => ({
  id: `${cardId}-${reviewedAt}`,
  cardId,
  grade,
  reviewedAt,
  scheduler: "fixed-interval@1",
});

describe("useStudyDashboard", () => {
  it("正答率・苦手カード・最近開いた項目を組み立てる", async () => {
    const { repository } = createMemoryStorageRepository({
      studyCards: [card("a"), card("b")],
      reviewLogs: [
        log("a", "again", "2026-07-10T00:00:00.000Z"),
        log("a", "again", "2026-07-11T00:00:00.000Z"),
        log("a", "good", "2026-07-12T00:00:00.000Z"),
        log("b", "good", "2026-07-09T00:00:00.000Z"),
      ],
    });

    const { result } = renderHook(() => useStudyDashboard(repository));

    await waitFor(() => {
      expect(result.current.dashboard).toBeDefined();
    });

    const dashboard = result.current.dashboard;
    if (dashboard === undefined) {
      throw new Error("dashboard should be defined");
    }
    expect(dashboard.cardCount).toBe(2);
    expect(dashboard.stats.totalReviews).toBe(4);
    expect(dashboard.stats.correctReviews).toBe(2);
    // カード a は 3 回中 1 正解 → 苦手。カード b は 1 回のみで minReviews 未満。
    expect(dashboard.weakCards.map((weak) => weak.card.id)).toEqual(["a"]);
    // 最近開いた: a の最新 reviewedAt は 07-12。カード単位で 1 件ずつ。
    expect(dashboard.recentItems.some((item) => item.kind === "card")).toBe(true);
  });

  it("エラー時は dashboard を undefined にしてエラーメッセージを返す", async () => {
    const failing = {
      listDueStudyCards: () => Promise.reject(new Error("boom")),
      listUnscheduledStudyCards: () => Promise.resolve([]),
      listStudyCards: () => Promise.resolve([]),
      listReviewLogs: () => Promise.resolve([]),
      listSavedLaws: () => Promise.resolve([]),
    } as unknown as Parameters<typeof useStudyDashboard>[0];

    const { result } = renderHook(() => useStudyDashboard(failing));

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
    expect(result.current.dashboard).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/use-study-dashboard.test.ts`
Expected: FAIL（`./use-study-dashboard` が存在しない）

- [ ] **Step 3: Write minimal implementation**

`src/app/use-study-dashboard.ts`:

```ts
import { useEffect, useState } from "react";

import type { ISODateString, ReviewLog, StudyCard } from "@/core/domain";
import { createStorageRepository } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";
import { computeReviewStats, mergeRecentItems, selectWeakCards } from "@/core/study";
import type { RecentItem, ReviewStats, WeakCard } from "@/core/study";

// 本番ルーターは createAppRouter() を引数なしで呼ぶため、DI がないときは既定リポジトリへフォールバックする。
const defaultStorageRepository = createStorageRepository();

export interface StudyDashboard {
  dueCount: number;
  unscheduledCount: number;
  cardCount: number;
  stats: ReviewStats;
  weakCards: WeakCard[];
  recentItems: RecentItem[];
  // 科目別の件数集計に StudyPage が使うため、生カード一覧も保持する。
  cards: StudyCard[];
}

export interface UseStudyDashboardResult {
  dashboard: StudyDashboard | undefined;
  error: string | undefined;
}

// 各カードの最新の復習時刻を求め、カード単位の最近リストにする。
const selectRecentlyReviewedCards = (
  cards: readonly StudyCard[],
  reviewLogs: readonly ReviewLog[],
): { card: StudyCard; at: ISODateString }[] => {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const latestByCardId = new Map<string, ISODateString>();
  for (const log of reviewLogs) {
    const current = latestByCardId.get(log.cardId);
    if (current === undefined || current.localeCompare(log.reviewedAt) < 0) {
      latestByCardId.set(log.cardId, log.reviewedAt);
    }
  }

  const reviewed: { card: StudyCard; at: ISODateString }[] = [];
  for (const [cardId, at] of latestByCardId) {
    const card = cardsById.get(cardId);
    if (card !== undefined) {
      reviewed.push({ card, at });
    }
  }

  return reviewed;
};

export const useStudyDashboard = (
  storageRepository: StorageRepository = defaultStorageRepository,
): UseStudyDashboardResult => {
  const [dashboard, setDashboard] = useState<StudyDashboard>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let isCurrent = true;
    const now = new Date().toISOString();

    void Promise.all([
      storageRepository.listDueStudyCards(now),
      storageRepository.listUnscheduledStudyCards(),
      storageRepository.listStudyCards(),
      storageRepository.listReviewLogs(),
      storageRepository.listSavedLaws(),
    ])
      .then(([dueCards, unscheduledCards, cards, reviewLogs, savedLaws]) => {
        if (!isCurrent) {
          return;
        }

        const recentItems = mergeRecentItems({
          savedLaws: savedLaws.map((saved) => ({
            lawId: saved.law.lawId,
            title: saved.law.title,
            at: saved.updatedAt,
          })),
          reviewedCards: selectRecentlyReviewedCards(cards, reviewLogs),
        });

        setError(undefined);
        setDashboard({
          dueCount: dueCards.length,
          unscheduledCount: unscheduledCards.length,
          cardCount: cards.length,
          stats: computeReviewStats(reviewLogs),
          weakCards: selectWeakCards(cards, reviewLogs),
          recentItems,
          cards,
        });
      })
      .catch(() => {
        // 読み込み失敗時は数字を出さず、ページ本体は表示できるようにする。
        if (isCurrent) {
          setDashboard(undefined);
          setError("学習データの読み込みに失敗しました");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [storageRepository]);

  return { dashboard, error };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/use-study-dashboard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/use-study-dashboard.ts src/app/use-study-dashboard.test.ts
git commit -m "feat(app): 学習ダッシュボードの共有フックを追加

Refs #30

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `StudyPage` — 苦手条文の実データ化と正答率表示

**Files:**
- Modify: `src/app/pages.tsx`（`StudyPage` と周辺 import・`StudyOverview` 削除）
- Modify: `src/app/study-page.test.tsx`

**Interfaces:**
- Consumes: `useStudyDashboard` from `./use-study-dashboard`。
- Produces: なし（ページの見た目のみ）。

- [ ] **Step 1: Write the failing test（苦手条文と正答率）**

`src/app/study-page.test.tsx` に追加（既存の render ヘルパーを再利用）。既存ファイル冒頭の import と fixtures を確認し、次のケースを追記する:

```ts
it("復習ログがあると苦手条文と正答率を表示する", async () => {
  const { repository } = createMemoryStorageRepository({
    studyCards: [
      {
        id: "weak",
        source: "manual",
        target: { lawId: "129AC0000000089", article: "709" },
        type: "fill_blank",
        question: "不法行為の要件",
        answer: "故意過失",
        tags: [],
        examPinned: false,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    reviewLogs: [
      { id: "l1", cardId: "weak", grade: "again", reviewedAt: "2026-07-10T00:00:00.000Z", scheduler: "fixed-interval@1" },
      { id: "l2", cardId: "weak", grade: "again", reviewedAt: "2026-07-11T00:00:00.000Z", scheduler: "fixed-interval@1" },
      { id: "l3", cardId: "weak", grade: "good", reviewedAt: "2026-07-12T00:00:00.000Z", scheduler: "fixed-interval@1" },
    ],
  });

  renderStudy(repository);

  expect(await screen.findByRole("link", { name: /不法行為の要件/ })).toBeInTheDocument();
  // 通算正答率 1/3 ≒ 33%
  expect(screen.getByText(/33%/)).toBeInTheDocument();
  expect(screen.queryByText("準備中")).not.toBeInTheDocument();
});
```

> 注: 既存 `study-page.test.tsx` に `renderStudy` 相当のヘルパーと `createMemoryStorageRepository` の import が無ければ、`home-page.test.tsx` と同じ形（`RouterProvider` + `createAppRouter({ history, storageRepository })`、`createMemoryHistory({ initialEntries: ["/study"] })`）で用意する。

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/study-page.test.tsx`
Expected: FAIL（「準備中」が残る／苦手リンクが無い）

- [ ] **Step 3: `StudyPage` を書き換える**

`src/app/pages.tsx`:

1. 冒頭の import に追加し、不要になった直接依存を整理する:

```ts
import { useStudyDashboard } from "./use-study-dashboard";
```

`StudyOverview` interface と、それを組み立てていた `useState`/`useEffect`/`Promise.all` のブロックは削除する。`gyoseishoshiSubjects` / `isLawInSubject` の import と `Link` は引き続き使う。`createStorageRepository` 由来の `defaultStorageRepository` は `StudyPage` が直接使わなくなるが、他ページが使っていれば残す（このファイル内で `StudyPage` 専用だった場合のみ削除）。

2. `StudyPage` 本体を次の形にする（`storageRepository` prop はフックへ渡す）:

```tsx
export const StudyPage = ({
  storageRepository,
}: { storageRepository?: StorageRepository } = {}) => {
  const { dashboard } = useStudyDashboard(storageRepository);

  return (
    <section className="mx-auto grid w-full max-w-2xl gap-4 px-5 py-10">
      <h1 className="font-serif text-2xl font-semibold text-foreground">復習</h1>
      <div className="rounded-md bg-primary p-4 text-primary-foreground">
        <p className="font-semibold">今日の復習</p>
        <p className="mt-1 text-xs opacity-75">
          {dashboard === undefined
            ? "復習するカードを確認しています"
            : dashboard.dueCount === 0
              ? "今日の復習はありません"
              : `${dashboard.dueCount.toLocaleString("ja-JP")} 件のカードが復習期限です`}
        </p>
        {dashboard !== undefined && dashboard.stats.accuracy !== undefined ? (
          <p className="mt-1 text-xs opacity-75">
            通算正答率 {Math.round(dashboard.stats.accuracy * 100)}%（
            {dashboard.stats.totalReviews.toLocaleString("ja-JP")} 回答）
          </p>
        ) : null}
        {dashboard !== undefined && dashboard.dueCount > 0 ? (
          <Link
            className="mt-2 inline-block rounded-md bg-primary-foreground px-3 py-1.5 text-sm font-medium text-primary"
            to="/study/review"
          >
            復習を始める
          </Link>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-md border bg-card p-4">
          <h2 className="text-sm font-medium text-foreground">新しく覚える</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {dashboard === undefined
              ? "未学習のカードから新しく覚えます"
              : `${dashboard.unscheduledCount.toLocaleString("ja-JP")} 件の未学習カード`}
          </p>
          {dashboard !== undefined && dashboard.unscheduledCount > 0 ? (
            <Link
              className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
              search={{ mode: "new" }}
              to="/study/review"
            >
              新しく覚える
            </Link>
          ) : null}
        </section>
        <section className="rounded-md border bg-card p-4">
          <h2 className="text-sm font-medium text-foreground">条文カード</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {dashboard === undefined
              ? "保存したカードを一覧できます"
              : `${dashboard.cardCount.toLocaleString("ja-JP")} 件のカード`}
          </p>
          <Link
            className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
            to="/study/cards"
          >
            カード一覧を開く
          </Link>
        </section>
        <section className="rounded-md border bg-card p-4">
          <h2 className="text-sm font-medium text-foreground">苦手な条文</h2>
          {dashboard === undefined ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              苦手な条文を集計しています
            </p>
          ) : dashboard.weakCards.length === 0 ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              まだ苦手な条文はありません
            </p>
          ) : (
            <ul className="mt-2 grid gap-1.5">
              {dashboard.weakCards.map((weak) => (
                <li
                  key={weak.card.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <Link
                    className="min-w-0 truncate text-primary underline-offset-4 hover:underline"
                    params={{
                      lawId: weak.card.target.lawId,
                      article: weak.card.target.article ?? "",
                    }}
                    to="/laws/$lawId/articles/$article"
                  >
                    {weak.card.question}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {Math.round(weak.accuracy * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-md border bg-card p-4">
          <h2 id="subject-presets-heading" className="text-sm font-medium text-foreground">
            科目別プリセット
          </h2>
          <ul aria-labelledby="subject-presets-heading" className="mt-2 grid gap-1.5">
            {gyoseishoshiSubjects.map((subject) => (
              <li key={subject.id} className="flex items-center justify-between gap-2 text-sm">
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  search={{ subject: subject.id }}
                  to="/study/cards"
                >
                  {subject.label}
                </Link>
                {dashboard === undefined ? null : (
                  <span className="text-xs text-muted-foreground">
                    {dashboard.cards
                      .filter((card) => isLawInSubject(subject.id, card.target.lawId))
                      .length.toLocaleString("ja-JP")}{" "}
                    件
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
};
```

> `StorageRepository` 型 import が `pages.tsx` に既にあることを確認する（無ければ `import type { StorageRepository } from "@/core/storage";` を追加）。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/study-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Full check**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test`
Expected: すべて PASS（既存の StudyPage テストも緑）

- [ ] **Step 6: Commit**

```bash
git add src/app/pages.tsx src/app/study-page.test.tsx
git commit -m "feat(app): Study 画面に苦手条文と正答率を表示

Refs #30

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `HomePage` — 学習ダッシュボードの統合

**Files:**
- Modify: `src/app/home-page.tsx`
- Modify: `src/app/home-page.test.tsx`

**Interfaces:**
- Consumes: `useStudyDashboard` from `./use-study-dashboard`。既存の `useSavedLaws` は保存ライブラリ表示にそのまま使う。
- Produces: なし。

- [ ] **Step 1: Write the failing test**

`src/app/home-page.test.tsx` に追記:

```ts
it("学習データがあると今日の復習・苦手条文・最近開いた項目を表示する", async () => {
  const { repository } = createMemoryStorageRepository({
    savedLawDocument: createSavedLawDocument({
      law: sampleLawViewerDocument.law,
      revision: sampleLawViewerDocument.revision,
      nodes: sampleLawViewerDocument.nodes,
    }),
    studyCards: [
      {
        id: "weak",
        source: "manual",
        target: { lawId: sampleLawViewerDocument.law.lawId, article: "1" },
        type: "fill_blank",
        question: "第1条の趣旨",
        answer: "…",
        tags: [],
        examPinned: false,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    reviewLogs: [
      { id: "l1", cardId: "weak", grade: "again", reviewedAt: "2026-07-10T00:00:00.000Z", scheduler: "fixed-interval@1" },
      { id: "l2", cardId: "weak", grade: "again", reviewedAt: "2026-07-11T00:00:00.000Z", scheduler: "fixed-interval@1" },
      { id: "l3", cardId: "weak", grade: "good", reviewedAt: "2026-07-12T00:00:00.000Z", scheduler: "fixed-interval@1" },
    ],
  });

  renderHome(repository);

  expect(await screen.findByRole("heading", { name: "苦手な条文" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "最近開いた" })).toBeInTheDocument();
  // 古い「準備中」文言が消えている。
  expect(screen.queryByText("復習機能は準備中です")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/home-page.test.tsx`
Expected: FAIL（「苦手な条文」「最近開いた」見出しが無い／「準備中」が残る）

- [ ] **Step 3: `HomePage` を書き換える**

`src/app/home-page.tsx`:

1. import を追加:

```ts
import { BookOpenCheck, TrendingUp } from "lucide-react";
import { useStudyDashboard } from "./use-study-dashboard";
```

（既存の `Camera, ClipboardPaste, GraduationCap, Search` はそのまま。`GraduationCap` は復習 CTA に流用する。）

2. コンポーネント本体でフックを呼ぶ:

```tsx
const { savedLaws, savedLawsError } = useSavedLaws(storageRepository);
const { dashboard } = useStudyDashboard(storageRepository);
const hasSavedLaws = savedLaws.length > 0;
const { open } = useSearchPalette();
```

3. これまで `hasSavedLaws` の分岐内にあった **「復習を始める / 復習機能は準備中です」ボタン**（`GraduationCap` を使う `Link to="/study"` ブロック）を削除し、代わりに保存の有無に依存しない学習セクションを、検索ヒーローの直後に挿入する。次の JSX を `</div>`（ヒーローの grid 終わり）と保存済みセクションの間に置く:

```tsx
{dashboard !== undefined &&
(dashboard.dueCount > 0 ||
  dashboard.cardCount > 0 ||
  dashboard.stats.accuracy !== undefined) ? (
  <section aria-labelledby="home-study-heading" className="grid gap-4">
    <h2 id="home-study-heading" className="sr-only">
      学習
    </h2>
    <Button asChild className="h-auto justify-start gap-3 py-3">
      <Link to="/study">
        <GraduationCap className="size-5" aria-hidden="true" />
        <span className="grid text-left">
          <span className="font-semibold">
            {dashboard.dueCount > 0
              ? `今日の復習 ${dashboard.dueCount.toLocaleString("ja-JP")} 件`
              : "今日の復習はありません"}
          </span>
          <span className="text-xs opacity-75">
            {dashboard.stats.accuracy === undefined
              ? "復習を始めると正答率が表示されます"
              : `通算正答率 ${String(Math.round(dashboard.stats.accuracy * 100))}%`}
          </span>
        </span>
      </Link>
    </Button>

    <div className="grid gap-4 sm:grid-cols-2">
      <section
        aria-labelledby="home-weak-heading"
        className="grid gap-2 rounded-md border bg-card p-4"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 id="home-weak-heading" className="text-sm font-semibold text-foreground">
            苦手な条文
          </h3>
        </div>
        {dashboard.weakCards.length === 0 ? (
          <p className="text-xs leading-5 text-muted-foreground">まだ苦手な条文はありません</p>
        ) : (
          <ul className="grid gap-1.5">
            {dashboard.weakCards.map((weak) => (
              <li key={weak.card.id} className="flex items-center justify-between gap-2 text-sm">
                <Link
                  className="min-w-0 truncate text-primary underline-offset-4 hover:underline"
                  params={{
                    lawId: weak.card.target.lawId,
                    article: weak.card.target.article ?? "",
                  }}
                  to="/laws/$lawId/articles/$article"
                >
                  {weak.card.question}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {String(Math.round(weak.accuracy * 100))}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="home-recent-heading"
        className="grid gap-2 rounded-md border bg-card p-4"
      >
        <div className="flex items-center gap-2">
          <BookOpenCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 id="home-recent-heading" className="text-sm font-semibold text-foreground">
            最近開いた
          </h3>
        </div>
        {dashboard.recentItems.length === 0 ? (
          <p className="text-xs leading-5 text-muted-foreground">
            最近開いた項目はまだありません
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {dashboard.recentItems.map((item) =>
              item.kind === "law" ? (
                <li key={`law-${item.lawId}`} className="text-sm">
                  <Link
                    className="block truncate text-primary underline-offset-4 hover:underline"
                    params={{ lawId: item.lawId }}
                    to="/laws/$lawId"
                  >
                    {item.title}
                  </Link>
                </li>
              ) : (
                <li key={`card-${item.card.id}`} className="text-sm">
                  <Link
                    className="block truncate text-primary underline-offset-4 hover:underline"
                    params={{
                      lawId: item.card.target.lawId,
                      article: item.card.target.article ?? "",
                    }}
                    to="/laws/$lawId/articles/$article"
                  >
                    {item.card.question}
                  </Link>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  </section>
) : null}
```

4. 既存の「オフライン保存済み」セクション（`hasSavedLaws` 分岐）は残す。ただし削除した復習ボタンの分だけ JSX 構造が変わるので、`savedLawsError` 表示・`hasSavedLaws` の保存一覧・未保存時の featured chips の 3 分岐はそのまま保持する。

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/home-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Full check**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test`
Expected: すべて PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/home-page.tsx src/app/home-page.test.tsx
git commit -m "feat(app): ホームに学習ダッシュボードを統合

Close #30

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 実画面検証（playwright-cli）と Antigravity review

**Files:** なし（検証のみ）

- [ ] **Step 1: preview build を起動**

Run（バックグラウンド）: `pnpm run build && pnpm run preview`
（`use-study-dashboard` の実データを見るため、`/study` でカードを作成→復習を数回行い、ログを溜めてから Home / Study を確認する。あるいは検証用に IndexedDB へ直接シードする。）

- [ ] **Step 2: Home（`/`）と Study（`/study`）を実画面確認**

`playwright-cli open --headed` で確立済みセッションを再利用し、次を確認する:
- Home に今日の復習 CTA・苦手な条文・最近開いた・オフライン保存済みが出る。
- Study の「苦手な条文」が実データで、旧「準備中」が無い。
- デスクトップ幅・モバイル幅の両方でテキストがはみ出さない。

- [ ] **Step 3: スクリーンショット撮影**

Home と Study のスクリーンショットを撮る（`playwright-cli-quirks` の注意に従い full-page ではなくビューポート撮影）。

- [ ] **Step 4: Antigravity review**

Run: `pnpm run review:antigravity`
（`agy` 不在なら skip される。その旨と、クォータ・使用量・残量が出れば最終報告に記録する。指摘は鵜呑みにせず検証する。）

- [ ] **Step 5: Draft PR 作成**

`gh pr create` で日本語タイトル・本文。本文に `Close #30`、`github-image-upload` スキルでスクリーンショットを添付、「動物界における比擬」セクションを設ける。作成後に自分（SlashNephy）を Assign する。

---

## Self-Review 記録

- **Spec coverage:** 今日の復習数(Task 4,5) / 最近開いた項目(Task 2,3,5) / 苦手項目(Task 1,4,5) / 正答率(Task 1,4,5) / 学習導線のホーム統合(Task 5)。Study の「準備中」置換(Task 4)。すべて対応済み。
- **Placeholder scan:** 各コード step に実コードを記載。曖昧な「適切に処理」表現なし。
- **Type consistency:** `computeReviewStats` / `selectWeakCards` / `mergeRecentItems` / `StudyDashboard` / `RecentItem` の名称と型は Task 1・2・3 の定義と Task 4・5 の利用で一致。リンクは既存 `study-cards-page` と同じ `to="/laws/$lawId/articles/$article"` パターン。
