# 科目別パックの実装設計

Status: Approved (設計検討セッション 2026-07-14)
Last updated: 2026-07-14

対象 Issue: [#34 科目別パックを実装する](https://github.com/SlashNephy/surasura-roppou/issues/34)

関連ドキュメント:

- [Design Doc](../../design-doc.md) の 7.9 章（Study Mode for 行政書士）に対応する。
- 基準日の永続化と e-Gov `asof` への反映は [2026-07-09-base-date-resolution-design.md](2026-07-09-base-date-resolution-design.md) の仕組みをそのまま使う。本書は新しい永続化キーを追加しない。
- 科目と法令の対応は [2026-07-10-alias-dictionary-design.md](2026-07-10-alias-dictionary-design.md) で e-Gov 実レスポンス検証済みの lawId を再利用する。
- 条文カードの一覧・フィルタは [2026-07-12-study-card-foundation-design.md](2026-07-12-study-card-foundation-design.md) の 7.2 章の UI を拡張する。

## 1. 決定事項の要約

- 科目 → 法令の対応は `core/study/subjects.ts` の静的データ + 純関数で実装する。IndexedDB のスキーマ変更・マイグレーションは行わない。
- 学習年度は「基準日の導出ビュー」とする。年度を選ぶと基準日をその年の 4 月 1 日に設定し、基準日が `YYYY-04-01` 形式でなければ「カスタム」として表示する。年度自体は永続化しない（状態の二重管理を避ける）。
- 科目は法令に紐づく 4 科目（憲法・民法・行政法・商法/会社法）とする。基礎法学は特定の法令に紐づかないため今回は除外し、カードのタグ運用に委ねる（設計検討セッションで確認済み）。
- 科目フィルタは条文カード一覧（復習側）と検索ページ（検索側）の両方に入れる。判定はいずれも「対象の lawId が科目の lawId 集合に含まれるか」のクライアントサイド評価とする。
- 復習トップ（/study）の「科目別プリセット」プレースホルダを科目別導線として実体化する。これが Issue の完了条件「科目別導線がある」に対応する。

## 2. スコープ

#34 で実装するもの:

- 科目定義と紐づけ（3 章）。
- 学習年度の設定と基準日算出（4 章）。
- 設定ページ・条文カード一覧・復習トップ・検索ページの UI（5 章）。

#34 で実装しないもの（後続 Issue の領分）:

- 科目別クイズ・よく出る条文リスト・OCR で検出した条文の科目分類（design-doc 7.9 章に記載があるが、#30 学習ダッシュボードなど後続で扱う。設計検討セッションで確認済み）。
- 基礎法学の科目化。
- 科目のユーザー編集（プリセットは静的定義とする）。

## 3. 科目定義（core/study/subjects.ts）

alias-dictionary と同じ「検証済み静的データ + 純関数」のパターンで新設する。

```ts
export type SubjectId = "constitution" | "civil" | "administrative" | "commercial";

export interface Subject {
  id: SubjectId;
  label: string; // 例: "行政法"
  lawIds: readonly string[]; // 科目に属する法令の e-Gov lawId
}

export const gyoseishoshiSubjects: readonly Subject[];

export const findSubject = (id: string): Subject | undefined;
export const isLawInSubject = (subjectId: SubjectId, lawId: string): boolean;
```

科目構成（lawId は alias-dictionary の検証済みの値を使う）:

| 科目        | 法令                                                                       |
| ----------- | -------------------------------------------------------------------------- |
| 憲法        | 日本国憲法                                                                 |
| 民法        | 民法                                                                       |
| 行政法      | 行政手続法、行政不服審査法、行政事件訴訟法、国家賠償法、地方自治法（5 法） |
| 商法/会社法 | 商法、会社法                                                               |

- `subjects.ts` は lawId を文字列リテラルで持ち、`core/jump` へは依存しない（`core/study` の依存は `core/domain` のみという現状を保つ。lawId の重複は静的データ同士の値の一致であり、テストで突き合わせ検査はしない）。
- `findSubject` は URL クエリなど任意文字列からの解決に使うため、引数を `string` で受けて不明値に `undefined` を返す。

## 4. 学習年度と基準日（core/settings/study-year.ts）

純関数のみの新設モジュール。永続化は既存の `base-date.ts` に委ねる。

```ts
// 行政書士試験は例年「試験年の 4 月 1 日現在施行の法令」が出題基準。
export const studyYearToBaseDate = (year: number): string; // 2026 → "2026-04-01"
export const baseDateToStudyYear = (baseDate: string | undefined): number | undefined;
// "2026-04-01" → 2026。それ以外の日付・未設定 → undefined（= カスタム扱い）
export const listSelectableStudyYears = (today: Date): number[];
// earliestBaseDate（2017-04-01）の 2017 年度から「today の年 + 1」年度まで、降順
```

- `baseDateToStudyYear` は `isValidBaseDate` を通る `YYYY-04-01` のみ年度とみなす。
- 「today の年 + 1」を上限にするのは、年内の試験終了後に翌年度の学習を始めるユーザーを想定するため。
- e-Gov の `asof` への反映経路（`resolveAsOf`）は変更しない。

## 5. UI 設計

### 5.1 設定ページ（settings-page.tsx）

- 「学習」グループの基準日入力の上に「学習年度」の `Select` を追加する。選択肢は「未設定（現行法）」+ `listSelectableStudyYears` の各年度（表示は「2026 年度」形式）+「カスタム」。
- 年度を選ぶと `setBaseDate(studyYearToBaseDate(year))` を呼ぶ。既存の日付入力は同じ `useBaseDate` を購読しているため即座に追従する。「未設定（現行法）」を選ぶと `setBaseDate(undefined)` で基準日をクリアする。
- Select の表示値は基準日から毎レンダー導出する: 未設定 → 「未設定（現行法）」、`baseDateToStudyYear` が年度を返す → その年度、それ以外の日付 → 「カスタム」（同期処理は書かない）。
- 「カスタム」を明示的に選んだときは基準日を変更しない（no-op。手動入力への誘導ラベルとして機能させる）。
- プレースホルダ行「科目プリセット: 未設定」は「科目プリセット: 行政書士（4 科目）」の静的表示に更新する。

### 5.2 条文カード一覧（study-cards-page.tsx）

- 既存の「法令で絞り込む」Select の隣に「科目で絞り込む」Select を追加する。選択肢は「すべての科目」+ 4 科目。
- 科目フィルタは `isLawInSubject(subjectId, card.target.lawId)` で判定し、法令フィルタと AND で合成する。
- `/study/cards` ルートに `?subject=` の search param を追加する（`validateSearch` で `findSubject` により検証し、不明値は undefined = 「すべての科目」へフォールバック）。ページは search param を科目フィルタの初期値として受け取る。
- フィルタ結果が 0 件のときは既存の「この法令のカードはありません。」と同系の文言を出し分ける。

### 5.3 復習トップ（pages.tsx の StudyPage）

- 「科目別プリセット」プレースホルダを実体化する。科目ごとに「科目名 + カード件数 + カード一覧への導線（`/study/cards?subject=...`）」を表示する。
- 件数は既存の `listStudyCards()` の結果（現在は総数表示に使用）から科目ごとにメモリ内で集計する。追加のリポジトリ API は要らない。
- 読み込み失敗時は既存挙動に合わせ、件数表示を省略して導線だけ出す。

### 5.4 検索ページ（search-page.tsx）

- 候補リストの上に「科目で絞り込む」Select を追加し、クイックサーチ候補（`candidate.lawId`）を科目の lawId 集合でクライアントサイドフィルタする。
- 科目フィルタは表示中の候補リストにのみ作用する。単一確定候補の自動ジャンプ（autoJump）は検索意図の確定を意味するため、フィルタの影響を受けず現状のまま維持する。
- フィルタで候補が 0 件になったときは「この科目に該当する候補がありません。」を表示する（検索自体の 0 件と文言を区別する）。
- フィルタ状態はページローカルの `useState` とし、URL には載せない（検索ページは `?q=` の一時的な画面であり、共有可能な状態を増やさない）。

## 6. エラー処理

| 局面                          | 方針                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| 不明な `?subject=` パラメータ | 「すべての科目」へフォールバックして一覧を表示する                    |
| 基準日の検証                  | 既存の `isValidBaseDate` に委ねる。年度から導出した値は常に妥当な日付 |
| カード読み込み失敗            | 既存ページのエラー表示パターンを踏襲する（新規の失敗経路は増えない）  |

科目定義は静的データであり、実行時の失敗経路を持たない。

## 7. テスト戦略

- `subjects.ts`（table testing）: 4 科目の構成、`findSubject` の解決と不明値の undefined、`isLawInSubject` の内外判定を検証する。
- `study-year.ts`（table testing）: 年度 → 基準日の変換、基準日 → 年度の往復（`YYYY-04-01` 以外・未設定・不正値は undefined）、選択可能年度の範囲（2017 〜 today の年 + 1、降順）を検証する。
- 設定ページ: 年度選択 → 基準日への反映と日付入力の追従、日付の手動編集 → Select の「カスタム」表示、「未設定（現行法）」選択 → 基準日のクリア、「カスタム」選択が no-op であることを検証する。
- 条文カード一覧: 科目フィルタの絞り込み、法令フィルタとの AND 合成、`?subject=` からの初期化、不明 subject のフォールバック、0 件時の文言を検証する。
- 復習トップ: 科目別導線のリンク先と件数表示を検証する。
- 検索ページ: 候補の科目フィルタ、0 件時の文言、autoJump がフィルタの影響を受けないことを検証する。
- コミット前にプロジェクト標準の check（format:check を含む）を実行し、`playwright-cli open --headed` で設定 → 復習トップ → カード一覧 → 検索の実画面を確認してスクリーンショットを PR に添付する。
