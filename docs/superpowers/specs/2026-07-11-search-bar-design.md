# 検索バーの設計

Status: Approved (設計検討セッション 2026-07-11)
Last updated: 2026-07-11

関連ドキュメント:

- [Design Doc](../../design-doc.md) の [6.1 参照ジャンプ](../../design-doc.md#61-参照ジャンプ)、[7.2 Search](../../design-doc.md#72-search)、[11.4 Ambiguity Handling](../../design-doc.md#114-ambiguity-handling)、[15.4 Home Quick Actions](../../design-doc.md#154-home-quick-actions)、[16 Routing / URL Design](../../design-doc.md#16-routing--url-design) を実装に落とすものである。
- 対応 Issue: [#25 検索バーを実装する](https://github.com/SlashNephy/surasura-roppou/issues/25)（親 [#4](https://github.com/SlashNephy/surasura-roppou/issues/4)）。
- 依存（解決済み）: [#15 目次と条文ナビゲーション](https://github.com/SlashNephy/surasura-roppou/issues/15)、[#31 条文参照パーサー](https://github.com/SlashNephy/surasura-roppou/issues/31)、[#24 参照候補の解決](https://github.com/SlashNephy/surasura-roppou/issues/24)、[#32 検索機能](https://github.com/SlashNephy/surasura-roppou/issues/32)。
- 後続（本 Issue が Blocking）: [#30 学習ダッシュボード](https://github.com/SlashNephy/surasura-roppou/issues/30)。
- 消費する上流:
  - [2026-07-10-reference-candidate-resolution-design.md](2026-07-10-reference-candidate-resolution-design.md)（`resolveReferenceInput` / `ReferenceResolution` / `LawReferenceCandidate`）。
  - [2026-07-09-search-design.md](2026-07-09-search-design.md)（`CatalogSearchService` / `LawCatalogHit`）。
  - [2026-07-10-alias-dictionary-design.md](2026-07-10-alias-dictionary-design.md)（`createAliasResolver`）。

## 1. 決定事項の要約

- **URL**: 検索・候補画面は `/search?q=...` とする。Design Doc §16 の Routing/URL Design を正とし、Issue 文言の `/jump?q=...` は `/search` と読み替える。
- **操作モデル**: 既存の `SearchPalette`（コマンドパレット）に統一する。ホームの検索バーも `/` キーも同じパレットを開き、入力中にライブ候補を出す。単一かつ高信頼の参照候補は直接ジャンプ、複数候補は `/search` ページで一覧する（Design Doc §11.4）。
- **候補スコープ**: 参照ジャンプ（`core/jump`）とカタログ検索（`core/search` の法令名・略称・番号）の 2 系統を配線する。保存済み本文の全文検索は本 Issue のスコープ外とし、後続に委ねる。
- **再利用の要**: query 分類と統合候補生成を `core/jump/quick-search.ts` の純粋コーディネータに置く。route も UI も知らない層とし、OCR intake（#37 系）からも同じ入口を再利用できるようにする。完了条件「OCR 結果処理からも再利用できる」を構造で満たす。
- **route 非依存の分離**: 候補（`lawId` / `article` 等の構造）から TanStack Router 遷移先への写像は app 層（`search-navigation.ts`）に置き、core は URL を知らないまま保つ。

## 2. スコープ

| 項目                                                 | 本 Issue #25              | 担当                    |
| ---------------------------------------------------- | ------------------------- | ----------------------- |
| query 分類 + 統合候補生成（`core/jump/quick-search`）| ○                         |                         |
| `/search?q=` ルート・候補画面                        | ○（app）                  |                         |
| `SearchPalette` のライブ候補化                       | ○（app）                  |                         |
| ホーム検索バー → パレット起動                        | ○（app）                  |                         |
| 候補 → 遷移先の写像（`search-navigation`）           | ○（app）                  |                         |
| 単体・コンポーネントテスト                           | ○                         |                         |
| 条文参照パーサー・候補解決                           |                           | #31 / #24（済）         |
| カタログ検索・全文検索エンジン                       |                           | #32（済）               |
| 略称辞書                                             |                           | #22（済）               |
| 保存済み本文の全文検索の配線                         | ×（YAGNI、後続）          | 将来                    |
| paragraph/item 単位のクエリ遷移                      | ×（条レベルまで）         | 後続                    |
| 文脈ベースの相対参照解決（前条→現在条-1 等）         | ×                         | 後続                    |

## 3. アーキテクチャ

```
┌─ core/jump/quick-search.ts（新規・route/UI 非依存・再利用可能） ─┐
│  createQuickSearch({ catalog, resolver })                        │
│    query                                                         │
│      ├─ ① 参照解決  resolveReferenceInput(query)                 │
│      ├─ ② カタログ  CatalogSearchService.search(query)           │
│      └─ ③ 統合・ランキング → QuickSearchOutcome                  │
└──────────────────────────────────────────────────────────────────┘
      ▲ OCR intake（#37 系）も同じ入口を再利用
      │
┌─ app 層 ─────────────────────────────────────────────────────────┐
│  SearchPaletteProvider（開閉状態を AppShell 直下に保持）          │
│  SearchPalette（ライブ候補・/ キー・ホームから open()）          │
│  SearchPage（/search?q= ・多候補の候補画面）                     │
│  search-navigation.ts（候補 → TanStack Router 遷移先）           │
└──────────────────────────────────────────────────────────────────┘
```

`core/jump` は既に `core/search` に依存していないが、本 Issue の coordinator は両者を束ねる。coordinator は catalog service を注入で受け取り、参照解決（同期・純粋）とカタログ検索（非同期・IndexedDB）を統合する。

## 4. core: `core/jump/quick-search.ts`

query を分類し統合候補を返す純粋コーディネータ。catalog service を注入することで、モックで完全にテストできる。

### 4.1 型

```ts
export type QuickSearchCandidateKind = "reference" | "catalog";

export interface QuickSearchCandidate {
  kind: QuickSearchCandidateKind;
  lawId: string;
  lawTitle: string;
  article?: string;    // 参照候補のみ（カタログ候補は法令レベル）
  paragraph?: string;
  item?: string;
  reason: string[];    // 「正式名称『民法』に一致」等、確認 UI 向けの根拠
  score: number;
}

export type QuickSearchOutcome =
  | { status: "candidates"; candidates: QuickSearchCandidate[]; autoJump: boolean }
  | { status: "unresolved"; reason: UnresolvedReason; parsed: ParsedReference }
  | { status: "empty" };

export interface QuickSearch {
  search(
    query: string,
    options?: { limit?: number; online?: boolean },
  ): Promise<QuickSearchOutcome>;
}

export function createQuickSearch(deps: {
  catalog: CatalogSearchService;
  resolver?: AliasResolver;
}): QuickSearch;
```

### 4.2 分類・統合ロジック（Design Doc §11.4 準拠）

1. `query.trim()` が空なら `{ status: "empty" }`。
2. **参照解決**: `resolveReferenceInput(trimmed, { resolver })`。
   - `status: "resolved"` → 候補を `QuickSearchCandidate`（kind: `"reference"`）へ変換。`LawReferenceCandidate` の `lawId` / `lawTitle` / `article` / `paragraph` / `item` / `reason` / `score` をそのまま引き継ぐ。
   - `status: "unresolved"` → 理由（`needs-context` / `law-not-found`）を保持して次へ進む。
3. **カタログ検索**: `catalog.search(trimmed, { online, limit })`。`LawCatalogHit` を `QuickSearchCandidate`（kind: `"catalog"`、`matchedField` を `reason` 文言へ）へ変換。
4. **統合**: 参照候補（具体度が高い）を上位、カタログ候補を下位に並べる。参照候補どうし・カタログ候補どうしは既存の `score` 降順を保つ。
5. **autoJump**: 候補列がちょうど 1 件でそれが参照候補、かつ `score` が閾値以上のときのみ `true`。複数・カタログ単独・低スコアはすべて `false`（候補画面で確認させる）。閾値は定数で定義し、根拠をコメントする（参照 parse score は 0..1。曖昧な単一 alias を誤爆ジャンプさせない値を選ぶ）。
6. **全滅時**: 候補が 0 件で、かつ参照解決が `unresolved` だったなら `{ status: "unresolved", reason, parsed }` を返す（相対参照は文脈が必要、辞書外は該当法令なし、と UI が説明できる）。参照も試みられず候補も 0 件なら `{ status: "candidates", candidates: [], autoJump: false }`（該当なし表示）。

## 5. app: `search-navigation.ts`

core を route 非依存に保つため、候補 → 遷移先の写像を app 層に置く。

- 参照候補（`article` あり）→ `{ to: "/laws/$lawId/articles/$article", params: { lawId, article } }`
- 参照候補（法令レベル）・カタログ候補 → `{ to: "/laws/$lawId", params: { lawId } }`

`paragraph` / `item` は現行の article ルートにクエリ定義がないため、本 Issue では条レベルまでを遷移対象とする。

## 6. app: `/search` ルート（候補画面）

- `router.tsx` に `path: "search"` を追加。`validateSearch` で `{ q?: string }` をパースする（初の `validateSearch` 導入箇所）。
- `SearchPage`:
  - `useSearch` で `q` を取得し `QuickSearch.search` を実行。
  - `status: "candidates"` → 候補を「条文へジャンプ」「法令を開く」にグルーピングして `Link` で列挙。
  - `autoJump === true` → 単一候補の遷移先へ `replace` 遷移。
  - `status: "unresolved"` → 理由に応じた説明（相対参照は文脈が必要 / 該当法令なし）。
  - 空クエリ・読み込み中・0 件をそれぞれ区別して表示。
- `/search` は結果ページであり主要ナビ導線ではないため、`routes.ts` の `PrimaryRoute` には加えない。

## 7. app: `SearchPalette` の改修

- 入力を制御 state 化し、デバウンス（既定 UI 応答性を損なわない範囲）して `QuickSearch.search` を呼ぶ。
- 候補を `CommandGroup` で「条文へジャンプ」（reference）「法令を開く」（catalog）に分けて `CommandItem` 表示。
- 候補選択 → `search-navigation` の遷移先へナビゲートしパレットを閉じる。
- 末尾に「『{q}』で検索」項目を置き、`/search?q=` へ遷移（多候補の一覧を明示的に開く導線）。
- クエリが空のときは既存の「移動」グループ（法令 / 撮る / 復習 / 設定）を表示（現行挙動を維持）。
- 既存のアクセシビリティ（`/` ショートカット、編集中入力の除外、可視ラベル）を維持する。

## 8. app: ホーム検索バーとパレット開閉状態

「パレット統一」を実現するため、パレットの開閉状態を `AppShell` 直下の **`SearchPaletteProvider`（React Context）** に持ち上げる。

- `SearchPalette` は Context から `isOpen` / `setOpen` を得る。`/` キーハンドラとダイアログは 1 箇所のまま。
- ホーム検索バー（現状 `/laws` へのリンク）を、`open()` を呼ぶトリガーボタンへ置き換える。二重の `/` ハンドラ・二重ダイアログを避ける。
- 見た目（プレースホルダ「国賠法1条、民709、行政手続法14条…」）は現行を踏襲する。

## 9. テスト方針

- **core `quick-search.test.ts`**（table test、catalog service はモック）:
  - 単一の確定参照（例「民709」）→ `candidates` 1 件・`autoJump: true`。
  - 曖昧な参照（1 alias が複数法令）→ 複数候補・`autoJump: false`。
  - カタログ一致（法令名・略称・番号）→ kind `catalog` 候補。
  - 参照 + カタログ両方ヒット → 参照が上位に並ぶ。
  - 相対参照（前条 等）→ `unresolved` / `needs-context`。
  - 辞書外の絶対参照でカタログ該当あり → カタログ候補を返す。辞書外でカタログも 0 → `unresolved` / `law-not-found`。
  - 空クエリ → `empty`。
- **app**:
  - `SearchPalette`: 入力で候補が現れ、選択で該当ルートへ遷移する。「『{q}』で検索」で `/search?q=` へ遷移する。
  - `SearchPage`: `q` から候補が描画される。単一高信頼候補で該当条文へ自動遷移する。`unresolved` の説明が表示される。
  - `router`: `/search` ルートが解決する。
- 検証ゲート: `pnpm run typecheck` / `lint` / `format:check` / `test`。UI 導線を変えるため `playwright-cli open --headed` でホーム → 検索 → 候補 → 条文遷移を実画面確認し、スクショを PR へ添付する。

## 10. 未解決・後続に委ねる点

- 全文検索（保存済み本文）の検索バー配線。
- paragraph / item 単位のクエリ遷移（article ルートのクエリ定義拡張が前提）。
- 文脈ベースの相対参照解決（前条・同法・前項）。
- Design Doc §11.3 の外部ランキング信号（最近開いた法令・履歴・学習科目）。今回は参照 parse score とカタログ score のみ。
