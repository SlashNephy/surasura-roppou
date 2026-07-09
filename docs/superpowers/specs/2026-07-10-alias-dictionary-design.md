# 略称辞書（Alias Dictionary）の設計

Status: Approved (設計検討セッション 2026-07-10)
Last updated: 2026-07-10

関連ドキュメント:

- [Design Doc](../../design-doc.md) の [7.6 Law Reference Resolver](../../design-doc.md#76-law-reference-resolver) と [11.2 Alias Dictionary](../../design-doc.md#112-alias-dictionary) を実装に落とすものである。
- 対応 Issue: [#22 初期の略称辞書を作る](https://github.com/SlashNephy/surasura-roppou/issues/22)（親 [#4](https://github.com/SlashNephy/surasura-roppou/issues/4)）。
- 依存（解決済み）: [#9 ドメインモデルと条文パスを定義する](https://github.com/SlashNephy/surasura-roppou/issues/9)、[#12 データ取得層を実装する](https://github.com/SlashNephy/surasura-roppou/issues/12)。
- 後続（本 Issue を Blocking）: 条文参照パーサー・候補解決 [#24](https://github.com/SlashNephy/surasura-roppou/issues/24)、query 分類・`/jump` [#31](https://github.com/SlashNephy/surasura-roppou/issues/31)。

## 1. 決定事項の要約

- 学習者が使う**略称**（例: `国賠`）と**正式名称**（例: `国家賠償法`）の両方から、`lawId` と正式名称の候補を引ける辞書を `core/jump` に新設する。
- 辞書エントリは**法令中心**の形 `{ lawId, officialTitle, aliases[] }` とする。既存の `Law` / `LawCatalogEntry`（法令が `aliases[]` を持つ形）と向きを揃える。
- 初期データは **静的・手編集**とし、e-Gov API の `abbrev`（公式略称）を全て取り込んだうえで、e-Gov に無い学習者略称（単字・短縮形）を追加する。ランタイムで e-Gov を叩かない。
- 照合は**正規化後の完全一致**とする。既存の `normalizeForSearch` を再利用し、全角半角・大文字小文字・空白のゆれを吸収する。部分一致は採らない（「民」が「民法」の正式名称に誤ヒットするのを避けるため）。
- `createAliasResolver({ userEntries? })` ファクトリが逆引きインデックスを一度だけ構築し、`resolve(input)` で候補配列を返す。ユーザー辞書は `userEntries` として組込辞書へ加算的にマージする。
- `lawId` は本セッションで e-Gov 実 API により全 13 件検証済み。ただし単体テストは決定的・オフラインに保つため、テストからネットワークは呼ばない。

## 2. スコープ

Issue #22 の作業項目のうち、本 Issue で作るものと担当外を次のとおり分ける。

| 項目                                             | 本 Issue #22            | 担当 |
| ------------------------------------------------ | ----------------------- | ---- |
| 略称辞書 schema の定義                           | ○（`core/jump`）        |      |
| 初期対象の決定・略称登録                         | ○（`core/jump`）        |      |
| official title と lawId の紐づけ                 | ○（`core/jump`）        |      |
| 略称・正式名称から候補を引く純粋関数（Resolver） | ○（`core/jump`）        |      |
| ユーザー辞書を後で足せる拡張点                   | ○（`userEntries` 引数） |      |
| 辞書の単体テスト                                 | ○                       |      |
| 条文番号（`国賠法1条` の `1条`）のパース         |                         | #24  |
| query 分類・`/jump` UI・SearchPalette 配線       |                         | #31  |
| confidence scoring（[11.3]）                     |                         | 将来 |
| 辞書の BFF 配信・遠隔更新（[11.2] 後段）         |                         | 将来 |

`core/jump` は「クリーンな法令名トークン → 候補」の解決のみを提供する。トークンの切り出し（条文番号との分離）は呼び出し側（#24 / #31）が行う。

## 3. アーキテクチャ

```
app（#31 /jump・#24 参照解決）  ← 本 Issue の範囲外。core/jump を呼ぶだけ
   │
   ▼
core/jump  ← 本 Issue #22 の実装対象
   ├─ initialAliasDictionary   … 静的な初期辞書データ（13 法令）
   └─ createAliasResolver      … 逆引きインデックス構築 + resolve()
   │
   └──▶ core/search（normalizeForSearch: 照合用テキスト正規化を再利用）
```

依存方向は `core/jump → core/search / core/domain` の一方向とし、逆流させない。
`core/jump` はストレージにも e-Gov にも依存しない純粋なドメインロジックである。

モジュール構成:

| ファイル                                 | 役割                                                              |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `src/core/jump/alias-dictionary.ts`      | 辞書エントリ型 `AliasDictionaryEntry` と `initialAliasDictionary` |
| `src/core/jump/alias-resolver.ts`        | `createAliasResolver` / 候補型 / 逆引き照合ロジック               |
| `src/core/jump/index.ts`                 | 公開 API のバレル                                                 |
| `src/core/jump/alias-dictionary.test.ts` | 初期データの整合と `resolve` 経由の解決を検証                     |
| `src/core/jump/alias-resolver.test.ts`   | 照合・正規化・ユーザー辞書・曖昧性を検証                          |

## 4. 型定義

```ts
// 辞書エントリは法令中心。1 法令が複数の略称を持つ。
export interface AliasDictionaryEntry {
  lawId: string; // e-Gov lawId（例: 国家賠償法 = "322AC0000000125"）
  officialTitle: string; // 正式名称（例: "国家賠償法"）
  aliases: string[]; // 学習者向け略称。正式名称は含めない
}

// 候補が正式名称と略称のどちらで一致したか。
export type AliasMatchKind = "official" | "alias";

export interface AliasCandidate {
  lawId: string;
  officialTitle: string;
  matchedText: string; // 辞書に登録された、一致した表記（正規化前の原文）
  matchKind: AliasMatchKind;
}

export interface AliasResolverOptions {
  // 組込辞書に加算するユーザー辞書。将来のユーザー編集・BFF 配信の受け口。
  userEntries?: AliasDictionaryEntry[];
}

export interface AliasResolver {
  // クリーンな法令名トークンを候補配列に解決する。未知語・空文字は空配列。
  resolve(input: string): AliasCandidate[];
}

export const createAliasResolver: (options?: AliasResolverOptions) => AliasResolver;
```

## 5. Resolver の挙動

- **インデックス構築（生成時 1 回）**: 組込辞書 → `userEntries` の順に各エントリを走査し、`officialTitle`（kind `"official"`）と各 `alias`（kind `"alias"`）を `normalizeForSearch(text).normalized` をキーとして「キー → 候補配列」の Map に登録する。
- **解決**: `resolve(input)` は入力を同じ正規化にかけ、キー完全一致で候補配列を返す。入力が空/空白のみ、または未知語なら空配列を返す。
- **順序**: 候補は登録順（辞書宣言順、同一エントリ内では `official` → `alias`）で決定的に返す。
- **曖昧性**: 同一正規化キーに複数エントリが載る場合は全候補を返す。初期データに衝突は無いが、`userEntries` で発生しうる。UI 側（#31 / #24）が候補確認で解消する。
- **ユーザー辞書のマージ**: 加算的。同一バケット（正規化キーが同一）内で `(lawId, matchKind)` が同じ候補は重複とみなし畳む（表記ゆれ `matchedText` が違っても実質同一のため。先に登録した表記が残る）。上書き（同一略称の付け替え）は行わない。Resolver は候補を返す責務に徹し、取捨は上位に委ねる。

## 6. 初期辞書データ

Design Doc [11.2] の初期辞書表を基に、e-Gov `abbrev`（本セッションで実 API 取得）を全て取り込み、学習者略称を追加した。

| lawId             | officialTitle              | aliases                | 備考（略称の出所）                  |
| ----------------- | -------------------------- | ---------------------- | ----------------------------------- |
| `321CONSTITUTION` | 日本国憲法                 | 憲, 憲法               | 学習者略称                          |
| `129AC0000000089` | 民法                       | 民                     | 学習者略称                          |
| `132AC0000000048` | 商法                       | 商                     | 学習者略称                          |
| `140AC0000000045` | 刑法                       | 刑                     | 学習者略称                          |
| `408AC0000000109` | 民事訴訟法                 | 民訴法, 民訴           | 民訴法=e-Gov、民訴=学習者           |
| `323AC0000000131` | 刑事訴訟法                 | 刑訴法, 刑訴           | 刑訴法=e-Gov、刑訴=学習者           |
| `405AC0000000088` | 行政手続法                 | 行手法, 行手           | 行手法=e-Gov、行手=学習者           |
| `426AC0000000068` | 行政不服審査法             | 行審法, 行服法, 行審   | 行審法・行服法=e-Gov、行審=学習者   |
| `337AC0000000139` | 行政事件訴訟法             | 行訴法, 行訴           | 行訴法=e-Gov、行訴=学習者           |
| `322AC0000000125` | 国家賠償法                 | 国賠法, 国賠           | 国賠法=e-Gov、国賠=学習者           |
| `322AC0000000067` | 地方自治法                 | 地自法, 地自, 自治法   | 地自法=e-Gov、地自・自治法=学習者   |
| `415AC0000000057` | 個人情報の保護に関する法律 | 個情法, 個人情報保護法 | 個人情報保護法=e-Gov、個情法=学習者 |
| `417AC0000000086` | 会社法                     | （なし）               | 正式名称キーで解決                  |

lawId は e-Gov `/api/2/laws?law_title=...` および `?law_id=...` の実レスポンスで全件検証済み（`abbrev` フィールドも同一レスポンスから取得）。

略称の出所（curated / e-Gov）はスキーマには持たせない（YAGNI）。将来 BFF 同期で出所の区別が要るようになれば、`aliases: string[]` を `{ text, source }[]` へ拡張する余地を残す。

## 7. テスト方針

公開インターフェース（`resolve` と `initialAliasDictionary`）を通じて観測できる振る舞いのみを検証する。ソース文字列の走査や定数の複製比較は行わない。

- **代表解決（table test）**: `国賠`→国家賠償法/`322AC0000000125`/kind `alias`、`行服法`→行政不服審査法、`民`→民法 など、各法令の代表略称が期待の `lawId` / `officialTitle` / `matchKind` に解決される。
- **正式名称の解決**: `国家賠償法`・`会社法` が kind `official` で自エントリに解決される。
- **正規化のゆれ吸収**: 前後空白（`" 国賠 "`）や全角空白を含む入力が解決される。
- **未知語・空入力**: 未登録トークン・空文字・空白のみは空配列。
- **ユーザー辞書**: `userEntries` で新規法令を追加すると解決できる。組込略称と衝突するユーザー略称を足すと、両候補が登録順で返る。
- **データ整合（生成物の検証）**: 全エントリの `lawId` が一意である。各エントリの `officialTitle` を `resolve` に渡すと当該エントリに解決される（正式名称キーが漏れなく張られている保証）。

## 8. 将来拡張（本 Issue 範囲外）

- e-Gov `abbrev` を定期取得して静的辞書の更新差分を提示する**開発時スクリプト**（ランタイム依存は増やさない）。
- 略称ごとの出所メタデータ（curated / e-Gov / user）と、BFF 配信による遠隔更新（[11.2] 後段）。
- confidence scoring（[11.3]）と条文番号パース（#24）との統合。

[11.2]: ../../design-doc.md#112-alias-dictionary
[11.3]: ../../design-doc.md#113-confidence-scoring
