# 学習カード基盤の実装設計

Status: Approved (設計検討セッション 2026-07-12)
Last updated: 2026-07-12

対象 Issue: [#33 学習カード基盤を実装する](https://github.com/SlashNephy/surasura-roppou/issues/33)

関連ドキュメント:

- [2026-07-07-study-scheduling-design.md](2026-07-07-study-scheduling-design.md) で確定したデータ設計を実装に落とす。本書はその実装詳細を確定させるものであり、データモデルの再定義は行わない。
- [Design Doc](../../design-doc.md) の 7.8 章、14 章、15.1 章、16 章に対応する。
- 条文アンカーは [2026-07-07-revision-and-asof-design.md](2026-07-07-revision-and-asof-design.md) の二重アンカー + 指紋を共用する。

## 1. 決定事項の要約

- IndexedDB を version 3 へ上げ、確定済み設計 8 章の移行 4 ステップ（ストア新設、StudyCard のスケジュール系フィールド除去、QuizResult → ReviewLog 変換、CardSchedule 再計算）を単一の versionchange トランザクションで一度に行う。
- スケジューラ `fixed-interval@1` を `core/study` の純関数として実装し、移行時の再計算と `recordReview` の両方から使う。
- カード作成の起点は法令ビューアの条文のみとする。作成 UI はダイアログ、一覧は `/study/cards`、詳細・編集・削除は `/study/cards/$cardId` に置く。
- カード種別は design-doc 10 章の 7 種から選択式とし、入力フォームは question / answer / explanation の自由記述で共通化する。
- 新規カードは CardSchedule を持たない。「未学習 = cardSchedules に行がない」を不変条件とする。
- カード削除はカスケード削除とする（reviewLogs / cardSchedules も同一トランザクションで削除する）。

## 2. スコープ

#33 で実装するもの:

- ドメインモデルの改訂（ReviewLog / CardSchedule 追加、StudyCard 改訂、QuizResult 廃止、StudySession 縮小）。
- IndexedDB v3 スキーマと移行。
- リポジトリ API の追加・改訂（5 章）。
- スケジューラ `fixed-interval@1`（6 章)。
- カード作成ダイアログ、一覧ページ、詳細・編集ページ、StudyPage の導線（7 章）。
- Export version 2（9 章）。

#33 で実装しないもの（後続 Issue の領分）:

- 条文からのクイズ自動生成（#28）。
- 復習画面での出題・回答 UI と StudySession の運用（#29）。`recordReview` API の提供までを #33 が担う。
- 状態ラベル（未学習・復習中・苦手・定着）の表示とダッシュボード（#30）。
- 科目別パック（#34）。
- Import 機能（export の新形式化のみ行う。import 時の v1 → v2 変換は import 機能の Issue で扱う）。

## 3. ドメインモデルの変更（core/domain/models.ts）

確定済み設計 2 章の型をそのまま導入する。

- `ReviewLog` と `CardSchedule` を追加する。
- `StudyCard` から `dueAt` / `intervalDays` / `ease` / `mistakes` / `lastReviewedAt` を除去し、`examPinned: boolean` を追加する。
- `QuizResult` を削除する。`QuizRating` は `ReviewLog.grade` の型として名前を残す。
- `StudySession` から `results` を除去し、id / startedAt / finishedAt / cardIds のメタデータに縮小する。

## 4. IndexedDB v3 と移行

`surasuraDatabaseVersion` を 3 に上げる。ストア構成:

| ストア                | keyPath | インデックス                                                |
| --------------------- | ------- | ----------------------------------------------------------- |
| studyCards（改訂）    | id      | by-law-id, by-target-key, by-updated-at（by-due-at は削除） |
| reviewLogs（新設）    | id      | by-card-id, by-reviewed-at                                  |
| cardSchedules（新設） | cardId  | by-due-at                                                   |

確定済み設計 2 章は studyCards に examPinned インデックスを定めているが、**IndexedDB は boolean をインデックスキーにできないため作成しない**。カード総数は個人利用で高々数千件を想定し、examPinned による絞り込みは全件取得 + メモリ内フィルタで賄う。

移行は `core/storage/migrations.ts`（新設）に置き、versionchange トランザクション内で次を順に行う。

1. reviewLogs / cardSchedules ストアとインデックスを作成する。
2. 既存 studyCards の全レコードからスケジュール系フィールドを除去して書き戻し、by-due-at インデックスを削除する。`examPinned` は false で補う。
3. `studySessions.results`（QuizResult）を ReviewLog へ変換して投入する。ID は `legacy-<sessionId>-<index>` の決定的 ID とし、`scheduler: "legacy-import"`、`sessionId` に元セッション id を入れる。`rating` → grade、`answeredAt` → reviewedAt、`elapsedMs` → durationMs と写像し、`wasCorrect` は保存しない。変換後、results フィールドを除去する。
4. 変換した ReviewLog を cardId ごとに `fixed-interval@1` で replay し、CardSchedule を cardSchedules へ投入する。

