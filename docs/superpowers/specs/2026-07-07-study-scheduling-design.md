# 復習スケジューリングとデータ設計

Status: Approved (設計検討セッション 2026-07-07)
Last updated: 2026-07-07

関連ドキュメント:

- [Design Doc](../../design-doc.md) の 7.8 章と 14 章のドラフトを確定させるものである。
- 条文参照は [2026-07-07-revision-and-asof-design.md](2026-07-07-revision-and-asof-design.md) の二重アンカーを共用する。

## 1. 決定事項の要約

- 回答履歴は**追記専用の生ログ**として全件保存し、スケジュール状態はログからの**導出キャッシュ**として持つ。
- design-doc 7.8 の復習状態（未学習、復習中、苦手、定着）は保存せず**導出ラベル**にする。「試験直前に確認」だけをユーザー意思の**手動ピン**として保存する。
- スケジューラは差し替え可能な純関数とし、MVP 実装は ease を持たない固定乗数方式にする。将来の FSRS 系への移行はログの再計算で行う。

## 2. データモデル

時刻の規約: ISODateString はすべて UTC の瞬間（Z 付き ISO 8601）として保存する。
日単位の丸めは行わず、期限判定は瞬間同士の比較で行う（端末のタイムゾーン変更で off-by-one が起きない）。

```ts
// ① 追記専用の回答ログ（真実の源）
interface ReviewLog {
  id: string;
  cardId: string;
  sessionId?: string; // 復習セッションへの紐付け（任意）
  grade: "again" | "hard" | "good" | "easy"; // 既存の QuizRating と同一の 4 値
  reviewedAt: ISODateString;
  durationMs?: number;
  scheduler: string; // 例: "fixed-interval@1"。算定方式の混在を後から検出できるようにする
}

// ② カード本体
interface StudyCard {
  id: string;
  source: "manual" | "ocr" | "bookmark" | "auto";
  target: LawReferenceTarget; // 二重アンカー + 指紋
  type: StudyCardType; // design-doc 10 章のまま
  question: string;
  answer: string;
  explanation?: string;
  tags: string[];
  examPinned: boolean; // 「試験直前に確認」
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ③ スケジュール（ログからの導出キャッシュ。破損時は再計算で復元する）
interface CardSchedule {
  cardId: string;
  dueAt: ISODateString;
  intervalDays: number;
  lapses: number; // again で落ちた回数
  reviews: number;
  recentMistakeRate: number; // 直近 8 回の again 率
  derivedFrom: string; // 反映済み最後の ReviewLog id（整合性チェック用）
}
```

IndexedDB のストア構成:

| ストア        | keyPath | インデックス             |
| ------------- | ------- | ------------------------ |
| studyCards    | id      | target.lawId, examPinned |
| reviewLogs    | id      | cardId, reviewedAt       |
| cardSchedules | cardId  | dueAt                    |

既存実装（`src/core/domain/models.ts`）との関係を次のとおり定める。

- **StudyCard**: 現行実装が持つ `dueAt / intervalDays / ease / mistakes / lastReviewedAt` を廃止し、スケジュール情報は CardSchedule に一本化する。
- **QuizResult**: 廃止する。保持していた情報は ReviewLog が担う（`rating` → grade、`answeredAt` → reviewedAt、`elapsedMs` → durationMs。`wasCorrect` は「grade が again 以外」として導出できるため保存しない）。
- **StudySession**: `results: QuizResult[]` を廃止し、セッションのメタデータ（id、startedAt、finishedAt、cardIds）に縮小する。セッションと回答の紐付けは ReviewLog.sessionId で行う。
- 回答の保存は「ReviewLog の追記 + StudySession の更新」を同一トランザクションで行い、真実の源は常に ReviewLog とする。

## 3. スケジューラ

インターフェースは純関数とする。

```ts
type Scheduler = (history: ReviewLog[], now: Date) => CardSchedule;
```

履歴だけを入力に取るため、アルゴリズムを差し替えても全カードの状態を決定的に再構築できる。

