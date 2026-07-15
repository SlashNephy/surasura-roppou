# 学習ダッシュボード 設計ドキュメント

- Issue: [#30 学習ダッシュボードを作る](https://github.com/SlashNephy/surasura-roppou/issues/30)
- 対象コンポーネント: `app`, `core/study`, `core/storage`（読み取りのみ）
- Design Doc 参照: [15.1 Information Architecture](../../design-doc.md#151-information-architecture) / [15.4 Home Quick Actions](../../design-doc.md#154-home-quick-actions)

## 1. 背景と目的

すらすら六法は、アプリを開いたときに「今日やること」が分かる学習ホームを重視する。
最近開いた項目・今日の復習・苦手条文・正答率をまとめ、学習導線の入口にする。

完了要件は次の 2 点である。

- アプリを開いたときに今日やるべき復習が分かる。
- 苦手条文や最近触れた条文に戻れる。

## 2. 現状

- Study ページ（`/study`）は既に「今日の復習」「新しく覚える」「条文カード」「科目別」を表示する。
- ただし「苦手な条文」は "準備中" のプレースホルダのままである（`src/app/pages.tsx`）。
- Home ページ（`/`）は検索・撮影導線と保存済み法令を出すのみで、「復習を始める / 復習機能は準備中です」という古い文言が残る（`src/app/home-page.tsx`）。
- 正答率はどこにも表示されていない。
- 閲覧履歴（viewedAt 相当）を追跡する IndexedDB store は存在しない。

## 3. 確定した設計判断

ブレインストーミングで次を確定した。

- **最近開いた項目**は既存データから近似する。保存法令の `updatedAt` と復習カードの `reviewedAt` を時系列マージする。新しい永続化やビューア改修は行わない。
- **設置場所**は Home と Study の両方とする。算出ロジックを共通化し、Study ページの「苦手な条文 準備中」プレースホルダも同じロジックで埋める。
- **正解判定**は Anki 準拠とする。`grade !== "again"` を正解、`again` を不正解（lapse）とみなす。
- **正答率の集計期間**は通算（全期間）とする。
- **Home の構成**では「最近開いた項目」と「オフライン保存済み」を別セクションとして両方出す。前者は時系列フィード、後者は保存ライブラリ一覧という役割の違いによる。

## 4. アーキテクチャ

算出ロジックを `core/study` の純関数に置き、`app` の共有フックが repository から取得したデータを渡して view model を組み立てる。
Home と Study は同じフックを使い、同じ数字を共有する。

```text
core/storage (既存, 読み取りのみ)
  listDueStudyCards / listUnscheduledStudyCards / listStudyCards
  listReviewLogs() / listSavedLaws()
        │  (domain 型 / storage summary)
        ▼
app/use-study-dashboard (新規フック)
  並行取得 → core/study 純関数へ委譲 → StudyDashboard view model
        │
        ├──► HomePage       (学習セクション + 既存の保存済みセクション)
        └──► StudyPage       (苦手プレースホルダを実データで置換 + 正答率)
        │
        ▼
core/study/stats, core/study/recent (新規, 純関数)
```

### 4.1 なぜこの構成か

- `core/storage` は素のデータアクセスに徹し、導出ロジックを混ぜない。テスト容易性のため。
- `core/study` に導出を集約すると、既存の `scheduler.ts`（純関数 + table test）と構造が揃う。
- `core/study` は現状 `core/domain` にしか依存しない。この逆依存の無さを保つため、純関数の入力は domain 型または最小形状に限定する。保存法令（storage 由来）とのマージだけは app フック側で行う。

### 4.2 却下した代替案

- 各ページに算出をインライン展開する案は、重複が生じ「苦手も共通化」という要望に反するため却下した。
- `core/storage` の repository にダッシュボード用メソッドを生やす案は、永続化層に導出が混ざりテストしにくくなるため却下した。

## 5. コンポーネント詳細

### 5.1 `core/study/stats.ts`（新規・純関数）

```ts
export interface ReviewStats {
  totalReviews: number;
  correctReviews: number;
  // 回答が 1 件も無いときは undefined（0% と区別する）。
  accuracy: number | undefined;
}

export const computeReviewStats: (logs: readonly ReviewLog[]) => ReviewStats;

export interface WeakCard {
  card: StudyCard;
  reviews: number;
  correct: number;
  accuracy: number;
}

export const selectWeakCards: (
  cards: readonly StudyCard[],
  logs: readonly ReviewLog[],
  options?: { minReviews?: number; limit?: number },
) => WeakCard[];
```

- 正解判定は `grade !== "again"`。
- `accuracy` は `correctReviews / totalReviews`。総回答 0 のとき `undefined`。
- `selectWeakCards` は各カードの通算正答率を求め、`minReviews`（既定 3）以上のカードを正答率昇順で `limit`（既定 5）件返す。
  - しきい値 3 は、1 回の `again` だけで苦手判定される誤検出を避けるための下限である。
  - 同率のときは回答数が多い順で安定ソートし、判定の根拠が厚いカードを優先する。
  - 対応する `StudyCard` が存在しないログ（削除済みカード）は除外する。

### 5.2 `core/study/recent.ts`（新規・純関数）

```ts
export type RecentItem =
  | { kind: "law"; lawId: string; title: string; at: ISODateString }
  | { kind: "card"; card: StudyCard; at: ISODateString };

export interface RecentInputs {
  savedLaws: readonly { lawId: string; title: string; at: ISODateString }[];
  reviewedCards: readonly { card: StudyCard; at: ISODateString }[];
}

export const mergeRecentItems: (inputs: RecentInputs, options?: { limit?: number }) => RecentItem[];
```

- 2 種の入力を `at` 降順でマージし、`limit`（既定 5）件返す。
- 重複除去は対象キーで行う。法令は `lawId`、カードは対象条文（`card.target`）を正規化したキーを用い、同一条文が保存経由と復習経由で二重に並ばないようにする。より新しい `at` を残す。
- 入力は storage 型に依存しない最小形状とする。保存法令サマリ・復習ログからこの形状への変換は app フックが行う。

### 5.3 `app/use-study-dashboard.ts`（新規フック）

- `listDueStudyCards(now)` / `listUnscheduledStudyCards()` / `listStudyCards()` / `listReviewLogs()` / `listSavedLaws()` を `Promise.all` で並行取得する。
- `computeReviewStats` / `selectWeakCards` / `mergeRecentItems` を呼び、次の view model を返す。

```ts
export interface StudyDashboard {
  dueCount: number;
  unscheduledCount: number;
  cardCount: number;
  stats: ReviewStats;
  weakCards: WeakCard[];
  recentItems: RecentItem[];
  cards: StudyCard[]; // 科目別の件数集計に既存 StudyPage が使うため保持する
}
```

- 「最近復習したカード」は、全 `reviewLogs` を `reviewedAt` 降順に走査し、カード単位で最新の 1 件を採ってカードへ解決する。
- エラー時は既存パターンに倣い、dashboard を `undefined` にしてページ本体は表示する。フックはエラーメッセージも公開し、UI が「オフライン保存済み」のようにエラー表示を出せるようにする。
- 本番ルーターは DI なしでページを描画するため、フックは既定 repository へのフォールバックを持つ（既存 `StudyPage` / `HomePage` と同じ方針）。

### 5.4 表示側の変更

**Home（`src/app/home-page.tsx`）**

- 「復習を始める / 復習機能は準備中です」の古い文言を撤去し、今日の復習数に応じた導線に差し替える。
  - 復習対象があれば「N 件の復習」バッジ + `/study/review` への導線。無ければ「今日の復習はありません」。
- 学習セクションを追加する。正答率・苦手条文（上位数件、各カードの対象条文へ戻れる）・最近開いた項目（時系列フィード）。
- 既存の「オフライン保存済み」セクションは役割が異なるため残す。
- デスクトップ幅・モバイル幅の両方でレイアウトが崩れないこと、テキストがコンテナからはみ出さないことを守る。

**Study（`src/app/pages.tsx` の `StudyPage`）**

- 既存の ad hoc な `Promise.all` を `use-study-dashboard` に置き換える。
- 「苦手な条文 準備中」を `weakCards` の実データで置換する。各項目は対象条文へ戻れるリンクにする。
- 「今日の復習」ブロック付近に通算正答率を追加する。

## 6. 導線とアクセシビリティ

- 苦手条文・最近開いた項目の各カードは、既存のカード→法令ビューア遷移パターン（`study-cards-page` 等が持つ `card.target` 解決）を再利用して対象条文へ遷移する。
- セクションには見出しとランドマークを与え、リンクにアクセシブルな名前を付ける。
- アイコンは `lucide-react` を使う。

## 7. テスト方針

- `computeReviewStats` / `selectWeakCards` / `mergeRecentItems` は table testing で代表ケースと境界ケースを検証する。
  - 総回答 0（accuracy undefined）、全問 again（accuracy 0）、全問正解、`minReviews` 未満のカード除外、同率時のソート安定性、削除済みカードのログ除外、マージの重複除去と時系列順。
- `use-study-dashboard` は Testing Library で、ローディング・成功・エラーの各状態が UI にどう出るかを検証する。fake repository を注入する。
- Home / Study ページは、今日の復習数・正答率・苦手条文・最近開いた項目がユーザーから見える DOM として現れることを検証する。
- 実装詳細の文字列探索だけで通るテストは書かない。
- 見た目・導線を変えるため、`playwright-cli open --headed` で Home と Study の両方を実画面確認し、スクリーンショットを PR に添付する。

## 8. スコープ外（YAGNI）

- 閲覧履歴の新規トラッキング（viewedAt store）。
- 正答率の期間ウィンドウ集計（直近 N 日）。通算のみとする。
- 苦手項目の科目別内訳やグラフ。
- 学習ストリーク・連続日数などのゲーミフィケーション要素。
