# 参照候補の解決の設計

Status: Approved (設計検討セッション 2026-07-10)
Last updated: 2026-07-10

関連ドキュメント:

- [Design Doc](../../design-doc.md) の [11.3 Confidence Scoring](../../design-doc.md#113-confidence-scoring) と [11.4 Ambiguity Handling](../../design-doc.md#114-ambiguity-handling) を実装に落とすものである。
- 対応 Issue: [#24 参照候補の解決を実装する](https://github.com/SlashNephy/surasura-roppou/issues/24)（親 [#4](https://github.com/SlashNephy/surasura-roppou/issues/4)）。
- 依存（解決済み）: [#13 本文データを LawNode ツリーへ正規化](https://github.com/SlashNephy/surasura-roppou/issues/13)、[#22 初期の略称辞書](https://github.com/SlashNephy/surasura-roppou/issues/22)、[#31 条文参照パーサー](https://github.com/SlashNephy/surasura-roppou/issues/31)。
- 後続（本 Issue が Blocking）: [#25 検索バー](https://github.com/SlashNephy/surasura-roppou/issues/25)。
- 消費する上流: [2026-07-10-law-reference-parser-design.md](2026-07-10-law-reference-parser-design.md)（`ParsedReference`）、[2026-07-10-alias-dictionary-design.md](2026-07-10-alias-dictionary-design.md)（`createAliasResolver`）。

## 1. 決定事項の要約

- **責務**: `ParsedReference`（#31 の出力）を受け取り、法令名/略称テキストを `lawId` 候補へ解決してスコア付きの候補列を返す純粋関数 `resolveReferenceCandidates` を `core/jump` に新設する。
- **遅延検証**: `lawId` の解決と `lawTitle` 付与・ランキングに専念する。条番号に対応する `LawNode` の実取得・存在検証は行わない（ビューアー遷移時に既存経路で解決する）。ネットワークにもストレージにも依存しない純粋なドメインロジックとする。
- **相対参照は未解決候補**: 法令名を持たない相対参照（前条/同法/前項/本文/別表/法令なし数字列）は、文脈がなければ `lawId` に解決できない。design-doc 11.4 に従い `unresolved`（文脈が必要）として返す。文脈ベースの実解決は後続に委ねる。
- **ランキング信号は parse score + 一致種別のみ**: 候補スコアは #31 の `parsed.score` をそのまま採る（official/alias の一致種別は既に parse score の基底に織り込まれている）。最近開いた法令・保存法令・履歴などの外部信号（11.3）は本 Issue では入れず、将来の加点フックとして構造だけ残す。
- **出力型は既存の `LawReferenceCandidate`（`core/domain`）を再利用**: 旧 resolver spec の rank 化は supersede 済みで、`core/domain/models.ts` の `LawReferenceCandidate` は `score: number` のまま現行方針と整合している。#37（OCR）が既にこの型を参照しており、本 Issue がその最初の実プロデューサになる。

## 2. スコープ

| 項目                                          | 本 Issue #24 | 担当                     |
| --------------------------------------------- | ------------ | ------------------------ |
| alias/正式名称テキストから `lawId` 候補を解決 | ○            |                          |
| 曖昧（1 alias が複数法令）を候補列で表現      | ○            |                          |
| parse score + 一致種別でランキング            | ○            |                          |
| `reason[]`（確認 UI 向けの根拠文字列）生成    | ○            |                          |
| 相対参照・辞書外法令名の未解決表現            | ○            |                          |
| `ParsedReference` 引き継ぎ（条・項・号）      | ○            |                          |
| 単体テスト                                    | ○            |                          |
| `LawNode` の実取得・条存在検証                |              | ビューアー遷移時（既存） |
| 文脈ベースの相対解決（前条→現在条-1 等）      |              | 後続                     |
| 最近/保存/履歴のランキング信号（11.3）        |              | 将来（構造のみ用意）     |
| 自動ジャンプ閾値の判定                        |              | UI（#25 / ビューアー）   |

`core/jump` の依存方向は `core/jump → core/search / core/domain / shared/utils` の一方向を保つ。

## 3. アーキテクチャ

```text
ParsedReference (#31)
  → 法令テキストの判定（lawNameCandidate / lawAlias / なし）
  → createAliasResolver.resolve() で lawId 候補へ（official / alias / 未知 / 相対）
  → parse score + 一致種別でランキング（score 降順、同点は登録順）
  → reason[] 生成
  → ReferenceResolution（resolved 候補列 | unresolved{reason}）
```

再利用する既存資産:

- `createAliasResolver` / `AliasResolver` / `AliasCandidate`（`core/jump`, #22）: クリーンな法令名トークン → `{ lawId, officialTitle, matchedText, matchKind }[]`。曖昧なら複数返す。
- `LawReferenceCandidate` / `ArticleReference`（`core/domain`）: 出力候補の型。
- `parseReference` / `ParsedReference`（`core/jump`, #31）: 便利ラッパーが `input: string` を受ける経路で使う。

## 4. 出力型

```ts
// 解決結果。候補が得られたか、文脈不足・辞書外で未解決かを判別する。
export type ReferenceResolution =
  | { status: "resolved"; candidates: LawReferenceCandidate[] } // 1 件以上、score 降順
  | { status: "unresolved"; reason: UnresolvedReason; parsed: ParsedReference };

export type UnresolvedReason =
  // 相対参照（法令名を持たない）。周辺文脈がないと lawId を決められない。
  | "needs-context"
  // 絶対参照だが法令名が辞書に無い。名称検索への導線を出す想定。
  | "law-not-found";

export interface ResolveReferenceOptions {
  // 分類・解決に使う resolver。既定は組込辞書のみ。
  resolver?: AliasResolver;
}

export const resolveReferenceCandidates: (
  parsed: ParsedReference,
  options?: ResolveReferenceOptions,
) => ReferenceResolution;

// 便利ラッパー。文字列 → parse → 候補解決。パース不能なら unresolved: law-not-found 相当ではなく undefined を返す。
export const resolveReferenceInput: (
  input: string,
  options?: ResolveReferenceOptions,
) => ReferenceResolution | undefined;
```

`LawReferenceCandidate`（`@/core/domain`、既存）を再利用:

```ts
interface LawReferenceCandidate extends Partial<ArticleReference> {
  lawId: string;
  lawTitle: string; // = AliasCandidate.officialTitle
  score: number; // = parsed.score
  reason: string[]; // 例: ["略称『民』に一致", "第709条"]
  // article / paragraph / item は Partial<ArticleReference> 経由で parsed から引き継ぐ
}
```

- 候補には具体的な条・項・号のみ載る。相対シフト値 `"previous"` / `"next"` を持つ候補は作らない。パーサーは `kind` を法令名の有無だけで決めるため、`民法前条` のように法令名 + 相対シフトの入力は `kind: "absolute"` かつ `article: "previous"` になりうる。この場合は基準となる現在位置がないと条を確定できないため、候補化せず `unresolved: needs-context` を返す（§5 参照）。
- `article` の枝番ハイフン表現（`242-2`）は parse の値をそのまま使い、変換を挟まない（既存 `buildLawArticleUrl` の `:article` と同一表現）。

## 5. 解決ロジック

`parsed` の状態で分岐する（`resolver.resolve()` は正規化後の完全一致で候補配列を返す）。

| `parsed` の状態                              | 解決                        | 結果                                   |
| -------------------------------------------- | --------------------------- | -------------------------------------- |
| 法令なし（`kind === "relative"`）            | —                           | `unresolved: needs-context`            |
| 条/項が相対シフト（`"previous"` / `"next"`） | —                           | `unresolved: needs-context`            |
| `lawAlias` あり                              | `resolve(lawAlias)`         | `resolved`（alias 候補、曖昧なら複数） |
| `lawNameCandidate` あり & 辞書一致           | `resolve(lawNameCandidate)` | `resolved`（official 候補）            |
| `lawNameCandidate` あり & 辞書外             | `resolve()` → `[]`          | `unresolved: law-not-found`            |

判定は上から順に行う（相対参照・相対シフトを先に弾いてから法令名を解決する）。

- **候補の構築**: 各 `AliasCandidate` から `{ lawId, lawTitle: officialTitle, article: parsed.article, paragraph: parsed.paragraph, item: parsed.item, score: parsed.score, reason }` を作る。`article` 等は値があるときのみ載せる（`Partial<ArticleReference>`）。
- **ランキング**: `score` 降順に整列。同点（同一 alias が複数法令に解決するケース等）は `resolver.resolve()` の返却順（辞書登録順）で決定的に保つ。将来の外部信号は「基底 score を保ったまま加点する」フックとして関数を分けておく。
- **reason 生成**: 一致種別（`matchKind`）と `matchedText`、条項号の有無から日本語文字列を組み立てる。例: official → `正式名称『国家賠償法』に一致`、alias → `略称『民』に一致`、条があれば `第709条` を追加。
- **閾値による自動ジャンプ判定は行わない**（11.4 の「候補 1 件かつ score が閾値以上なら直接ジャンプ」は UI の責務）。本関数は候補とスコアを返すのみ。

## 6. ファイル構成

| ファイル                                   | 役割                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `src/core/jump/candidate-resolver.ts`      | `resolveReferenceCandidates` / `resolveReferenceInput` / 型 / ランキング / reason 生成 |
| `src/core/jump/candidate-resolver.test.ts` | table test（絶対/略称/曖昧/辞書外/相対/法令のみ/条項号引き継ぎ/score 引き継ぎ/決定性） |
| `src/core/jump/index.ts`                   | `resolveReferenceCandidates` / `resolveReferenceInput` / 型の export 追加              |

## 7. テスト方針

公開インターフェースの振る舞いのみを検証する。ソース走査や定数複製比較は行わない。resolver はテスト内で組込辞書の実体を使い、ネットワークは呼ばない。

- **絶対・正式名称**: `国家賠償法第1条` の parse 結果 → `resolved`、候補 1 件、`lawId` = 国家賠償法、`lawTitle`、`article: "1"`、`score` は parse score と一致。
- **絶対・略称**: `民709` → `resolved`、`lawId` = 民法、`article: "709"`。
- **曖昧**: `userEntries` で同一略称を複数法令に張った resolver を注入し、候補が複数・登録順で返ることを検証。
- **辞書外**: 辞書に無い法令名の parse 結果 → `unresolved: law-not-found`。
- **相対**: `前項` / `同条第一号` / `本文` の parse 結果 → `unresolved: needs-context`。
- **法令のみ**: `国家賠償法`（article なし）→ `resolved`、候補に `article` が載らない。
- **条項号引き継ぎ**: `民法709条1項1号` → 候補に `article/paragraph/item` が引き継がれる。
- **score 引き継ぎ**: 候補 `score` が `parsed.score` と一致する。
- **reason**: official/alias で期待する日本語根拠が含まれる。
- **便利ラッパー**: `resolveReferenceInput("民709")` が同じ候補を返し、パース不能な入力（空文字）で `undefined`。
- **決定性**: 同一入力で常に同一結果。

## 8. 対象外（明示）

- `LawNode` の実取得・条存在検証（ビューアー遷移時の既存経路が担う）。
- 文脈ベースの相対参照解決（前条 → 現在条 -1、同法 → 現在法令 等）。
- 最近/保存/履歴などランキングの外部信号（11.3、将来の加点フックのみ用意）。
- 自動ジャンプ閾値の判定（UI）。
- 自由文中の複数参照の検出（#37 / #25）。
