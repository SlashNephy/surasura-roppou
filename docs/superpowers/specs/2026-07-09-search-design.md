# 検索機能の設計

Status: Approved (設計検討セッション 2026-07-09)
Last updated: 2026-07-09

関連ドキュメント:

- [Design Doc](../../design-doc.md) の [7.2 Search](../../design-doc.md#72-search) と [9.4 Storage Strategy](../../design-doc.md#94-storage-strategy) を実装に落とすものである。
- IndexedDB の版管理は [ADR 2026-07-06: IndexedDB storage version 1](../../adr/2026-07-06-indexeddb-storage-version-1.md) の後続として version 2 へ上げる。
- 対応 Issue: [#32 検索機能を実装する](https://github.com/SlashNephy/surasura-roppou/issues/32)（親 [#4](https://github.com/SlashNephy/surasura-roppou/issues/4)）。

## 1. 決定事項の要約

- 検索は **2 系統**からなる。**カタログ検索**（名前・番号・略称でどの法令かを探す）と、**保存済み本文の全文検索**（保存済み法令の中で該当条文を snippet 付きで探す）である。
- カタログ検索は **オンライン優先**とし、e-Gov `/laws` へ委譲して結果を逐次キャッシュする。全法令をローカルへ一括保存はしない。全法令横断は design-doc 7.2 のとおり将来の BFF に委ねる。
- 全文検索は **Bigram（2-gram）転置インデックス**を自前実装する。検索ライブラリや形態素解析辞書は導入しない。
- インデックスは **法令の保存時**に生成して IndexedDB へ永続化する。検索は即時かつ完全オフラインで動く。
- 索引・照合・snippet は**共通の正規化**を通し、正規化文字列と元テキストへの逆引きマップを同時に持つことで位置ズレを構造的に防ぐ。

## 2. スコープ

design-doc 7.2 の項目のうち、本 Issue で作るものと担当外を次のとおり分ける。

| 項目                            | 本 Issue #32          | 担当                     |
| ------------------------------- | --------------------- | ------------------------ |
| 法令名検索・略称検索・番号検索  | ○（`core/search`）    |                          |
| 保存済み法令の横断本文検索      | ○（`core/search`）    |                          |
| snippet 生成                    | ○（`core/search`）    |                          |
| 検索バー UI・`/jump`・query 分類 |                       | #25                      |
| 略称辞書（`国賠`→国家賠償法）   |                       | #22                      |
| 条文参照パーサー・候補解決      |                       | #31 / #24                |
| 全法令のローカル一括保存・BFF   | ×（YAGNI、12 章）     | 将来                     |

`core/search` は検索エンジン層のみを提供し、UI との配線は #25 が行う。

## 3. アーキテクチャ

```
app（#25 検索バー）  ← 本 Issue の範囲外。core/search を呼ぶだけ
   │
   ▼
core/search  ← 本 Issue #32 の実装対象
   ├─ CatalogSearchService   … 名前 / 番号 / 略称でどの法令かを探す
   ├─ FullTextSearchService  … 保存済み本文の該当条文を探す（snippet 付き）
   └─ SearchIndexer          … 保存時に Bigram index を生成・削除・再構築
   │
   ├──▶ core/egov   （listLaws: オンラインカタログ検索を委譲）
   └──▶ core/storage（IndexedDB: カタログキャッシュ + 転置 index を読み書き）
```

依存方向は `core/search → core/egov / core/storage / core/domain` の一方向とし、逆流させない。
IndexedDB スキーマは一元管理のため `core/storage` 側で定義し、`core/search` はそのハンドルを使う。

モジュール構成:

| ファイル                            | 役割                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| `src/core/search/normalize.ts`      | 検索用テキスト正規化と元テキストへの逆引きマップ生成    |
| `src/core/search/bigram.ts`         | Bigram トークナイズ（本文・クエリ両用）                 |
| `src/core/search/snippet.ts`        | マッチ周辺の snippet 生成（ハイライト範囲付き）         |
| `src/core/search/catalog.ts`        | カタログ検索（オンライン委譲 + ローカルキャッシュ照合） |
| `src/core/search/full-text.ts`      | 保存済み本文検索（postings 交差 → 照合 → ランク → snippet） |
| `src/core/search/indexer.ts`        | 保存時の index 生成 / 削除 / 再構築                     |
| `src/core/search/index-repository.ts` | 新ストア（catalog / postings）への型付きアクセス       |
| `src/core/search/index.ts`          | 公開 API のエクスポート                                 |

## 4. データモデルと IndexedDB 変更

IndexedDB を version 1 → 2 へ上げ、オブジェクトストアを 2 つ新設する。
新ストアはいずれも派生データ（キャッシュと索引）なので、migration は空ストアの作成だけで済む。

### 4.1 `lawCatalog`（カタログキャッシュ）

オンラインで取得した法令メタデータを逐次保存し、オフライン時の名前・番号・略称検索の対象にする。

```ts
interface LawCatalogEntry {
  lawId: string;
  title: string;
  lawNumber?: string;
  lawType?: string;
  aliases: string[]; // e-Gov の abbrev（略称）
  cachedAt: ISODateString;
}
// keyPath: "lawId" / index: by-title, by-cached-at
```

よみ（kana）検索は MVP から外す。
Issue #32 のタスク（名前・番号・略称）に含まれず、機能させるには e-Gov 層で `law_title_kana` を取り込む改修が必要なためである（12 章）。

保存済み法令のメタデータも `lawCatalog` にシードし、オフラインでも保存済み法令を名前・番号・略称で引けるようにする。

### 4.2 `searchPostings`（Bigram 転置インデックス）

保存済み本文の全文検索用に、bigram から条文ノード ID への対応表を持つ。

```ts
interface SearchPosting {
  lawId: string;
  bigram: string; // 正規化後の 2 文字
  nodeIds: string[]; // その bigram を含む検索単位ノードの id 群
}
// keyPath: ["lawId", "bigram"] / index: by-bigram, by-law-id
```

postings を **法令ごとに独立キー `[lawId, bigram]`** で持つのが要点である。
bigram 単独キーで法令横断の配列を共有すると、1 法令の保存・削除のたびに他法令と混在した配列を read-modify-write する必要があり、競合とマージが厄介になる。
法令ごとに分ければ、保存は追記のみ、削除は `by-law-id` で一括、検索は `by-bigram` で横断マージと、各操作が独立する。

本文テキストの実体は既存 `lawNodes` ストアに `plainText` として既にあるため、snippet と照合はそこから読む。
postings は「bigram → nodeId」の対応だけを持ち、テキストを二重保存しない。

### 4.3 索引対象の粒度

**条（Article）単位**を基本とし、附則・別表など Article 配下でない本文ノード（`SupplementaryProvision` / `AppdxTable` / `AppdxStyle`）も独立単位として索引する。
項・号は Article の `plainText` に含まれるため個別索引しない。
これにより親子ノードの重複ヒットを避け、結果は「条へジャンプ → snippet で該当項を提示」という UX に揃う。

### 4.4 migration と backfill

version 2 の migration は空ストアを作るだけである。
ただし version 1 時点で既に保存済みの法令には postings が無いため、保存済みなのに postings 未生成の法令を検知して初回に一度だけ再索引（backfill）する（`SearchIndexer.reindexMissing`）。

## 5. 正規化と Bigram

索引・照合・snippet で共通の正規化を使い、オフセットのズレを防ぐ。

```ts
// 正規化文字列と、各正規化文字が元テキストの何文字目由来かの対応を同時に返す
interface NormalizedText {
  normalized: string;
  sourceIndex: number[]; // normalized[i] は元テキストの sourceIndex[i] 文字目由来
}
function normalizeWithMap(text: string): NormalizedText;
```

日本語検索では全角半角・大小文字・NFKC などの正規化で**文字数が変わり得る**（例: `㍿` → `株式会社`）。
素朴に正規化後の文字列で snippet を切ると、元テキスト上の位置とズレる。
そこで正規化文字列と逆引きマップ `sourceIndex` を同時に生成し、索引・照合・snippet はすべて正規化文字列上で行い、表示時だけ `sourceIndex` で元テキストへ戻す。

正規化の内容は次のとおりとする。

- NFKC 正規化（全角英数の半角化、互換文字の分解を含む）。
- 英字は小文字化する。
- 連続する空白・改行は畳み込み、索引・照合では区切りとして扱う。

Bigram は正規化文字列の重なり 2-gram をすべて生成する。
索引と検索が扱うのは**重複を除いた bigram 集合**である。

```ts
function toBigrams(normalized: string): Set<string>; // 重複を除いた bigram 集合
```

ランクの「一致回数」は bigram の数ではなく、6 章の部分一致照合でクエリ文字列の出現回数を数えて求める。
bigram はあくまで候補ノードの絞り込みにだけ使う。

## 6. 全文検索クエリ処理

`FullTextSearchService.search` の流れは次のとおりとする。

1. クエリを `normalizeWithMap` で正規化する。
2. **正規化後 2 文字未満**は index 検索の対象外とし、空結果を返す（UI が「2 文字以上」を促す）。
3. クエリの bigram 集合を作る。
4. 各 bigram を `searchPostings` の `by-bigram` インデックスで引き、nodeId 集合を得る（`lawId` 指定で法令内検索、無指定で保存済み横断）。
5. **全 bigram の nodeId 集合を積集合（AND）**して候補を絞る。
6. 候補ノードを `lawNodes` から読み、正規化文字列上で**クエリの部分一致を実照合**する。
7. ランク付けする（一致回数の多い順、同数なら条番号など保存順の昇順、見出し・caption 一致を加点）。
8. 各ヒットの snippet を生成して返す。

bigram の積集合だけでは連続一致を保証しない。
`ABCD` というクエリの bigram（`AB` `BC` `CD`）が同一ノードに揃っても、それらが離れて出現していれば `ABCD` は存在しない。
ステップ 6 の部分一致実照合が精度を担保する。
bigram index は「候補の高速絞り込み」、substring 照合は「正確性の確定」という二段構えである。

## 7. カタログ検索

`CatalogSearchService.search` は名前・番号・略称から法令候補を返す。

- **オンライン優先**: `egov.listLaws({ title })` および `listLaws({ lawNumber })` に委譲し、結果を `lawCatalog` に upsert キャッシュする。
- **ローカル照合**: `lawCatalog`（キャッシュ + 保存済み法令のシード）を線形走査し、`title` / `aliases` を正規化部分一致、`lawNumber` を正規化一致で照合する。カタログは小規模なので線形で十分であり、将来大きくなれば bigram 化できる。
- **略称**: e-Gov `law_title` は略称もある程度拾う（実測で「国賠」で国家賠償法がヒット）ため online はそれを使いつつ、確実性はローカル `aliases` 照合で担保する。本格的な略称辞書は #22 の担当とし、本 Issue では持ち込まない。
- **出所の付与**: 結果に `source: "online" | "cache"` を付け、オフライン時はキャッシュへフォールバックする。UI が「オフライン: キャッシュ結果」を表示できる。

query の細かな分類（番号らしさの判定、候補画面への振り分け）は #25 の担当である。
`core/search` は名前・番号・略称それぞれで引ける API を提供し、分類結果を受けて呼ばれる側に徹する。

## 8. snippet 生成

```ts
interface SearchSnippet {
  text: string; // 元テキストから切り出した表示用の断片
  highlights: { start: number; end: number }[]; // text 内のマッチ範囲
}
function buildSnippet(
  text: string,
  query: string,
  options?: { radius?: number }, // 既定 40
): SearchSnippet;
```

共通の正規化と `sourceIndex` でマッチ位置を特定し、元テキストからマッチ中心に前後 `radius` 文字を切り出す。
断片の前後には省略記号を付ける。
窓内に複数マッチがあればハイライト範囲を複数返し、装飾は UI に委ねる。
純粋関数なので table testing で検証しやすい。

## 9. 公開 API と保存フロー統合

```ts
// ── カタログ検索
interface CatalogSearchService {
  search(query: string, options?: { online?: boolean; limit?: number }): Promise<CatalogSearchResult>;
}
interface CatalogSearchResult {
  hits: LawCatalogHit[];
  source: "online" | "cache";
}
interface LawCatalogHit {
  lawId: string;
  title: string;
  lawNumber?: string;
  matchedField: "name" | "number" | "alias";
}

// ── 保存済み本文の全文検索
interface FullTextSearchService {
  search(query: string, options?: { lawId?: string; limit?: number }): Promise<SavedTextHit[]>;
}
interface SavedTextHit {
  lawId: string;
  revisionId: string;
  path: string;
  article?: string;
  title?: string;
  snippet: SearchSnippet;
  score: number;
}

// ── 索引ライター（保存 / 削除フックに配線）
interface SearchIndexer {
  indexLaw(document: LawDocumentInput): Promise<void>;
  removeLaw(lawId: string): Promise<void>;
  reindexMissing(saved: { lawId: string }[]): Promise<void>; // backfill
}
```

保存フローとの統合は依存の逆流を避ける形にする。
`createSavedLawUseCase(repository, { indexer? })` に索引フックを注入し、`save` 時に `repository.saveLawDocument()` → `indexer.indexLaw()`、`remove` 時に `repository.deleteLawDocument()` → `indexer.removeLaw()` を呼ぶ。

`core/storage` は汎用の永続化層で、`core/search` は上位である。
`saveLawDocument` の中で直接 bigram を作ると storage が search の実装詳細に依存し、依存が逆流する。
そこで storage 側には「保存後に呼ばれる最小フック（`indexLaw` / `removeLaw` の interface）」だけを持たせ、bigram の中身は search 側の実装に閉じ込める。
これで「保存すれば索引も更新される」一貫性を保ちつつ、層の向きを崩さない。

索引フックの型は `core/storage` 側に最小の interface（`indexLaw` / `removeLaw` を持つ）として定義し、`core/search` の `SearchIndexer` がそれを満たす実装を提供する。
こうすることで `core/storage` は `core/search` を import せず、use-case は storage 側で宣言した型のフックを受け取るだけになる。

## 10. エラー処理・エッジケース

- **オンライン取得失敗（オフライン / ネットワーク）**: ローカルキャッシュへフォールバックし `source: "cache"` を返す。想定外の API エラー（5xx 等）は英語でログし、握り潰さない。
- **空クエリ / 正規化後 2 文字未満（全文）**: 空結果を返す（UI がヒント表示）。
- **保存済みなし / index 空**: 空結果を返す。
- **索引途中失敗**: `indexLaw` は「`by-law-id` で旧 postings 削除 → 再追加」で冪等にし、`reindexMissing` で復旧できる。
- **親子ノードの重複ヒット**: 条単位索引で回避する（4.3）。
- **決定性**: ランクは一致回数と保存順の安定順序のみに依存し、乱数・時刻に依存しない。

## 11. テスト戦略

- **純粋関数（normalize / bigram / snippet / ranking）**: table testing で代表ケースと境界ケースを並べる（全角半角、カナ、空、1 文字、複数マッチ、無マッチ、NFKC で長さが変わる `㍿` などのオフセット検証を含む）。
- **indexer + full-text**: 既存 dev 依存の `fake-indexeddb` を使い、fixture 法令を保存 → 索引 → 検索 → ヒットと snippet を検証する。削除で消えること、backfill 経路も検証する。
- **catalog**: fixture の egov リポジトリと `fake-indexeddb` を注入し、オンライン経路がキャッシュと返却を行うこと、オフライン時にキャッシュへフォールバックすること、重複マージを検証する。
- 実装詳細の文字列探索だけで通るテストは避け、公開 API と変換ロジックの契約を検証する（AGENTS.md 準拠）。
- fixture は `src/test/fixtures/` の既存流儀に合わせる。

## 12. スコープ外（YAGNI）

本 Issue では次を作らない。

- 全法令のローカル一括保存（オンライン委譲で代替）。
- BFF 側検索インデックスによる全法令横断検索（design-doc 上「将来」）。
- 略称辞書そのもの（#22）、条文参照パーサー・候補解決（#31 / #24）、検索バー UI と `/jump`（#25）。
- よみ（kana）検索（e-Gov の `law_title_kana` 取り込みが必要）。
- 形態素解析、あいまい検索（タイポ許容）、高度な言語処理。

## 13. ADR との関係

IndexedDB を version 2 へ上げるにあたり、[ADR 2026-07-06](../../adr/2026-07-06-indexeddb-storage-version-1.md) の規約に従って新規 ADR を追加する。
ADR には次を記録する。

- `lawCatalog` と `searchPostings` を version 2 で新設すること。
- 両ストアが派生データ（キャッシュと索引）であり、migration は空ストア作成 + 保存済み法令の backfill で足りること。
- postings を `[lawId, bigram]` の複合キーで法令ごとに独立させる理由。