移行中に壊れたレコード（grade が 4 値以外、必須フィールド欠落など）に遭遇した場合は、そのレコードだけスキップして続行する。移行全体を abort させると DB が開けなくなり全機能が使えなくなるため、部分的な学習履歴の欠落より可用性を優先する。

## 5. リポジトリ API（core/storage/repository.ts）

```ts
interface DueStudyCard {
  card: StudyCard;
  schedule: CardSchedule;
}

// 追加・改訂分
putStudyCard(card: StudyCard): Promise<void>;                       // 新形式に改訂
getStudyCard(cardId: string): Promise<StudyCard | undefined>;       // 追加
listStudyCards(query?: LawScopedQuery): Promise<StudyCard[]>;       // 追加
deleteStudyCard(cardId: string): Promise<void>;                     // 追加（カスケード）
recordReview(log: ReviewLog): Promise<CardSchedule>;                // 追加
listReviewLogs(cardId?: string): Promise<ReviewLog[]>;              // 追加
listDueStudyCards(dueAtOrBefore: ISODateString): Promise<DueStudyCard[]>; // 改訂
```

- `deleteStudyCard` は studyCards / reviewLogs（by-card-id）/ cardSchedules を同一トランザクションで削除する。孤児ログは再計算先を失い、export しても import 先で整合しない。「追記専用」原則は運用中の改変禁止を意味し、カード自体の削除に伴う一括削除とは矛盾しないと整理する。
- `recordReview` は「ReviewLog 追記 → 当該カードの全履歴 replay → CardSchedule 更新」を単一トランザクションで行う。#29 の復習画面はこれを呼ぶだけでよい。StudySession の更新はセッションの区切り方が #29 の UI 設計に依存するため、この API には含めない。
- `listDueStudyCards` は確定済み設計 8 章のとおり「cardSchedules の by-due-at を引き、cardId で studyCards を結合する」実装に置き換える。返り値は dueAt 昇順とする（確定済み設計 5 章の出題順）。CardSchedule を持たない未学習カードは構造上含まれない。
- `putStudyCard` は既存の bookmarks / annotations と同じく `withTargetIndexes` で lawId / targetKey を付与して保存する。

## 6. スケジューラ fixed-interval@1（core/study/scheduler.ts）

確定済み設計 3 章の規則を状態機械として確定させる。

```ts
type Scheduler = (history: ReviewLog[], now: Date) => CardSchedule;
export const fixedIntervalSchedulerId = "fixed-interval@1";
```

- 履歴は `(reviewedAt, id)` の昇順で fold する。同時刻のログがあっても順序が決定的になるよう id を第 2 キーにする。
- 空履歴は契約違反として throw する。「ReviewLog なしに CardSchedule なし」の不変条件（1 章）を実行時にも守る。
- 内部状態は学習（未卒業）・復習（卒業済み）・再学習（lapse 後）の 3 フェーズ。初期状態は学習 step 0 とする。確定済み設計が明記していない細部（hard の学習ステップ内挙動、再学習中の again）は次表で確定する。

| フェーズ              | grade | 遷移                                                  |
| --------------------- | ----- | ----------------------------------------------------- |
| 学習 step 0（+1 分）  | again | step 0 のまま（+1 分）                                |
|                       | hard  | 現ステップ維持（+1 分）                               |
|                       | good  | step 1 へ（+10 分）                                   |
|                       | easy  | 即卒業、interval 3 日                                 |
| 学習 step 1（+10 分） | again | step 0 へ戻る（+1 分）                                |
|                       | hard  | 現ステップ維持（+10 分）                              |
|                       | good  | 卒業、interval 1 日                                   |
|                       | easy  | 即卒業、interval 3 日                                 |
| 復習                  | again | lapses +1、再学習へ（+10 分）                         |
|                       | hard  | interval = max(現 interval × 1.2, 現 interval + 1) 日 |
|                       | good  | interval × 2.0                                        |
|                       | easy  | interval × 2.8                                        |
| 再学習（+10 分）      | again | lapses +1、再学習継続（+10 分）                       |
|                       | 他    | 復習へ復帰、interval 1 日                             |

- interval の上限は 365 日。`dueAt = reviewedAt + intervalDays × 24 時間` の UTC 瞬間演算で求める（日単位の丸めなし、fuzz なし）。
- 学習・再学習中の `intervalDays` は分を日数換算した小数で表す（1 分 = 1/1440 日）。状態ラベル導出（intervalDays < 21 など）と自然に整合する。
- `lapses` は復習・再学習フェーズの again のみカウントする。学習フェーズの again はまだ「落ちる」対象の間隔がないため数えない。
- `reviews` は履歴総数、`recentMistakeRate` は直近 8 件（8 件未満なら全件）に占める again の割合、`derivedFrom` は fold した最後のログ id。

`core/storage` → `core/study` への依存が新設される（移行ステップ 4 と recordReview がスケジューラを呼ぶ）。`core/study` は `core/domain` のみに依存するため循環しない。

## 7. UI 設計

### 7.1 カード作成ダイアログ（ビューア起点）

