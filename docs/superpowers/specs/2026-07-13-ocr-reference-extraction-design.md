# OCR結果からの条文参照抽出の実装設計

Status: Approved (設計検討セッション 2026-07-13)
Last updated: 2026-07-13

対象 Issue: [#37 OCR結果から条文参照候補を抽出する](https://github.com/SlashNephy/surasura-roppou/issues/37)（親 [#6](https://github.com/SlashNephy/surasura-roppou/issues/6)）

関連ドキュメント:

- [Design Doc](../../design-doc.md) の 7.7 章（OCR Intake）、11 章（Law Reference Resolver Design）、13 章（OCR Design）、14.1 章（Card Generation）に対応する。
- 参照パーサーは [2026-07-10-law-reference-parser-design.md](2026-07-10-law-reference-parser-design.md)、候補解決は [2026-07-10-reference-candidate-resolution-design.md](2026-07-10-reference-candidate-resolution-design.md) の成果物を再利用する。本書はそれらを OCR テキストへ接続する統合層を確定させるものであり、パーサー・解決器の再実装は行わない。
- OCR パイプラインは [2026-07-11-ocr-recognition-design.md](2026-07-11-ocr-recognition-design.md)、スキャナー画面は [2026-07-11-scanner-intake-design.md](2026-07-11-scanner-intake-design.md) の後段に接続する。
- 学習カードのアンカーは [2026-07-12-study-card-foundation-design.md](2026-07-12-study-card-foundation-design.md) の二重アンカー + 指紋を共用する。カード作成 UI は既存の `StudyCardCreateDialog` をそのまま使う。

## 1. 決定事項の要約

- OCR テキストから複数の条文参照を抽出する純関数 `detectLawReferences` を `core/jump` に新設する。**位置表現（第?N条・前条・前項・別表 等）を正規表現で位置特定し、直前の法令名部から辞書最長一致サフィックスを復元してから**、既存の `parseReference` + `resolveReferenceCandidates` に委譲する。行分割だけでは "問題文は民法709条" の "問題文は民法" を未知法令名として食う問題を、この位置特定で回避する。
- 抽出結果は既存ドメイン型 `DetectedLawReference[]` に載せる。型は #33 以前に定義済みで、本書は既存の穴を埋める。
- 候補一覧 UI は新規コンポーネント `OcrReferenceResults` として app 層に置き、OCR `done` フェーズの表示を生テキストから候補一覧へ差し替える。候補ごとに `開く` / `復習に追加` / `無視` を出す（design-doc 13.2）。
- `開く` は既存 `navigateToCandidate` を使う。`復習に追加` は本文へ遷移し、本文ノード確定後に既存 `StudyCardCreateDialog` を自動起動する（OCR 候補段階では指紋計算に必要な本文ノードが未ロードのため、遷移して確定後に開く）。
- OCR セッションは `OcrSession` として `putOcrSession` でローカル保存する。IndexedDB 内のみで送信しない。画像は従来どおり保存しない（保存対象は `sourceText` と検出参照のみ）。
- OCR 由来は常に候補確認を表示し、自動ジャンプはしない（design-doc 11.4）。

## 2. スコープ

#37 で実装するもの（Issue の作業 6 項目に対応）:

- OCR テキスト正規化と複数参照抽出（`detectLawReferences`）。§3。
- 候補一覧 UI（`OcrReferenceResults`）と OCR done フェーズへの接続。§5。
- 候補から本文へのジャンプ（既存 `navigateToCandidate` の再利用）。§5.2。
- 候補の学習カード化（本文遷移 + ダイアログ自動起動）。§6。
- OCR セッションの保存（`putOcrSession`）。§4。

#37 で実装しないもの（後続 Issue / 対象外）:

- 画像上への検出箇所ハイライト（`OcrWord.bbox` 利用）。design-doc 13.2 が挙げるが Issue の作業項目外。後続で扱う。
- クリップボード画像・テキスト貼り付け入力（design-doc 7.7）。本 Issue はカメラ/画像入力の後段に限る。
- OCR セッションの一覧・再表示 UI（`listOcrSessions` は #33 で提供済み。閲覧画面は本 Issue の完了条件に含まれない）。
- 相対参照（前条・同法 等）の周辺文脈からの解決。design-doc 11.4 のとおり未解決候補として表示するに留める。
- 辞書拡張・BFF 配信。

## 3. 参照抽出（core/jump/reference-detector.ts 新設）

### 3.1 公開インターフェース

```ts
export interface DetectLawReferencesOptions {
  resolver?: AliasResolver; // 既定は組込辞書のみ
  source?: LawReferenceDetectionSource; // 既定は { type: "ocr" }
  ocrConfidence?: number; // 0..100。ページ全体の OCR confidence（任意）
}

export const detectLawReferences: (
  text: string,
  options?: DetectLawReferencesOptions,
) => DetectedLawReference[];
```

- 純関数。例外を投げない。参照が無ければ空配列を返す。
- `core/jump/index.ts` から re-export する。

### 3.2 抽出アルゴリズム

1. 入力テキストを行に分割する（OCR は改行を保つ）。行境界を跨ぐ参照は追わない（誤結合を防ぐ）。
2. 各行を正規化前の原文のまま走査し、**位置表現の開始位置**を正規表現で列挙する。位置表現は既存パーサーが解釈できる形（`第?<数>条`（枝番 `の<数>` 反復）、`前条` / `次条`、`第?<数>項` / `前項` / `次項`、`第?<数>号`、`別表第?<数>`、`本文` / `ただし書` / `但書`）。数字はアラビア・漢数字・全角を許す。
3. 各位置表現マッチについて、**直前の法令名部**を上限 K 文字の窓で取り、辞書最長一致サフィックスを求める。窓内の部分文字列を長い順に `resolver.resolve` へ渡し、最初に非空を返した表記を法令名スパンの先頭とする。K は組込辞書の正規化キー最長長（`initialAliasDictionary` から算出）を用いる。
4. 法令名スパン先頭から位置表現末尾までを 1 参照の原文スパン（`rawText`）とし、その部分文字列を既存 `parseReference` に渡す。`parseReference` が `undefined` を返すスパンは捨てる。
5. `parseReference` の結果を `resolveReferenceCandidates` に渡し、`ReferenceResolution` を得る。
6. `ParsedReference` と解決結果から `DetectedLawReference` を構築する。
   - `rawText`: 手順 4 の原文スパン。
   - `normalizedText`: `normalizeForSearch(rawText).normalized`。
   - `lawNameCandidate` / `lawAlias` / `article` / `paragraph` / `item`: `ParsedReference` の対応値（存在時のみ）。
   - `confidence`: `parsed.score`（0..1）。`ocrConfidence` が与えられた場合は `parsed.score * (ocrConfidence / 100)` に減衰させる（OCR の読み取り信頼度を反映。design-doc 11.3 の「OCR confidence」信号）。
   - `source`: options.source（既定 `{ type: "ocr" }`）。
   - `candidates`: `resolved` なら候補配列、`unresolved` なら空配列。
   - `id`: スパンの行 index・開始位置・正規化テキストから決まる決定的 ID（`ocr-<line>-<start>-<normalized>` 等）。ランダム値は使わない（再実行で同じ入力に同じ結果、テスト容易性、セッション再構築の冪等性のため）。
7. 重複排除: `lawId` と条・項・号がすべて同じ候補を持つ検出、または `normalizedText` が同一の検出は、先勝ちで 1 件に畳む。未解決検出（候補空）は `normalizedText` 単位で畳む。
8. 返り値の並びは検出順（行→行内位置の昇順）とし、決定的にする。detector 側ではスコア順に並べ替えない（原文の登場順が学習者の視認と一致するため）。候補内（`candidates` 配列）の順序は `resolveReferenceCandidates` の既存挙動に従う。

### 3.3 未解決の扱い

- 相対参照（法令名なし・前条/前項等）は `resolveReferenceCandidates` が `needs-context` を返す。候補空の `DetectedLawReference` として保持し、UI で「文脈が必要」と示す。
- 絶対参照だが辞書外（`law-not-found`）も候補空で保持し、UI で「法令が特定できない」と示す。
- 参照として成立しない断片（`parseReference` が `undefined`）は検出に含めない。

## 4. OCR セッションの保存（app 層）

- OCR が `done` に達した時点で app 層が `detectLawReferences(result.text, { ocrConfidence: result.confidence })` を実行して検出を得る。`ocrConfidence` にページ全体の OCR confidence を渡し、§3.2 の減衰に反映する。
- 検出を得た時点で `OcrSession` を組み立て、`storageRepository.putOcrSession` で保存する。
  - `id`: `generateStorageId()`。
  - `sourceText`: `result.text`。
  - `detectedReferences`: §3 の `DetectedLawReference[]`。
  - `createdAt` / `updatedAt`: 現在時刻の ISO 文字列。
- 保存はベストエフォート。失敗しても候補表示は継続し、警告に留める（保存できないことが致命でないため。復習カードやブックマークと違い、セッションは補助的な履歴）。警告はスキャナー画面内のインライン表示（`role="alert"`）とする。当初は `sonner` トーストを想定したが、AppShell に Toaster を未マウントのためインライン警告に確定した。
- プライバシー: セッションは IndexedDB ローカルのみで送信しない。画像は保存しない（既存のスキャナーの不変条件を維持）。

## 5. 候補一覧 UI（app/OcrReferenceResults.tsx 新設）

### 5.1 表示

- Props: `references: DetectedLawReference[]`、`sourceText: string`、`storageRepository`、`onNavigate`（テスト用に注入可能な遷移関数。既定は `useNavigate` 由来）。
- 検出 0 件: 「条文参照が見つかりませんでした」と、確認用に生テキスト（既存 OcrPanel done の `<pre>` 相当）と手入力への案内を出す。
- 検出あり: 各 `DetectedLawReference` をカードで並べる。
  - 見出しに `rawText`（原文スパン）を出す。
  - 候補ありは各候補（`LawReferenceCandidate`）を法令名・条項号・スコア・`reason` 配列とともに出し、`開く` / `復習に追加` ボタンを添える。参照単位に `無視` を置く。
  - 候補なし（未解決）は理由（文脈が必要 / 法令が特定できない）を出し、アクションは出さない。
- `無視` はローカル state で当該参照を一覧から隠す（保存済みセッションは変更しない。表示上の整理に留める）。
- アクセシビリティ: 候補一覧は list ランドマーク、各アクションは条文名を含む accessible name（例「民法第709条を開く」）を持たせる。

### 5.2 開く

- `navigateToCandidate(navigate, { lawId, article })` を呼ぶ（既存 `search-navigation.ts`）。`article` 未指定候補は法令トップへ遷移する（既存挙動）。

## 6. 学習カード化（本文遷移 + ダイアログ自動起動）

- `復習に追加` は対象候補の記事ルートへ遷移し、検索パラメータ `study=new` を付与する。
  - `article` を持つ候補のみ対象とする（カードは条文アンカー必須）。`article` 無し候補では `復習に追加` を出さない。
- `law-viewer-page` は記事ルートの検索を `validateSearch` で `{ study?: "new" }` として受け取る。本文ノードのロード後、`study === "new"` かつ対象条ノードが存在すれば `isCardDialogOpen` を true にし、既存 `StudyCardCreateDialog`（アクティブ条ノード・revisionId・指紋計算込み）を開く。
- ダイアログを開いたら検索パラメータを `replace` で除去し、リロードや戻る操作での再起動を防ぐ。
- 対象条ノードが存在しない場合（版差で条が無い等）はダイアログを開かず、既存の「該当条なし」表示に委ねる。

`core` を route 非依存に保つ方針（既存 `search-navigation.ts` のコメント）に従い、`study=new` の付与も app 層に閉じる。

## 7. 依存とレイヤリング

- `core/jump/reference-detector.ts` は `core/jump`（parser / resolver / alias 辞書）と `core/search`（normalize）と `core/domain`（型）に依存する。新規の外向き依存は無い。
- app 層（`OcrReferenceResults`、scanner フロー、law-viewer の study param）が core を配線する。core → app の依存は作らない。

## 8. エラー処理

| 局面                       | 方針                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| 参照抽出                   | 純関数。例外を投げず、成立しなければ空配列。空配列は「見つからない」として UI 分岐する |
| OCR セッション保存の失敗   | インライン警告（role="alert"）に留め、候補表示は継続する（ベストエフォート）           |
| 開くの遷移失敗             | TanStack の navigate に委譲。既存導線と同じ扱い                                        |
| カード化の対象条が版に無い | ダイアログを開かず、ビューアの既存「該当条なし」表示へフォールバック                   |
| OCR 失敗・consent          | 既存 `use-ocr` / `OcrPanel` のフローを変更しない                                       |

## 9. テスト戦略

- `detectLawReferences`（table testing）: 単一参照 / 1 行複数参照（民法709条、710条）/ glued noise（"問題文は民法709条"→民法709）/ 相対参照（前条・同法）/ 辞書外法令 / 別表 / 漢数字・全角 / 枝番（709条の2）/ 条省略形（民709）/ 重複排除 / 検出順の決定性 / 空・空白入力 / `ocrConfidence` 減衰 を、入力テキスト → 期待 `DetectedLawReference[]` の表で検証する。
- `OcrReferenceResults`（Testing Library）: 候補ありの表示とアクション、`開く` が注入 navigate を正しい target で呼ぶこと、`復習に追加` が `study=new` 付き記事ルートへ遷移すること、`無視` で参照が消えること、未解決の理由表示、検出 0 件の空表示と生テキスト fallback を、ユーザー視点の DOM で検証する。
- OCR セッション保存（fake-indexeddb）: done 到達で `putOcrSession` が sourceText と検出参照を含むセッションを保存すること、保存失敗時にインライン警告が出て候補表示が継続することを検証する。
- `law-viewer-page`（Testing Library）: 記事ルートに `study=new` で入ると本文ロード後に `StudyCardCreateDialog` が開くこと、開いた後に param が除去されること、対象条が無い場合に開かないことを検証する。
- 実画面確認: `playwright-cli open --headed` で、画像選択 → OCR → 候補一覧 → 開く（本文遷移）と、候補 → 復習に追加（カードダイアログ自動起動）の一連を確認し、スクリーンショットを PR に添付する。
