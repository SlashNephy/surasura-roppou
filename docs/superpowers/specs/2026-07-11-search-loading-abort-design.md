# 検索の読み込み表示・デバウンス・中断の設計

Status: Approved (設計検討セッション 2026-07-11)
Last updated: 2026-07-11

関連ドキュメント:

- [Design Doc](../../design-doc.md) の [6.1 参照ジャンプ](../../design-doc.md#61-参照ジャンプ)（「読み込み中」を独立状態として挙げる）と [7.2 Search](../../design-doc.md#72-search) を補完する。
- 上流: [2026-07-11-search-bar-design.md](2026-07-11-search-bar-design.md)（本設計はその後続 polish）。対応 PR: [#87](https://github.com/SlashNephy/surasura-roppou/pull/87)（本 PR に積む）。
- 消費する既存実装: `CatalogSearchService`（`core/search`）、`QuickSearch`（`core/jump`）、`LawRepository.listLaws`（`core/egov`）。

## 1. 決定事項の要約

- **Loading は consumer 側で持つ**。`QuickSearchOutcome` に `"loading"` は追加しない。コーディネータは loading を返さない（Promise 解決前の一時状態であり UI の関心事）。`SearchPage` / `SearchPalette` に `isSearching` 状態を持たせる。
- **スケルトンで空白とフラッシュを同時に解消**。`isSearching` の間は stale な候補の代わりにスケルトン（`src/shared/ui/skeleton.tsx`）を表示する。これにより通信待ちの空白（loading）と、クリア→新クエリ入力時の旧候補フラッシュの両方を消す。
- **パレットに 200ms デバウンス**。タイプが止まってから検索を走らせる。`/search` は `q` がナビゲーション時のみ変わるため不要。
- **`AbortSignal` を貫通**。`QuickSearch.search` → `CatalogSearchService.search` → `LawRepository.listLaws` → `fetcher` へ `signal` を渡し、consumer は検索ごとに `AbortController` を作って effect cleanup で `abort()` する。
- **中断は正常系**。`AbortError` はログもフォールバックもしない。`catalog.ts` は現状「全エラーでキャッシュへフォールバック」なので、`AbortError` はフォールバック前に rethrow する。
- **スコープは最小**。`signal` は `listLaws`（catalog の唯一のオンライン呼び出し）のみ。他の `LawRepository` メソッドと `QuickSearchOutcome` 型は変更しない。

## 2. スコープ

| 項目                                                | 本 polish  | 担当 / 備考                |
| --------------------------------------------------- | ---------- | -------------------------- |
| `/search` と パレットの読み込み中スケルトン         | ○          |                            |
| stale 候補フラッシュの解消（スケルトンで代替）      | ○          |                            |
| パレットの 200ms デバウンス                         | ○          |                            |
| `AbortSignal` 貫通（catalog → listLaws → fetch）    | ○          |                            |
| `AbortError` の握り潰し回避・rethrow                | ○          |                            |
| `QuickSearchOutcome` への `loading` 追加            | ×（YAGNI） | consumer 側 state で表現   |
| `listLaws` 以外の `LawRepository` メソッドへ signal | ×          | 将来必要になれば           |
| 全文検索の配線                                      | ×          | Issue #25 と同様スコープ外 |

## 3. データフロー（AbortSignal）

```
SearchPalette / SearchPage
  └ 検索起動: const controller = new AbortController()
  └ QuickSearch.search(q, { signal: controller.signal })
       └ CatalogSearchService.search(q, { online, limit, signal })
            └ fetchOnline(lawRepository, q, limit, signal)
                 └ lawRepository.listLaws({ title, limit }, { signal })
                      └ fetcher(url, { headers, signal })
  └ effect cleanup: controller.abort()   // クエリ変更・アンマウント時
```

`AbortError` は `search` 呼び出し側（consumer の `.catch`）まで伝播し、そこで無視する（`error instanceof DOMException && error.name === "AbortError"`、または `signal.aborted` で判定）。

## 4. 変更点

### 4.1 core/egov `repository.ts`

- `listLaws(query?: LawListQuery, options?: { signal?: AbortSignal }): Promise<LawListResult>` に第2引数を追加（後方互換。既存呼び出しは無変更）。
- 内部の `fetcher(url, { headers: { accept: "application/json" } })` に `signal: options?.signal` を追加。

### 4.2 core/search `catalog.ts`

- `CatalogSearchService.search(query, options?: { online?; limit?; signal? })` に `signal` を追加。
- `fetchOnline(lawRepository, query, limit, signal)` に `signal` を渡し、`lawRepository.listLaws({ title/lawNumber, limit }, { signal })` へ伝播。
- `try/catch` を修正: `catch` の先頭で「`signal?.aborted` または `AbortError`」なら **rethrow**（キャッシュフォールバックに進まない）。それ以外のエラーは従来どおり `console.warn` + キャッシュフォールバック。

### 4.3 core/jump `quick-search.ts`

- `QuickSearch.search(query, options?: { limit?; online?; signal? })` に `signal` を追加し、`catalog.search(trimmed, { online, limit, signal })` へ渡す。
- autoJump 短絡（参照のみで確定）時は catalog を呼ばないため signal は未使用でよい（挙動不変）。

### 4.4 app `SearchPalette.tsx`

- 200ms デバウンス: `useDeferredValue` を、`query` を 200ms 遅延させる小フック / インライン effect（`setTimeout` + クリア）へ置換。定数 `SEARCH_DEBOUNCE_MS = 200` に理由コメント。
- `isSearching` 状態: デバウンス後の検索起動で true、解決/中断で false。
- 検索 effect: `AbortController` を作り `quickSearch.search(q, { signal })`、cleanup で `abort()`。`.catch` は `AbortError` を無視、それ以外は英語ログ + 空候補フォールバック（既存踏襲）。
- 描画: `query` 非空かつ `isSearching` のとき、候補/unresolved の代わりにスケルトン行（`Skeleton`）を数個表示。空クエリ時は従来どおり「移動」グループ。

### 4.5 app `search-page.tsx`

- `isSearching` 状態と `AbortController` を同様に導入。
- 描画: 既存の `trimmedQ !== ""` ガードに加え、`isSearching` の間はスケルトンを表示し、候補/unresolved/該当なしは非表示にする。

## 5. エラー・中断ハンドリングの契約

- **中断（AbortError）**: consumer の `.catch` で無視。`isSearching` は cleanup 側で false に戻さない（新しい検索が即座に true にするため）。実害のない no-op。
- **通信失敗（非 Abort）**: `catalog.ts` がキャッシュへフォールバック（英語 `console.warn`）。consumer までエラーが漏れた場合は英語 `console.error` + 空候補フォールバックで「該当なし」表示（既存踏襲）。
- **中断とキャッシュの相互作用**: 中断時に catalog がキャッシュ探索へ進むと無駄なので、`AbortError` は catalog でフォールバック前に rethrow する（4.2）。

## 6. テスト方針（TDD）

- **core/egov**: `listLaws(query, { signal })` が `fetcher` へ `signal` を転送する（スタブ fetcher が受領を検証）。
- **core/search catalog**: (a) `search(q, { signal })` が `listLaws` へ `signal` を渡す、(b) 既に aborted な signal では `AbortError` を投げ、キャッシュ（`listCatalog`）を呼ばない。
- **core/jump quick-search**: `search(q, { signal })` が `catalog.search` へ `signal` を渡す（モック catalog で検証）。autoJump 短絡時は catalog 未呼び出し（回帰）。
- **app SearchPalette**: (a) 連続入力で検索が 1 回だけ走る（デバウンス。fake timers または `waitFor`）、(b) 遅延解決する fake quickSearch を注入し `isSearching` 中スケルトンが出る、(c) 解決後に候補が出てスケルトンが消える。
- **app SearchPage**: 遅延解決でスケルトン表示、解決後に候補。既存の autoJump / needs-context / stale ガードのテストは回帰なし。
- 振る舞い（描画・呼び出し引数）を検証し、モックの内部実装は検査しない。

## 7. 未解決・後続に委ねる点

- `getLawData` など他 `LawRepository` メソッドの中断対応（本 polish では不要）。
- スケルトンの見た目の作り込み（行数・アニメーション）は最小限とし、必要なら別途調整。