- 法令ビューアの条文アクション（ブックマーク保存の並び）に「カードを作る」を追加する。
- ダイアログ（shared/ui/dialog.tsx）の内容: 根拠条文の表示（法令名 + 条見出し、読み取り専用）、種別セレクタ（7 種、既定は穴埋め）、question / answer（必須）と explanation（任意）の textarea、tags（カンマ区切り、任意）。
- 保存時はブックマークと同じアンカー構築パターンに従う: `computeArticleFingerprint(node.plainText)` → `{ lawId, article, revisionId, fingerprint }` → `putStudyCard`。examPinned は false で作成する。
- shared/ui に `textarea.tsx` と `select.tsx` を追加する。select は native `<select>` の shadcn スタイルラッパーとし、radix-ui の Select 依存は追加しない（7 択に依存追加は過剰）。

### 7.2 一覧ページ（/study/cards）

- 件数表示と法令別フィルタ（保存済みカードの法令から動的生成した選択肢）。
- 各行に種別バッジ、question 抜粋、根拠条文リンク（buildLawArticleUrl）、タグ、examPinned のピン表示、更新日を出す。
- 法令名は saved-page の既存パターンに従い、`listSavedLaws()` から作った Map で解決し、未保存の法令は lawId をそのまま表示する（StudyCard は法令名のスナップショットを持たない。Bookmark と同じ制約であり、法令名は正規化されたデータから解決するという既存の設計思想に合わせる）。
- 並び順は updatedAt 降順。行クリックで詳細へ遷移する。
- 空状態では作成方法の案内と法令ビューアへの導線を出す。

### 7.3 詳細・編集ページ（/study/cards/$cardId）

- 作成ダイアログと同構成のフォームに examPinned トグルを加える。target は編集不可とし、根拠条文リンクとして表示する。
- 削除は確認ダイアログを挟み、カスケード削除後に一覧へ戻る。
- 不明な cardId は「カードが見つかりません」を表示する。

### 7.4 StudyPage（/study）の小改修

- プレースホルダのうち「カードの内訳」を「条文カード」セクションへ差し替え、保存件数と一覧への導線を出す。
- 「今日の復習」「苦手な条文」「科目別プリセット」のプレースホルダは #29 / #30 / #34 の領分なので現状維持する。

### 7.5 ルーティング（router.tsx）

`/study/cards` と `/study/cards/$cardId` を追加する。既存パターンに従い、closure で StorageRepository を DI する。

## 8. エラー処理

| 局面                     | 方針                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| DB 移行                  | 壊れたレコードはそのレコードだけスキップして続行する。予期しない例外は openDB の reject として既存経路へ |
| カード作成の保存失敗     | ダイアログ内にエラーメッセージを表示し、ダイアログは閉じず入力内容を保持する                             |
| 一覧・詳細の読み込み失敗 | ページ内エラー表示（saved-page の既存パターンに従う）                                                    |
| 編集保存・削除の失敗     | ページ内エラーメッセージ。削除失敗時はカードが残っていることが一覧で分かる                               |
| スケジューラへの空履歴   | 契約違反として throw する                                                                                |

フォームバリデーションは question / answer が trim 後に空でないことのみとする。

## 9. Export version 2（core/storage/export-data.ts）

- `SavedDataExport` の version を 2 に上げる。`reviewLogs` を追加し、studyCards / studySessions は新形式とする。CardSchedule は含めない（import 後にログから再計算する。確定済み設計 7 章）。
- 現在の「遠い未来日時で全カード取得」の回避策は `listStudyCards()` に置き換える。
- import 機能は未実装のため、v1 形式の import 変換は import 機能を実装する Issue で扱う。

## 10. テスト戦略

- スケジューラ（table testing）: 履歴 → 期待 CardSchedule の表形式で、学習ステップ遷移・卒業・復習乗数（hard の最低 +1 日保証を含む）・lapse と再学習・365 日上限・lapses のカウント範囲・recentMistakeRate の 8 件境界・同時刻ログの決定的順序・derivedFrom・空履歴 throw を検証する。
- 移行（fake-indexeddb）: v2 形式のデータを投入した DB を v3 で開き、フィールド除去・ReviewLog 変換（決定的 ID、legacy-import）・CardSchedule 再計算・壊れレコードのスキップを検証する。新規インストール（v0 → v3 直行）のパスも検証する。
- リポジトリ: CRUD、deleteStudyCard のカスケード、recordReview の原子性と derivedFrom 更新、listDueStudyCards が未学習カードを含まないことを検証する。
- export: version 2 で reviewLogs を含み cardSchedules を含まないことを検証する。
- UI（Testing Library）: 作成ダイアログの入力 → 保存・必須バリデーション・失敗時のエラー表示と入力保持、一覧の表示・法令フィルタ・空状態・遷移、詳細の編集保存・削除確認・不明 ID 表示、新ルートの導通を検証する。
- 実画面確認: `playwright-cli open --headed` で作成 → 一覧 → 編集 → 削除の一連フローを確認し、スクリーンショットを PR に添付する。
