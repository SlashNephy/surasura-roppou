# 検索の読み込み表示・デバウンス・中断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 検索の通信待ちにスケルトンを出し、パレット入力をデバウンスし、進行中のカタログ通信を `AbortSignal` で中断できるようにする。

**Architecture:** loading は `core` を変えず consumer 側の派生値で表す（`settledQuery !== 現在クエリ` を「検索中」とみなしスケルトンを出す。これが stale 候補フラッシュも同時に解消）。`AbortSignal` を `QuickSearch.search → CatalogSearchService.search → LawRepository.listLaws → fetcher` へ貫通し、consumer は検索ごとの `AbortController` を effect cleanup で `abort()` する。パレットは 200ms デバウンス。

**Tech Stack:** React 19 / TanStack Router / Vitest + Testing Library / `core/egov`・`core/search`・`core/jump`。

## Global Constraints

- 表示テキスト・コメントは日本語、ログ/エラーメッセージは英語。
- `core/**` は route/UI を import しない。loading は consumer 側で表現し、`QuickSearchOutcome` 型は変更しない。
- `AbortError` は握り潰さない: consumer の `.catch` では無視（ログ/フォールバックしない）、`catalog.ts` はキャッシュフォールバック前に rethrow する。
- **`react-hooks/set-state-in-effect` を踏まないこと**: effect 本体で同期 setState しない。状態更新は非同期コールバック（`.then`/`.catch`/`setTimeout`）内でのみ行い、「検索中」は `settledQuery` からの派生値にする。
- `signal` は `LawRepository.listLaws` のみに通す（catalog の唯一のオンライン呼び出し）。他メソッドは無変更。第2引数 `options?: { signal?: AbortSignal }` は後方互換。
- デバウンスは `SEARCH_DEBOUNCE_MS = 200`（理由コメント付き）。パレットのみ。`/search` は不要。
- スケルトンは `role="status" aria-label="検索中"` で包む（アクセシビリティ + テスト可能性）。
- 検証ゲート: `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `pnpm test`。コミット前に必ず実行。
- 既存 DI パターン踏襲（モジュール既定シングルトン + prop/option 注入）。既存テストは回帰させない。
- コミットメッセージは Conventional Commits（日本語）。末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

## File Structure

**変更**

- `src/core/egov/repository.ts` — `requestJson` と `listLaws` に `signal` を通す。
- `src/core/egov/repository.test.ts`（無ければ既存の egov テストファイル）— `listLaws(query, { signal })` が fetcher へ signal を転送する検証。
- `src/core/search/catalog.ts` — `search` に `signal`、`fetchOnline` へ伝播、`AbortError` を rethrow。
- `src/core/search/catalog.test.ts` — signal 伝播・abort 時のキャッシュ非呼び出し。
- `src/core/jump/quick-search.ts` — `search` に `signal`、`catalog.search` へ伝播。
- `src/core/jump/quick-search.test.ts` — signal 伝播。
- `src/app/SearchPalette.tsx` — デバウンス + `settledQuery` 派生 loading + `AbortController` + スケルトン。
- `src/app/SearchPalette.test.tsx` — デバウンス・スケルトン表示。
- `src/app/search-page.tsx` — `settledQuery` 派生 loading + `AbortController` + スケルトン。
- `src/app/search-page.test.tsx` — スケルトン表示。

---

## Task 1: `listLaws` に AbortSignal を通す（core/egov）

**Files:**

- Modify: `src/core/egov/repository.ts`
- Test: `src/core/egov/repository.test.ts`（既存のリポジトリテストファイル。無ければ新規作成）

**Interfaces:**

- Produces: `listLaws(query?: LawListQuery, options?: { signal?: AbortSignal }): Promise<LawListResult>`（第2引数追加、後方互換）。

- [ ] **Step 1: 失敗するテストを追加**

既存の egov テスト（`src/core/egov/repository.test.ts`）に追記。既存の `createEgovLawRepository({ fetcher })` パターンに合わせる:

```ts
it("listLaws は options.signal を fetcher へ転送する", async () => {
  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    receivedSignal = init?.signal ?? undefined;
    return new Response(JSON.stringify({ laws: [], total_count: 0, count: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const repository = createEgovLawRepository({ fetcher });

  await repository.listLaws({ title: "民法" }, { signal: controller.signal });

  expect(receivedSignal).toBe(controller.signal);
});
```

> 既存テストの `fetcher` スタブや JSON 形状（`parseLawsResponse` が受け付ける形）に合わせて payload を調整する。既存の成功系テストが使っているレスポンス生成ヘルパーがあればそれを流用する。

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/core/egov/repository.test.ts -t "signal"`
Expected: FAIL（`receivedSignal` が `undefined`。第2引数未対応）

- [ ] **Step 3: 実装**

`src/core/egov/repository.ts`:

`requestJson` に `signal` を追加:

```ts
const requestJson = async (
  path: string,
  query: Record<string, QueryValue>,
  signal?: AbortSignal,
): Promise<unknown> => {
  const url = buildUrl(baseUrl, path, { ...query, response_format: "json" });
  const response = await fetcher(url, { headers: { accept: "application/json" }, signal });
  const payload = await parseJsonResponse(response, url);

  if (!response.ok) {
    throw buildApiError(response.status, payload, url);
  }

  return payload;
};
```

`listLaws` に第2引数を追加し `signal` を渡す:

```ts
    async listLaws(query = {}, options = {}) {
      const payload = await requestJson(
        "/laws",
        {
          law_id: query.lawId,
          law_num: query.lawNumber,
          law_title: query.title,
          law_type: query.lawTypes,
          asof: query.asOf,
          offset: query.offset,
          limit: query.limit,
        },
        options.signal,
      );
      // 以降は既存のまま
```

`LawRepository` インターフェースの `listLaws` シグネチャを更新:

```ts
  listLaws(query?: LawListQuery, options?: { signal?: AbortSignal }): Promise<LawListResult>;
```

（他メソッド `getLaw` 等は `requestJson(path, query)` のまま。第3引数 `signal` 省略で従来動作。）

- [ ] **Step 4: 通過を確認**

Run: `pnpm exec vitest run src/core/egov/repository.test.ts`
Expected: PASS（新規 + 既存すべて）

- [ ] **Step 5: 検証ゲート**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/core/egov/repository.ts src/core/egov/repository.test.ts
git commit -m "feat(egov): listLaws に AbortSignal を通す

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: カタログ検索に signal を通し AbortError を rethrow（core/search）

**Files:**

- Modify: `src/core/search/catalog.ts`
- Test: `src/core/search/catalog.test.ts`

**Interfaces:**

- Consumes: `listLaws(query, { signal })`（Task 1）。
- Produces: `CatalogSearchService.search(query, options?: { online?: boolean; limit?: number; signal?: AbortSignal })`。

- [ ] **Step 1: 失敗するテストを追加**

`src/core/search/catalog.test.ts` に追記（既存の mock `lawRepository` / `indexRepository` パターンに合わせる）:

```ts
it("search は signal を listLaws へ渡す", async () => {
  const controller = new AbortController();
  let received: AbortSignal | undefined;
  const lawRepository = {
    listLaws: vi.fn(async (_query, options) => {
      received = options?.signal;
      return { totalCount: 0, count: 0, laws: [] };
    }),
  } as unknown as LawRepository;
  const service = createCatalogSearchService({ lawRepository, indexRepository });

  await service.search("民法", { signal: controller.signal });

  expect(received).toBe(controller.signal);
});

it("中断された signal では AbortError を投げ、キャッシュを引かない", async () => {
  const controller = new AbortController();
  controller.abort();
  const abortError = new DOMException("aborted", "AbortError");
  const lawRepository = {
    listLaws: vi.fn(async () => {
      throw abortError;
    }),
  } as unknown as LawRepository;
  const listCatalog = vi.fn(async () => []);
  const indexRepositoryLocal = { ...indexRepository, listCatalog };
  const service = createCatalogSearchService({
    lawRepository,
    indexRepository: indexRepositoryLocal,
  });

  await expect(service.search("民法", { signal: controller.signal })).rejects.toBe(abortError);
  expect(listCatalog).not.toHaveBeenCalled();
});
```

> `indexRepository` は既存テストのセットアップを流用。2 本目は `listCatalog` を spy に差し替えて「フォールバックしない」ことを検証する。型が合わない場合は既存の mock 構築ヘルパーに合わせる。

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/core/search/catalog.test.ts -t "signal|中断"`
Expected: FAIL（signal 未伝播 / abort 時にキャッシュへフォールバックしてしまう）

- [ ] **Step 3: 実装**

`src/core/search/catalog.ts`:

`search` シグネチャに `signal`:

```ts
export interface CatalogSearchService {
  search(
    query: string,
    options?: { online?: boolean; limit?: number; signal?: AbortSignal },
  ): Promise<CatalogSearchResult>;
}
```

`search` 本体の online 分岐を修正（`signal` を `fetchOnline` へ渡し、catch で abort を rethrow）:

```ts
if (options.online !== false) {
  try {
    const summaries = await fetchOnline(dependencies.lawRepository, trimmed, limit, options.signal);
    const entries = dedupeById(summaries.map((summary) => toCatalogEntry(summary, now)));
    await dependencies.indexRepository.upsertCatalogEntries(entries);
    const hits = toHits(entries, trimmed);

    if (hits.length > 0) {
      return { hits: hits.slice(0, limit), source: "online" };
    }
  } catch (error) {
    // 中断は正常系。キャッシュフォールバックへ進まず呼び出し側へ伝播させる。
    if (options.signal?.aborted || isAbortError(error)) {
      throw error;
    }
    // ネットワーク不通などはキャッシュへフォールバックする。想定外の失敗も観測できるよう英語でログする。
    console.warn("[search] online catalog search failed, falling back to cache", error);
  }
}
```

ファイル内にヘルパーを追加:

```ts
// fetch の中断は DOMException("AbortError")。名前で判定する。
const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";
```

`fetchOnline` に `signal` を追加し `listLaws` へ渡す:

```ts
const fetchOnline = async (
  lawRepository: LawRepository,
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<LawSummary[]> => {
  // 名前検索と番号検索は互いに独立なので、並列に投げてレイテンシを抑える。
  const requests = [lawRepository.listLaws({ title: query, limit }, { signal })];

  if (lawNumberPattern.test(query)) {
    requests.push(lawRepository.listLaws({ lawNumber: query, limit }, { signal }));
  }

  const results = await Promise.all(requests);
  // 以降は既存のまま
```

- [ ] **Step 4: 通過を確認**

Run: `pnpm exec vitest run src/core/search/catalog.test.ts`
Expected: PASS（新規 + 既存すべて）

- [ ] **Step 5: 検証ゲート**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/core/search/catalog.ts src/core/search/catalog.test.ts
git commit -m "feat(search): カタログ検索に signal を通し中断を伝播する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: quick-search coordinator に signal を通す（core/jump）

**Files:**

- Modify: `src/core/jump/quick-search.ts`
- Test: `src/core/jump/quick-search.test.ts`

**Interfaces:**

- Consumes: `CatalogSearchService.search(query, { signal })`（Task 2）。
- Produces: `QuickSearch.search(query, options?: { limit?: number; online?: boolean; signal?: AbortSignal })`。

- [ ] **Step 1: 失敗するテストを追加**

`src/core/jump/quick-search.test.ts` に追記（既存 `createCatalogStub` を signal 記録できる形へ拡張）:

```ts
it("search は signal をカタログ検索へ渡す", async () => {
  const controller = new AbortController();
  let received: AbortSignal | undefined;
  const catalog: CatalogSearchService = {
    search: vi.fn((_query, options): Promise<CatalogSearchResult> => {
      received = options?.signal;
      return Promise.resolve({ hits: [], source: "cache" });
    }),
  };
  const quickSearch = createQuickSearch({ catalog });

  // 法令名のみ（autoJump しない）→ カタログ検索が走る
  await quickSearch.search("民法", { signal: controller.signal });

  expect(received).toBe(controller.signal);
});
```

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/core/jump/quick-search.test.ts -t "signal"`
Expected: FAIL（signal 未伝播）

- [ ] **Step 3: 実装**

`src/core/jump/quick-search.ts`:

`QuickSearchOptions` に `signal`:

```ts
export interface QuickSearchOptions {
  limit?: number;
  online?: boolean;
  signal?: AbortSignal;
}
```

`search` 内のカタログ呼び出しへ `signal` を渡す:

```ts
const catalogResult = await catalog.search(trimmed, {
  online: options.online,
  limit: options.limit,
  signal: options.signal,
});
```

（autoJump 短絡時は catalog を呼ばないため signal は未使用。挙動不変。）

- [ ] **Step 4: 通過を確認**

Run: `pnpm exec vitest run src/core/jump/quick-search.test.ts`
Expected: PASS

- [ ] **Step 5: 検証ゲート**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/core/jump/quick-search.ts src/core/jump/quick-search.test.ts
git commit -m "feat(jump): quick-search coordinator に signal を通す

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: SearchPalette にデバウンス・スケルトン・中断（app）

**Files:**

- Modify: `src/app/SearchPalette.tsx`
- Test: `src/app/SearchPalette.test.tsx`

**Interfaces:**

- Consumes: `quickSearch.search(q, { signal })`（Task 3）、`Skeleton`（`@/shared/ui/skeleton`）。

**方針:** `useDeferredValue` を 200ms デバウンス（`debouncedQuery` state + `setTimeout`）へ置換。検索は `debouncedQuery` を `AbortController` 付きで実行。`settledQuery`（解決済みクエリ）を async コールバックでのみ更新し、「検索中」= `query.trim() !== "" && settledQuery !== query` を派生。検索中はスケルトンを出し、候補/unresolved を隠す。

- [ ] **Step 1: 失敗するテストを追加/更新**

`src/app/SearchPalette.test.tsx` に、遅延解決する fake quickSearch を注入してスケルトンを検証する `renderShell` 変種と新テストを足す。既存の `renderShell` は `emptyCatalog` で即時解決する quickSearch を使っているので、遅延版を追加:

```ts
// 手動で解決できる遅延 quickSearch。検索中スケルトンの検証に使う。
const createDeferredQuickSearch = () => {
  let resolveFn: ((outcome: QuickSearchOutcome) => void) | undefined;
  const search = vi.fn(
    () =>
      new Promise<QuickSearchOutcome>((resolve) => {
        resolveFn = resolve;
      }),
  );
  return {
    quickSearch: { search } as unknown as QuickSearch,
    resolve: (outcome: QuickSearchOutcome) => resolveFn?.(outcome),
  };
};
```

新テスト:

```ts
it("検索中はスケルトン（検索中インジケータ）を表示する", async () => {
  const user = userEvent.setup();
  const { quickSearch, resolve } = createDeferredQuickSearch();
  const history = createMemoryHistory({ initialEntries: ["/laws"] });
  const storageRepository = createMemoryStorageRepository().repository;
  render(<RouterProvider router={createAppRouter({ history, storageRepository, quickSearch })} />);
  await screen.findByRole("banner");

  await user.keyboard("/");
  await user.type(screen.getByPlaceholderText("法律や条文で検索できます"), "民法");

  // デバウンス後に検索が走り、解決前はスケルトンが出る
  expect(await screen.findByRole("status", { name: "検索中" })).toBeInTheDocument();

  resolve({
    status: "candidates",
    candidates: [
      { kind: "catalog", lawId: "129AC0000000089", lawTitle: "民法", reason: [], score: 0.3 },
    ],
    autoJump: false,
  });

  expect(await screen.findByRole("option", { name: /民法/ })).toBeInTheDocument();
  expect(screen.queryByRole("status", { name: "検索中" })).not.toBeInTheDocument();
});
```

> `QuickSearchOutcome` / `QuickSearch` の型 import を追加。既存の「候補が出る」テストは即時解決の quickSearch を使うため影響しないが、デバウンス導入で `findBy*`（非同期待ち）に頼っているか確認し、必要なら `findBy*` へ寄せる。

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/app/SearchPalette.test.tsx -t "スケルトン"`
Expected: FAIL（スケルトン未実装）

- [ ] **Step 3: 実装**

`src/app/SearchPalette.tsx`:

import を調整（`useDeferredValue` を除去、`Skeleton` を追加）:

```tsx
import { useEffect, useState } from "react";
```

```tsx
import { Skeleton } from "@/shared/ui/skeleton";
```

デバウンス定数（ファイル上部、`destinations` 付近）:

```tsx
// 入力が止まってから検索する遅延。キーストロークごとの e-Gov 通信を抑える。
const SEARCH_DEBOUNCE_MS = 200;
```

state と effect を差し替え（`deferredQuery` 廃止、`debouncedQuery` と `settledQuery` を導入）:

```tsx
const [query, setQuery] = useState("");
const [debouncedQuery, setDebouncedQuery] = useState("");
const [outcome, setOutcome] = useState<QuickSearchOutcome>({ status: "empty" });
// 検索が解決した時点のクエリ。これと現在の query の差分で「検索中」を判定する。
const [settledQuery, setSettledQuery] = useState("");

// 入力を 200ms デバウンスしてから検索対象に反映する。
useEffect(() => {
  const id = setTimeout(() => {
    setDebouncedQuery(query);
  }, SEARCH_DEBOUNCE_MS);

  return () => {
    clearTimeout(id);
  };
}, [query]);

useEffect(() => {
  const trimmed = debouncedQuery.trim();
  if (trimmed === "") {
    // 空クエリのときは「移動」グループを表示するため outcome の更新は不要
    return;
  }

  let cancelled = false;
  const controller = new AbortController();
  void quickSearch
    .search(trimmed, { signal: controller.signal })
    .then((next) => {
      if (!cancelled) {
        setOutcome(next);
        setSettledQuery(debouncedQuery);
      }
    })
    .catch((error: unknown) => {
      // 中断（新しい検索・パレットを閉じた等）は正常系なので無視する。
      if (controller.signal.aborted) {
        return;
      }
      console.error("quick search failed", error);
      if (!cancelled) {
        // 検索失敗時は空の候補リストにフォールバックして「該当なし」状態を表示する
        setOutcome({ status: "candidates", candidates: [], autoJump: false });
        setSettledQuery(debouncedQuery);
      }
    });

  return () => {
    cancelled = true;
    controller.abort();
  };
}, [debouncedQuery, quickSearch]);
```

派生の「検索中」フラグ（`handleOpenChange` 付近に）:

```tsx
const trimmedQuery = query.trim();
// settledQuery が現在の入力に追いつくまでは検索中とみなす（デバウンス中・通信中を含む）。
const isSearching = trimmedQuery !== "" && settledQuery !== query;
```

閉じるときに検索状態もリセット:

```tsx
const handleOpenChange = (open: boolean) => {
  setOpen(open);
  if (!open) {
    setQuery("");
    setDebouncedQuery("");
    setSettledQuery("");
    setOutcome({ status: "empty" });
  }
};
```

`goToCandidate` / `goToSearchPage` でも同様に入力・派生状態をクリア（既存の `setQuery("")` に加える）:

```tsx
const resetSearchState = () => {
  setQuery("");
  setDebouncedQuery("");
  setSettledQuery("");
  setOutcome({ status: "empty" });
};

const goToCandidate = (candidate: QuickSearchCandidate) => {
  setOpen(false);
  resetSearchState();
  navigateToCandidate(navigate, candidate);
};

const goToSearchPage = () => {
  const trimmed = query.trim();
  setOpen(false);
  resetSearchState();
  void navigate({ to: "/search", search: { q: trimmed } });
};
```

（`handleOpenChange` も `resetSearchState()` を使う形に統一してよい。）

`CommandList` の非空クエリ分岐で、検索中はスケルトンを出し候補/unresolved を隠す。現在の非空分岐（`query.trim() === "" ? 移動 : <> ... </>`）の中を次の順に:

```tsx
            {isSearching ? (
              <div
                role="status"
                aria-label="検索中"
                className="grid gap-2 px-2 py-3"
              >
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-3/5" />
              </div>
            ) : (
              <>
                {outcome.status === "candidates" && outcome.candidates.length > 0 ? (
                  /* 既存の候補 CommandGroup */
                ) : null}
                {outcome.status === "unresolved" ? (
                  /* 既存の unresolved CommandEmpty */
                ) : null}
                {outcome.status === "candidates" && outcome.candidates.length === 0 ? (
                  /* 既存の「該当なし」CommandEmpty */
                ) : null}
              </>
            )}
            {/* 「『{query}』で検索」項目は検索中でも表示（既存のまま、末尾に残す） */}
```

> 既存の候補/unresolved/該当なしの JSX はそのまま `!isSearching` 側へ移すだけ。「『{q}』で検索」項目は分岐の外（常に表示）に残す。`CommandEmpty` は cmdk の仕様上「アイテムが無いとき」に出るため、スケルトンや検索項目と併存して問題ないか確認し、必要なら通常の `<p>` で置換する。

- [ ] **Step 4: 通過を確認**

Run: `pnpm exec vitest run src/app/SearchPalette.test.tsx`
Expected: PASS（新規 + 既存すべて。既存の候補表示テストは `findBy*` で待てば緑）

- [ ] **Step 5: 検証ゲート**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/app/SearchPalette.tsx src/app/SearchPalette.test.tsx
git commit -m "feat(app): 検索パレットにデバウンスと読み込み表示と中断を追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: SearchPage にスケルトン・中断（app）

**Files:**

- Modify: `src/app/search-page.tsx`
- Test: `src/app/search-page.test.tsx`

**Interfaces:**

- Consumes: `quickSearch.search(q, { signal })`（Task 3）、`Skeleton`（`@/shared/ui/skeleton`）。

**方針:** `settledQuery` を async コールバックでのみ更新し `isSearching = trimmedQ !== "" && settledQuery !== q` を派生。検索中はスケルトンを出し、候補/unresolved/該当なしを隠す。検索は `AbortController` 付きで実行し cleanup で `abort()`。

- [ ] **Step 1: 失敗するテストを追加**

`src/app/search-page.test.tsx` に、遅延解決 quickSearch でスケルトンを検証するテストを追加（既存の最小ルータ harness を流用）:

```ts
it("検索中はスケルトンを表示し、解決後に候補を表示する", async () => {
  let resolveFn: ((outcome: QuickSearchOutcome) => void) | undefined;
  const quickSearch = {
    search: vi.fn(
      () =>
        new Promise<QuickSearchOutcome>((resolve) => {
          resolveFn = resolve;
        }),
    ),
  } as unknown as QuickSearch;

  // renderSearch を quickSearch 差し替え可能にして描画（既存 helper を拡張）
  await renderSearchWith("民法", quickSearch);

  expect(await screen.findByRole("status", { name: "検索中" })).toBeInTheDocument();

  resolveFn?.({
    status: "candidates",
    candidates: [
      { kind: "catalog", lawId: "129AC0000000089", lawTitle: "民法", reason: [], score: 0.3 },
    ],
    autoJump: false,
  });

  expect(await screen.findByText("民法")).toBeInTheDocument();
  expect(screen.queryByRole("status", { name: "検索中" })).not.toBeInTheDocument();
});
```

> 既存の `renderSearch(q)` は内部で `createQuickSearch({ catalog: emptyCatalog })` を作っている。`quickSearch` を引数で受け取れる `renderSearchWith(q, quickSearch)` を用意（既存 `renderSearch` はそれを既定 quickSearch で呼ぶ薄いラッパにする）。`QuickSearchOutcome` 型 import を追加。

- [ ] **Step 2: 失敗を確認**

Run: `pnpm exec vitest run src/app/search-page.test.tsx -t "スケルトン"`
Expected: FAIL（スケルトン未実装）

- [ ] **Step 3: 実装**

`src/app/search-page.tsx`:

import に `Skeleton` を追加:

```tsx
import { Skeleton } from "@/shared/ui/skeleton";
```

`settledQuery` state と signal 付き検索へ差し替え:

```tsx
const [outcome, setOutcome] = useState<QuickSearchOutcome>({ status: "empty" });
// 検索が解決した時点のクエリ。現在の q との差分で「検索中」を判定する。
const [settledQuery, setSettledQuery] = useState("");

useEffect(() => {
  const trimmed = q.trim();
  if (trimmed === "") {
    // 空クエリのときは outcome の更新は不要。初期値 "empty" のまま表示する。
    return;
  }

  let cancelled = false;
  const controller = new AbortController();
  void quickSearch
    .search(trimmed, { signal: controller.signal })
    .then((next) => {
      if (!cancelled) {
        setOutcome(next);
        setSettledQuery(q);
      }
    })
    .catch((error: unknown) => {
      // 中断（クエリ変更・アンマウント）は正常系なので無視する。
      if (controller.signal.aborted) {
        return;
      }
      console.error("search page query failed", error);
      if (!cancelled) {
        // 検索失敗時は空の候補リストにフォールバックして「該当なし」状態を表示する。
        setOutcome({ status: "candidates", candidates: [], autoJump: false });
        setSettledQuery(q);
      }
    });

  return () => {
    cancelled = true;
    controller.abort();
  };
}, [q, quickSearch]);
```

派生フラグ（`trimmedQ` の定義付近）:

```tsx
const trimmedQ = q.trim();
// settledQuery が現在の q に追いつくまでは検索中（通信待ち）とみなす。
const isSearching = trimmedQ !== "" && settledQuery !== q;
```

render のガードを更新。検索中スケルトンを追加し、既存3ブロックへ `&& !isSearching` を足す:

```tsx
      {trimmedQ !== "" && isSearching ? (
        <div role="status" aria-label="検索中" className="grid gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {!isSearching && trimmedQ !== "" && outcome.status === "unresolved" ? (
        /* 既存の unresolved <p> */
      ) : null}

      {!isSearching &&
      trimmedQ !== "" &&
      outcome.status === "candidates" &&
      outcome.candidates.length > 0 ? (
        /* 既存の候補 <ul> */
      ) : null}

      {!isSearching &&
      trimmedQ !== "" &&
      outcome.status === "candidates" &&
      outcome.candidates.length === 0 ? (
        /* 既存の「該当する候補がありません。」<p> */
      ) : null}
```

（空クエリ時のプロンプト `trimmedQ === "" ? ... : null` は既存のまま。）

- [ ] **Step 4: 通過を確認**

Run: `pnpm exec vitest run src/app/search-page.test.tsx`
Expected: PASS（新規 + 既存の autoJump / needs-context / stale ガードすべて緑）

- [ ] **Step 5: 検証ゲート（全体）**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test`
Expected: すべて PASS

- [ ] **Step 6: コミット**

```bash
git add src/app/search-page.tsx src/app/search-page.test.tsx
git commit -m "feat(app): /search に読み込み表示と検索の中断を追加する

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: 実画面確認（Playwright）

**Files:** なし（検証のみ）

- [ ] **Step 1: dev 起動と確認**

`pnpm dev` → `playwright-cli open --headed` で:

1. パレットで文字を打つと、候補が出る前にスケルトン（検索中）が一瞬出る。
2. 高速に打鍵しても検索が過剰に走らない（体感 / `read_network_requests` があれば `/laws` リクエスト数で確認）。
3. `/search?q=民法` で候補前にスケルトンが出る。
4. 既存導線（候補選択→条文遷移、前条→文脈が必要）が回帰していない。
5. デスクトップ幅・モバイル幅でスケルトンのレイアウト崩れ・はみ出しが無い。

memory: playwright-cli-quirks に留意。スクショを撮り PR #87 に `gh image upload` で添付。

- [ ] **Step 2: 検証結果を報告**

全ゲート + 実画面確認の結果を最終報告に記す。

---

## Self-Review 結果

**Spec coverage（spec §→task）:**

- §4.1 listLaws signal → Task 1。§4.2 catalog signal + AbortError rethrow → Task 2。§4.3 quick-search signal → Task 3。§4.4 パレット debounce/loading/abort → Task 4。§4.5 search-page loading/abort → Task 5。§6 テスト → 各 Task に内包。実画面 → Task 6。
- §1「loading を consumer 派生で」→ Task 4/5 の `settledQuery` 派生で実装。「スケルトンで flash 解消」→ Task 4/5 で候補を `!isSearching` ガード。
- §5 中断契約 → Task 2（catalog rethrow）+ Task 4/5（consumer の `signal.aborted` 無視）。

**Placeholder scan:** コード例内の `/* 既存の… */` は「既存 JSX をそのまま移動」の明示的指示であり、対象は現行ファイルに存在する確定コード（プレースホルダではない）。TBD/TODO なし。

**Type consistency:** `signal?: AbortSignal` を `listLaws` 第2引数 → `CatalogSearchService.search` options → `QuickSearchOptions` → consumer 呼び出し、で一貫。`settledQuery` / `isSearching` / `SEARCH_DEBOUNCE_MS` / `resetSearchState` は各 Task 内で定義と使用が一致。`role="status" aria-label="検索中"` はスケルトンとテストで一致。

**lint 回避の要:** `settledQuery` は `.then`/`.catch` 内でのみ setState する設計で、effect 本体の同期 setState（`react-hooks/set-state-in-effect`）を避けている（Global Constraints 参照）。
