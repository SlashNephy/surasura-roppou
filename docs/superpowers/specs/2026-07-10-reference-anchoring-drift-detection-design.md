# 条文参照の二重アンカーと改正検知の設計

Status: Approved (設計検討セッション 2026-07-10)
Last updated: 2026-07-10

関連ドキュメント:

- 上位設計 [改正・基準日の参照設計](2026-07-07-revision-and-asof-design.md) の 2〜4 章・9 章を実装に落とすものである。本書はその実装設計であり、上位設計と矛盾する場合は上位設計を正とする。
- 基準日解決は [基準日による版解決の設計](2026-07-09-base-date-resolution-design.md)（Issue #70、実装済み）を前提にする。
- 対応 Issue: [#71 条文参照の二重アンカーと改正検知を実装する](https://github.com/SlashNephy/surasura-roppou/issues/71)（親 [#3](https://github.com/SlashNephy/surasura-roppou/issues/3)）。
- 依存（解決済み）: [#70 基準日による版解決](https://github.com/SlashNephy/surasura-roppou/issues/70)。
- 後続（本 Issue を Blocking）: [#20](https://github.com/SlashNephy/surasura-roppou/issues/20)、[#28](https://github.com/SlashNephy/surasura-roppou/issues/28)。

## 1. 決定事項の要約

- 保存物の条文参照は **二重アンカー（論理的な条番号 + 作成時 revisionId）+ 指紋検証**で持つ。参照型は新設せず既存 `LawReferenceTarget` を拡張する。
- 参照を開くとき、基準日で解決した現在の条文から指紋を再計算し、保存済み指紋と照合する。不一致・条消失なら「改正の可能性」バッジを出し、見比べ画面で「付け替える」「この版のまま固定する」の 2 択を提供する。
- 実装は 3 層に分ける。**指紋計算（core/domain、純粋・非同期）／解決・検証（core/viewer、純粋）／バッジ・見比べ・修復（ビューワー UI）**。
- 本 Issue のスコープは上記の機構とビューワー UI、および指紋付きアンカーを作って開く導線まで。既存のブックマーク基盤（[#20 保存リストとメモ](https://github.com/SlashNephy/surasura-roppou/issues/20)、完了済み）を土台にし、それが持たない「アンカー（指紋 + revisionId）」を足す。

## 2. スコープ

`#20`（完了済み）は、saved-page のフォームでブックマークを作成・一覧・コレクション化する機能を既に提供している。ただしそのフォームは条文テキストを読み込まないため、`fingerprint` も `revisionId` も持たない未アンカーのブックマークを作る。本 Issue は指紋・アンカー機構と、ビューワー側のアンカー付き保存・改正検知 UI を足す。既存の未アンカー・ブックマークは検証対象外とし壊さない（後方互換）。

| 項目                                                    | 本 Issue #71 | 備考                                                         |
| ------------------------------------------------------- | ------------ | ------------------------------------------------------------ |
| `LawReferenceTarget` への `fingerprint` / `pinned` 追加 | ○（domain）  |                                                              |
| `AnchoredArticleReference` 型                           | ○（domain）  |                                                              |
| 条文指紋計算                                            | ○（domain）  |                                                              |
| article ノード探索・アンカー検証（3 状態）              | ○（viewer）  |                                                              |
| 「改正の可能性」バッジ・見比べ画面・2 択修復            | ○（app UI）  |                                                              |
| ビューワーの「この条文を保存」（指紋付きアンカー作成）  | ○（app UI）  | #20 のフォームは指紋を持てないため新設                       |
| ブックマーク一覧・コレクション・メモ本文の管理 UI       |              | #20 で実装済み。再実装しない                                 |
| 共有向けの版固定 URL（`/laws/:lawId/:revisionId/...`）  |              | 本 Issue 範囲外（将来）。pinned はビューワー内部解決で満たす |
| 復習カード生成                                          |              | #28（OPEN）                                                  |
| 略称・条文参照パーサー（テキストから参照検出）          |              | #24                                                          |

## 3. データモデル（core/domain）

`src/core/domain/references.ts` の `LawReferenceTarget` に 2 フィールドを追加する（optional。既存データ・IndexedDB スキーマに非破壊。DB 版は上げない）。

```ts
interface LawReferenceTarget {
  lawId: string;
  revisionId?: string | null;
  article?: string | null;
  paragraph?: string | null;
  item?: string | null;
  path?: string | null;
  fingerprint?: string | null; // 追加: 条文指紋（4 章）
  pinned?: boolean | null; // 追加: true なら基準日でなく revisionId で解決し、バッジを常設する
}

// 保存物（ブックマーク等）のアンカーが満たす制約。revisionId と fingerprint を必須にする。
type AnchoredArticleReference = ArticleReference & {
  revisionId: string;
  fingerprint: string;
};
```

- 解決キーは階層 path ではなく**論理的な条番号（article、必要なら paragraph / item）**を使う（上位設計 §2）。path は解決に使わない。
- `revisionId` は既定では「作成時にユーザーが見ていた条文」の退避先であり、既定の解決先は基準日である。`pinned === true` のときのみ revisionId が解決先になる。
- アンカー自体は作成時刻を持たない。時刻は親モデル（Bookmark 等）の createdAt / updatedAt に委ねる。

## 4. 条文指紋（core/domain）

新規 `src/core/domain/article-fingerprint.ts`:

```ts
// 条ノードの plainText から改変検知用の指紋を作る。
// NFKC 正規化 → 空白除去 → SHA-256 → 16 進表現の先頭 16 文字。
export const computeArticleFingerprint = async (plainText: string): Promise<string> => {
  /* ... */
};
```

- 対象は参照先の条ノード（Article）の plainText 全文。条後半だけの改正も見逃さないため全文を対象にする。
- 目的は改変検知であり衝突耐性は要求しない。先頭 16 hex（64 bit）で十分。
- **`@/core/search` の `normalizeForSearch` は再利用しない**。あれは照合用に小文字化するが、指紋は改変検知目的なので英字の大文字小文字差も検知したい。上位設計 §3 は「NFKC 正規化 → 空白除去」のみを定めており、小文字化を含めない。したがって本関数は `plainText.normalize("NFKC")` の後、`\s` を除去してからハッシュする。
- ハッシュは Web Crypto（`crypto.subtle.digest("SHA-256", ...)`）で計算する。関数は非同期になる。

## 5. 解決・検証（core/viewer）

純粋関数として実装し、UI から切り離して単体テスト可能にする。

新規 `src/core/viewer/anchor-verification.ts`:

```ts
// 現在解決した nodes から、指定の条番号の Article ノードを引く（枝番はハイフン表現）。
export const findArticleNode = (nodes: LawNode[], article: string): LawNode | undefined => {
  /* ... */
};

export type AnchorStatus = "match" | "drift" | "not_found";

// アンカーの条番号を現在の nodes から解決し、指紋を再計算して照合する。
// 条が見つからなければ not_found、指紋一致で match、不一致で drift。
export const verifyAnchor = async (
  anchor: { article: string; fingerprint: string },
  nodes: LawNode[],
): Promise<AnchorStatus> => {
  /* findArticleNode → computeArticleFingerprint → 比較 */
};
```

`findArticleNode` は既存のビューワーの条番号正規化（`normalizeArticleNumberInput` 相当）と整合させ、ルート/TOC が使う表現と同じ突き合わせにする。

## 6. ビューワー UX（app）

参照を開くときの手順（上位設計 §4 を実装に写したもの）:

1. **版を選ぶ**。既定は基準日で解決する（`asOf`。#70 のローダーを使う）。
2. アクティブな条について、storage からアンカー（該当ブックマーク）を `by-target-key` 索引で引く（`buildArticleReferenceKey` でキーを作る）。アンカーが無い、または `fingerprint` を持たない（#20 のフォーム由来の未アンカー）ならバッジ処理はしない。
   - アンカーが `pinned === true` の場合は、共有 URL を増やさず**ビューワー内部で** revisionId により当該条文を再解決する（ローダーへ revisionId を渡す）。版固定の共有 URL は本 Issue の範囲外（将来）。
3. アンカーがあれば `verifyAnchor` を実行する。
4. `match` ならバッジを出さない（改正があっても当該条文が無傷なら通知しない）。
5. `drift` / `not_found` なら**「改正の可能性」バッジ**を当該条に表示する。
6. バッジから**見比べ画面**へ遷移する。作成時版（`getLaw(anchor.revisionId)` の版固定取得）の条文テキストと、現在の解決先テキストを並置する。`not_found` のときは現在側に「現在の版に該当する条が見つかりません」を表示する。
7. 見比べ画面の選択肢は 2 つに限定する。
   - **新しい条文に付け替える**: アンカーの `fingerprint` を現在の条文の指紋へ、`revisionId` を現在の解決版へ更新し、`pinned` を false にする。`not_found` のときはこの操作を不可にする（付け替え先が無いため）。
   - **この版のまま固定する**: `pinned` を true にし、`revisionId` を作成時版のまま保つ。以後この参照は revisionId 固定で開き、バッジを常設する。
   - いずれも `storage.putBookmark` で親モデル（Bookmark）の target を更新して永続化する。

バッジ・見比べ・修復は独立したビューワーコンポーネントとして実装し、ビューワー本体からアンカー検証の結果（`AnchorStatus` と両版のテキスト）を受け取る。

## 7. アンカー付き保存と開く導線

既存のブックマーク基盤（#20、完了済み）に乗る。#20 の saved-page フォームは条文テキストを読まず指紋を持てないため、指紋付きアンカーはビューワー側で作る。

- **作成**: ビューワーのアクティブ条に「この条文を保存」アクションを置く。現在解決している版の条文 plainText から指紋を計算し、`AnchoredArticleReference`（`lawId` / `article` / `revisionId`＝現在解決版 / `fingerprint`、必要なら `paragraph` / `item`）を target に持つ Bookmark を作り、既存の `storage.putBookmark` で保存する。Bookmark モデル・ストア・saved-page 一覧は #20 のものをそのまま使う。
- **開く**: 既存 saved-page の `BookmarkLink` から条文 URL へ遷移し、ビューワーが §6 の 2〜7 を実行する。既存の未アンカー・ブックマーク（指紋なし）から開いた場合は検証せず、従来どおり表示する。

## 8. データ移行・整合

- `LawReferenceTarget` への `fingerprint` / `pinned` 追加は optional フィールドの追加であり、既存データに非破壊。IndexedDB のオブジェクトストア・索引は変更しないため DB 版（現在 version 2）は上げない。
- 保存済み法令（SavedLaw）は既に revisionId を持つため変更しない。
- 基準日変更で保存済みデータを自動差し替えはしない（上位設計 §6）。旧版のまま学習する使い方（`pinned`）を壊さないことを優先する。

## 9. テスト方針

公開インターフェースを通じて観測できる振る舞いを検証する。

- **指紋計算（単体）**: 既知入力に対する 16 hex 文字列、NFKC でゆれが吸収されること、空白除去、句読点程度の差で不一致になること、英字大文字小文字の差が保持される（＝不一致になる）こと。
- **`findArticleNode`（単体）**: 条番号一致・枝番・不在時 undefined。
- **`verifyAnchor`（単体）**: `match` / `drift` / `not_found` の 3 状態。
- **修復ロジック（単体）**: 「付け替える」で target の fingerprint/revisionId/pinned が更新されること、「固定する」で pinned=true・revisionId 保持になること。
- **ビューワー（コンポーネント）**: `match` でバッジ非表示、`drift` / `not_found` でバッジ表示、見比べ画面の 2 択が target を更新すること。
- **実 API エンドツーエンド（playwright-cli、CLAUDE.md 準拠）**: 改正のあった条文を現行版で保存 → 基準日を改正前へ変更して再オープン → 指紋不一致でバッジ→見比べ→2 択を実画面で確認する。`match`（保存直後の再オープンでバッジ無し）も確認する。対象条文は、実 e-Gov レスポンスで版差（改正前後で plainText が異なること）を事前検証してから確定する。

## 10. 前提と縮退

本設計は e-Gov API v2 が版指定取得（revisionId・asOf）を提供することを前提にする（#70 で検証済み）。前提が崩れた場合は上位設計 §8 の縮退（前回スナップショット比較・旧版側をローカル保存に限定）に従う。
