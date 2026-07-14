# 復習画面の実装設計

Status: Approved (設計検討セッション 2026-07-14)
Last updated: 2026-07-14

対象 Issue: [#29 復習画面を実装する](https://github.com/SlashNephy/surasura-roppou/issues/29)

関連ドキュメント:

- [2026-07-07-study-scheduling-design.md](2026-07-07-study-scheduling-design.md) の 4〜6 章（出題キュー・回答後の根拠条文表示・改正との接続）を実装に落とす。データモデルとスケジューラの再定義は行わない。
- [2026-07-12-study-card-foundation-design.md](2026-07-12-study-card-foundation-design.md)（#33）が提供する `recordReview` / `listDueStudyCards` / `fixed-interval@1` を前提とする。
- [Design Doc](../../design-doc.md) の 6.4 章（復習フロー）と 14.3 章（Answer Review）に対応する。

## 1. 決定事項の要約

- `/study/review` ルートを新設し、`mode: "due" | "new"` クエリで「今日の復習」と「新しく覚える」の 2 導線を同一のセッション UI で扱う。
- 未学習カードの取得のためリポジトリに `listUnscheduledStudyCards()` を追加する。「未学習 = cardSchedules に行がない」の不変条件をそのまま問い合わせにする。
- セッション中、学習・再学習ステップのカード（`intervalDays < 1`）はキュー末尾へ戻して再出題し、全カードが卒業したら完了とする。
- 出題キューは React state のみで保持する。回答は都度 `recordReview` で永続化されるため、途中離脱してもログは失われず、再開時は due から再構築される。
- StudySession はキュー確定時に一度保存し、完了時に finishedAt を付けて上書きする。回答との紐付けは `ReviewLog.sessionId` が担うため、回答ごとのセッション更新は行わない。
- 回答後は根拠条文の本文を基準日で解決してインライン表示し、指紋不一致時は「改正の可能性」バッジと「カードを作り直す」導線を出す。

## 2. スコープ

#29 で実装するもの:

- `/study/review` ルートと復習セッションページ（出題 → 答え表示 → 評価 → 完了）。
- 「新しく覚える」導線（未学習カードの初回学習）。未学習カードは CardSchedule を持たず復習キューに構造上入らないため、この導線がないと復習機能が空回りする。
- `listUnscheduledStudyCards()` リポジトリ API。
- StudyPage（/study）の「今日の復習」プレースホルダの実装差し替えと「新しく覚える」導線の追加。
- StudySession の運用（開始・完了の記録、ReviewLog.sessionId の付与）。

#29 で実装しないもの（後続 Issue の領分）:

- 状態ラベル（未学習・復習中・苦手・定着）の表示、正答率などの統計表示（#30）。
- 科目別パック（#34）。
- 1 日あたりの復習上限や新規件数のユーザー設定（確定済み設計 5 章のとおり MVP では設けない）。

## 3. ルーティングと導線

- `/study/review` を router.tsx に追加する。既存パターンに従い closure で `StorageRepository` を DI する。
- `validateSearch` で `mode` を受ける。`"new"` 以外の値はすべて `"due"` に丸める。
- StudyPage（/study）の改修:
  - 「今日の復習」: `listDueStudyCards(now)` の件数を表示し、「復習を始める」で `/study/review` へ遷移する。0 件なら「今日の復習はありません」を表示する。
  - 「新しく覚える」: `listUnscheduledStudyCards()` の件数を表示し、`/study/review?mode=new` へ遷移する。
  - 正答率などの統計は #30 の領分のため、導線に必要な件数表示のみとする。

## 4. リポジトリ API（core/storage/repository.ts）

```ts
listUnscheduledStudyCards(): Promise<StudyCard[]>; // 未学習 = cardSchedules に行がないカード
```

- studyCards 全件と cardSchedules のキー集合の差分で求める。カード総数は個人利用で高々数千件の想定のため、メモリ内での突き合わせで賄う（#33 の examPinned フィルタと同じ整理）。
- 返り値は createdAt 昇順（古く作ったカードから覚える）。同時刻は id 昇順で決定的にする。

## 5. 出題キューとセッション進行

### 5.1 キュー構築

- 復習モード（`mode=due`）: `listDueStudyCards(now)` をそのまま使う（dueAt 昇順。確定済み設計 5 章の出題順）。
- 新規モード（`mode=new`）: `listUnscheduledStudyCards()` の先頭 10 件。10 は暫定のチューニング定数で、「新しく覚える N 件」（確定済み設計 5 章）の N。一度に覚える量を制限する学習上の配慮であり、Anki の既定値に合わせる。

### 5.2 セッション内再出題

- 評価確定後、`recordReview` が返す `CardSchedule.intervalDays` を見る。
  - `intervalDays < 1`（学習・再学習ステップ中）: カードをキュー末尾へ戻す。
  - `intervalDays >= 1`（卒業）: セッションから除外する。
- キューが空になったら完了。
- 学習ステップの 1 分 / 10 分の待ち時間は厳密には守らず、キュー末尾へ回すだけに単純化する（Anki も待ちカードしか残っていなければ即出題する）。dueAt の永続値はスケジューラが正しく計算しており、セッション内の出題順だけの単純化である。

### 5.3 進行状態の保持

- キューと進行状態は React state（メモリ）のみで保持する。
- 回答は都度 `recordReview` で永続化されるため、リロード・離脱でもログは失われない。再開時は残りが due として `listDueStudyCards` から再構築される（イベントソーシング設計の恩恵。セッション途中断のための特別な永続化は行わない）。
- キュー進行の判定（再出題・卒業・完了）は純粋関数として `src/app` 配下に切り出し、table testing で検証する。

## 6. セッション記録（StudySession）

- キュー確定時（1 件以上あるとき）に `putStudySession({ id, startedAt, cardIds })` を保存する。cardIds は初期キューのカード id。
- 各回答の `ReviewLog.sessionId` にこのセッション id を入れて `recordReview` を呼ぶ。
- 完了時に `finishedAt` を設定して `putStudySession` で上書きする。中断したセッションは finishedAt が付かないまま残り、未完了セッションとして自然に表現される。
- 確定済み設計 2 章は「ReviewLog 追記 + StudySession 更新を同一トランザクションで」としていたが、#33 で StudySession がメタデータに縮小され、回答のたびにセッションを更新する必要自体が消えた。cardIds は開始時に確定し、回答との紐付けは ReviewLog.sessionId が担うため、`recordReview` の原子性だけで整合性が保たれる。

## 7. 回答 UI

1 カードの流れは 2 段階とする（design-doc 6.4 のフロー）。

### 7.1 出題段階

- 進捗（残り件数）、カード種別バッジ（studyCardTypeLabels を再利用）、question を表示する。
- 操作は「答えを見る」のみ。表示時点から経過時間の計測を始める。

### 7.2 回答段階

- answer と explanation（あれば）、根拠条文パネル(8 章)、評価ボタン 4 つを表示する。
- 評価ボタンは `again（もう一度）/ hard（難しい）/ good（できた）/ easy（簡単）`。各ボタンに次回間隔の目安（「1分後」「3日後」など）を添える。`fixedIntervalScheduler` は純関数のため、現在履歴 + 仮 grade を渡せば副作用なしにプレビュー計算できる。
- 評価確定で `recordReview({ id, cardId, sessionId, grade, reviewedAt, durationMs, scheduler: fixedIntervalSchedulerId })` を呼び、次カードへ進む。
- キーボード操作: `Space` / `Enter` で答えを見る、`1`〜`4` で評価（Anki 互換）。ボタンは通常の `<button>` とし、Tab 操作・アクセシブルネームを維持したうえでショートカットを上乗せする。

## 8. 根拠条文パネル

回答段階に常設する（「回答後は必ず根拠条文を基準日で解決して表示する」確定済み設計 5 章、design-doc 14.3）。

- `loadLawViewerDocument(card.target.lawId, repository, storageRepository, baseDate)` で法令を取得し、nodes から `target.article` の条ノードを探して条見出しと本文をインライン表示する。「表示基準日: YYYY-MM-DD」を添える（基準日未設定なら現行法令である旨を表示する）。
- 基準日は `useBaseDate()`（設定ストア）から取る。
- 取得結果はセッション内の Map でキャッシュし、同一法令のカードが続いても 1 回しか取得しない。保存済み法令なら loader の既存フォールバックによりオフラインでも表示できる。
- `target.fingerprint` があれば `verifyAnchor({ article, fingerprint }, nodes)` で照合し、`match` 以外（`drift` / `not_found`）の場合は「改正の可能性」バッジと「カードを作り直す」導線を表示する（確定済み設計 6 章）。`not_found`（条ノード自体が見つからない）の場合は本文の代わりに「この条は現在の版に見つかりません」を表示する。
  - 「カードを作り直す」はビューアの該当条文へのリンクとする。ビューアには既存の「カードを作る」アクションがあり、新しい本文・新しい指紋でカードを作れる。question / answer を自動で書き換えない原則（確定済み設計 6 章）のとおり、書き直しはユーザーの手で行う。
- 法令取得に失敗した場合は、パネルをビューアへのリンクとエラーメッセージに縮退し、復習自体は続行できるようにする（評価ボタンは常に有効）。

## 9. 完了画面と空状態

- キューが空になったら同ルート内で完了状態へ遷移し、`finishedAt` を保存する。
- 完了画面の表示: 完了メッセージ、学習件数と grade 内訳（セッション中のメモリ集計）、/study へ戻る導線。復習モード完了時は、未学習カードがあれば「新しく覚える」への導線も出す。
- 開始時点でキューが 0 件の場合は空状態画面を出す:
  - 復習モード: 「今日の復習はありません」+ 未学習カードがあれば「新しく覚える」への導線。
  - 新規モード: 「未学習のカードがありません」+ カード一覧・法令ビューアへの導線。

## 10. エラー処理

| 局面                  | 方針                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| キュー取得失敗        | ページ内エラー表示 + 再試行ボタン（saved-page の既存パターン）                                              |
| recordReview 失敗     | 回答段階に留まりエラーメッセージを表示。再度評価ボタンを押せる（ログ未保存のため二重記録にならない）        |
| 法令取得失敗          | 根拠条文パネルのみ縮退（8 章）。復習は続行可能                                                              |
| StudySession 保存失敗 | セッションは続行する（真実の源は ReviewLog であり、セッションメタデータの欠落は復習を止める理由にならない） |
| 不正な mode クエリ    | `"due"` に丸める                                                                                            |

## 11. テスト戦略

- キュー進行ロジック（純粋関数）: 再出題判定（intervalDays < 1 で末尾へ）・卒業での除外・完了判定を table testing で検証する。
- リポジトリ: `listUnscheduledStudyCards` がスケジュールの有無で正しく絞ること、createdAt 昇順であることを検証する。
- UI（Testing Library）: 出題 → 答えを見る → 評価 → 次カードの一連遷移、again での再出題、完了画面と grade 内訳、空状態（両モード）、根拠条文パネルの表示・「改正の可能性」バッジ・取得失敗時の縮退、キーボード操作、recordReview 失敗時の表示と再試行、StudyPage の導線と件数表示、新ルートの導通を検証する。
- 実画面確認: `playwright-cli open --headed`（preview build）でカード作成 → 新しく覚える → 復習 → 完了の一連フローを確認し、スクリーンショットを PR に添付する。