MVP 実装 `fixed-interval@1` の規則（**数値は暫定のチューニング定数**であり、変更してもログ再計算で追従できる）:

- 学習ステップ: 未卒業カードは 1分 → 10分 → 卒業（interval 1 日）。easy は即卒業で interval 3 日。
- 復習: again は lapses を +1 して 10 分後に再出題し、通過で interval 1 日から再開。hard は ×1.2（最低 +1 日）。good は ×2.0。easy は ×2.8。
- 上限: interval 365 日。
- dueAt は reviewedAt + intervalDays × 24 時間の UTC 瞬間演算で求める（日単位の丸めなし）。ランダムなゆらぎ（fuzz）は MVP では入れない。

## 4. 状態ラベルの導出規則

| ラベル         | 条件（暫定）                                   |
| -------------- | ---------------------------------------------- |
| 未学習         | reviews = 0                                    |
| 復習中         | reviews > 0 かつ intervalDays < 21             |
| 定着           | intervalDays ≥ 21                              |
| 苦手           | reviews ≥ 4 かつ 直近 8 回中 again が 3 回以上 |
| 試験直前に確認 | examPinned = true（他ラベルと重畳可）          |

閾値の変更はコード変更だけで済み、データ移行は発生しない。

## 5. 出題キュー

- 今日の復習: `dueAt ≤ now` のカードを dueAt 昇順で出題する。1 日あたりの上限は MVP では設けない。
- 未学習カードは「新しく覚える N 件」としてキューから分離した導線にする。
- 回答後は必ず根拠条文を基準日で解決して表示する（design-doc 14.3、UI 設計 7 章）。

## 6. 改正との接続

- カードの target 指紋が現在の解決先と不一致でも、出題キューからは外さない。
- 回答後の根拠条文に「改正の可能性」バッジと「カードを作り直す」導線を表示する。
- カードの question / answer は自動で書き換えない。原文保持と同じく、ユーザーの学習資産を勝手に変えない。

## 7. Export / Import

design-doc 7.3 の JSON export に、studyCards と **reviewLogs を含める**。
ログを含めることで、端末移行後も任意のスケジューラで状態を再構築できる。
ファイルにはスキーマ version フィールドを持たせ、import 時に検証する。
`StudyCard.id` と `ReviewLog.id` は `ReviewLog.cardId` と `CardSchedule.derivedFrom` の前提なので、export / import で**再採番せずそのまま往復させる**。import 時に同一 id が既存する場合は上書きとする。
CardSchedule は export に含めない（import 後にログから再計算する）。

## 8. 既存実装からのデータ移行

IndexedDB を次バージョンへ上げ、次の移行を一度に行う（[ADR 2026-07-06: IndexedDB storage version 1](../../adr/2026-07-06-indexeddb-storage-version-1.md) の後続）。

1. `reviewLogs` と `cardSchedules` ストアを新設する（インデックスは 2 章の表）。
2. `studyCards` ストアからスケジュール系フィールドを除去し、`by-due-at` インデックスを削除する。
3. 既存 `studySessions.results`（QuizResult）を ReviewLog へ変換して投入する（scheduler には `"legacy-import"` を記録し、sessionId に元セッションの id を入れる）。変換後、results フィールドを除去する。
4. 変換した ReviewLog から全カードの CardSchedule を再計算する。

リポジトリ API への影響も明記する。

- `listDueStudyCards` は「`cardSchedules` の dueAt インデックスを引き、得られた cardId で `studyCards` を結合する」実装に置き換える。
- セッション保存 API は「ReviewLog の追記 + StudySession 更新」の同一トランザクション化に合わせて見直す。
- export / import のスキーマ version を上げ、旧形式の import には変換を適用する。

## 9. FSRS 系への移行パス

1. 新スケジューラを `fsrs@1` として実装する（同じ純関数インターフェース）。
2. 全カードについて履歴を replay して CardSchedule を再計算する。
3. 以後の ReviewLog.scheduler に `fsrs@1` を記録する。混在期間があっても、ログにはどの方式で並べられた出題への回答かが残る。
