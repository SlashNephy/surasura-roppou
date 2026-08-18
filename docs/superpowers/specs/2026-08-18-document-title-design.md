# ページタイトルの動的化 設計

Issue: [#218](https://github.com/SlashNephy/surasura-roppou/issues/218)

## 背景

`index.html` の `<title>すらすら六法</title>` が全ページで固定されており、アプリ内のどこを開いても同じタイトルになる。
ブラウザのタブ、履歴、ブックマーク、共有時のいずれからも現在地が判別できない。

現状 `document.title` を読み書きしているコードはアプリ内に存在しない。

## 目的

ルートと表示内容に応じて `document.title` を切り替える。書式は `{ページ名} | すらすら六法` とする。

## 設計

### `formatDocumentTitle`

ページ名からタイトル文字列を組み立てる純粋関数。

```
formatDocumentTitle("設定")  → "設定 | すらすら六法"
formatDocumentTitle()        → "すらすら六法"
formatDocumentTitle("")      → "すらすら六法"
formatDocumentTitle("   ")   → "すらすら六法"
```

- 区切りは半角スペースで挟んだ `|`。
- ブランド名 `すらすら六法` は定数として 1 箇所に定義する。
- ページ名が未指定・空・空白のみのときはブランド名だけを返す。前後の空白は落とす。

### `useDocumentTitle`

```ts
useDocumentTitle(pageTitle?: string): void
```

`useEffect` で `document.title = formatDocumentTitle(pageTitle)` を代入する。

- SPA であり次に表示されるページが必ず自分のタイトルを設定するため、アンマウント時の復元は行わない。
- 引数が変わったときだけ再代入する（依存配列は `pageTitle`）。
- 配置は `src/app/document-title.ts`。ブランド名はアプリ固有の語であり、汎用ユーティリティではないため `src/shared/utils/` には置かない。

### ルートごとのタイトル

| ルート                                           | タイトル                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `/`                                              | `すらすら六法`（接尾辞なし）                                       |
| `/laws`                                          | `法令を探す`                                                       |
| `/laws/$lawId`, `/laws/$lawId/articles/$article` | `{法令名}`。読み込み中・エラー・オフライン未保存のときは接尾辞なし |
| `/saved`                                         | `保存リスト`                                                       |
| `/saved/collections/$collectionId`               | `{コレクション名}`。未検出のときは接尾辞なし                       |
| `/scanner`                                       | `撮る`                                                             |
| `/study`                                         | `復習`                                                             |
| `/study/review`                                  | `今日の復習`（`mode=due`）/ `新しく覚える`（`mode=new`）           |
| `/study/cards`                                   | `条文カード`                                                       |
| `/study/cards/$cardId`                           | `条文カード`                                                       |
| `/settings`                                      | `設定`                                                             |
| `/settings/data-transfer`                        | `データのエクスポート / インポート`                                |
| `/search`                                        | `「{クエリ}」の検索結果`。クエリが空のときは `検索`                |

補足:

- 法令ビューアは条番号を含めない。条文間のスクロールや条文リンク遷移でタイトルが頻繁に変わるのを避ける。
- データ取得中の中間状態には専用の文言を置かず、ブランド名のみを表示する。取得完了時に実タイトルへ差し替わる。
- `/scanner` は h1 がカメラの状態で `問題集や資料から条文を開く` / `撮影` / `プレビュー` の 3 通りに変わるため、
  ナビゲーションのラベルである `撮る` に固定する。
- `/study/review` は h1 と同じ mode 依存の文言を使う。

## テスト

- `document-title.test.ts`: `formatDocumentTitle` を table testing で検証する（通常・undefined・空文字・空白のみ・前後空白）。
- 各ページの既存テストに `document.title` のアサーションを追加する。法令ビューアと保存コレクションは
  「読み込み中は接尾辞なし → 取得後に実タイトル」の遷移まで見る。
- `router.test.tsx`: ルート遷移でタイトルが切り替わることを検証し、フックの呼び忘れを検出できるようにする。

## 非対象

- `<meta name="description">` の動的化。
- Open Graph / Twitter Card などの SNS 向けメタタグ。
- SSR やプリレンダリングによる初期 HTML へのタイトル埋め込み。
