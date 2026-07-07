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

```ts
// ① 追記専用の回答ログ（真実の源）
interface ReviewLog {
  id: string;
  cardId: string;
  grade: "again" | "hard" | "good" | "easy";
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

design-doc 10 章の StudyCard ドラフトから `dueAt / intervalDays / ease / mistakes / lastReviewedAt` を分離・廃止し、上記 3 型に置き換える。

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
- dueAt は reviewedAt + interval で計算し、日単位に切り上げる。ランダムなゆらぎ（fuzz）は MVP では入れない。

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

## 8. FSRS 系への移行パス

1. 新スケジューラを `fsrs@1` として実装する（同じ純関数インターフェース）。
2. 全カードについて履歴を replay して CardSchedule を再計算する。
3. 以後の ReviewLog.scheduler に `fsrs@1` を記録する。混在期間があっても、ログにはどの方式で並べられた出題への回答かが残る。
