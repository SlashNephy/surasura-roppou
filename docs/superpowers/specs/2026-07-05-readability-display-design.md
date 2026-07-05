# Readability Display Design

## 目的

Issue #16「表示モードと文字列正規化を実装する」の設計である。

法令本文の原文を保持したまま、本文ビューアで原文表示と読みやすい表示を切り替えられるようにする。

読みやすい表示では、条番号、項番号、号番号、別表番号、年月日、法令番号、全角かっこを表示レイヤーで変換する。

## スコープ

実装する。

- 原文表示モード。
- 読みやすい表示モード。
- 条番号、項番号、号番号、別表番号の数字化。
- 年月日の数字化。
- 法令番号の数字化。
- 全角かっこの半角化。
- 文脈依存の漢数字変換。
- 変換禁止パターンのテスト。
- 本文ビューアの表示モード切り替え UI。

実装しない。

- コピー形式選択。
- Markdown コピー。
- 出典付きコピー。
- 検索インデックス用の正規化。
- 永続化された表示モード設定。
- `LawNode` の保存データを書き換える処理。
- 法令本文構造の再正規化。

コピー関連は #21 のコピー、共有、エクスポート導線で扱う。

検索や参照解決のための正規化は #31 以降で扱う。

## 基本方針

変換は表示レイヤーで行う。

`LawNode.rawText` と `LawNode.plainText` は変更しない。

原文表示では `rawText` を優先し、`rawText` が空の node では `plainText` を使う。

読みやすい表示では `plainText` を基準に変換する。

`normalizedText` は既存の domain field として残すが、今回の表示切り替えの主データにはしない。

その理由は、今回の目的が保存済みデータの正規化ではなく、表示時の切り替えだからである。

## 表示モード

viewer が扱う表示モードは次の 2 種類にする。

```ts
export type LawTextDisplayMode = "original" | "readable";
```

**original**：原文表示モードである。

`rawText` を優先して表示する。

`rawText` が空の場合は `plainText` を表示する。

**readable**：読みやすい表示モードである。

`plainText` を基準に、読みやすさ変換を適用して表示する。

初期表示は `readable` にする。

初期表示を読みやすい表示にする理由は、アプリの中心体験が「法令を読みやすく閲覧する」ことだからである。

## 変換器

変換器は `src/shared/utils/readability.ts` に置く。

このファイルは React に依存しない純粋関数だけを公開する。

主な公開 API は次の形にする。

```ts
export type ReadabilityTransformMode =
  "article-number" | "date" | "law-number" | "parentheses" | "unchanged" | "all";

export const transformReadableText: (text: string, mode?: ReadabilityTransformMode) => string;
```

`mode` を省略した場合は `"all"` と同じ扱いにする。

`"all"` は、全角かっこ、法令番号、年月日、条番号系の順に適用する。

順序を固定する理由は、より長い文脈を持つ表現を先に処理し、短い表現の変換が長い表現を壊すことを避けるためである。

## 数字化の対象

数字化は文脈を限定する。

無差別に「一」「二」「三」を置換しない。

対象は既存 fixture と design doc の例に合わせる。

- `第一条` を `第1条` にする。
- `第十二条の二` を `第12条の2` にする。
- `第三項` を `第3項` にする。
- `第一号` を `第1号` にする。
- `別表第一` を `別表1` にする。
- `令和六年四月一日` を `令和6年4月1日` にする。
- `平成五年法律第八十八号` を `平成5年法律第88号` にする。
- `損害（精神的損害を含む。）` を `損害(精神的損害を含む。)` にする。

対象外の語は変換しない。

- `一般`
- `一部`
- `同一`
- `第三者`
- `第一審`
- `第一義的`

## 漢数字変換

MVP の漢数字変換は一万未満を扱う。

条番号、項番号、号番号、別表番号、年月日、法令番号の代表例では一万未満で足りる。

`十`、`十一`、`十二`、`二十`、`百一`、`八十八` のような一般的な表記を算用数字へ変換する。

`〇`、`零`、大字、算用数字と漢数字が混在する複雑な表記は MVP の対象外にする。

対象外の表記は原文をそのまま返す。

## viewer への組み込み

`LawDocumentView` は `displayMode` を受け取る。

`LawNodeList` は `displayMode` を受け取り、node の表示文字列を決定する。

title、marker、本文は同じ `displayMode` で表示する。

Article heading、Paragraph marker、Item marker、Subitem marker も読みやすい表示では変換する。

ただし、DOM anchor と URL は既存どおり node の `number` を使う。

表示文字列を変えても、`/laws/:lawId/articles/:article` の URL 契約は変えない。

## UI

`LawViewerReadyState` の本文上部の操作領域に表示モード切り替えを追加する。

既存の条番号ジャンプと mobile 目次ボタンと同じ操作領域に置く。

選択肢は「読みやすい表示」と「原文表示」にする。

初期値は「読みやすい表示」にする。

状態は page component 内の local state で持つ。

永続化はしない。

永続化しない理由は、#16 の完了条件が表示切り替えであり、設定保存は storage issue の責務だからである。

## エラーと境界条件

空文字は空文字のまま返す。

変換対象がない文字列は同じ文字列を返す。

変換禁止パターンは同じ文字列を返す。

`rawText` が空の node の原文表示では `plainText` に fallback する。

存在しない `displayMode` は TypeScript の union で呼び出し側から排除する。

## アクセシビリティ

表示モード切り替えは accessible name を持つ control にする。

現在選択中の表示モードが screen reader でも分かる形にする。

切り替え時に本文の landmark や見出し階層は変えない。

条文 URL、目次の `aria-current`、本文側の `aria-current` は #15 の契約を維持する。

## テスト方針

`shared/utils/readability` は table testing で検証する。

`src/test/fixtures/readability.ts` の fixture を実装テストに流用する。

追加するテストでは、複合変換と変換禁止パターンを分けて検証する。

`core/viewer` では、`displayMode="original"` が `rawText` を使うことを検証する。

`core/viewer` では、`displayMode="readable"` が title、marker、本文を変換することを検証する。

`app` では、表示モード切り替え UI を操作すると本文表示が切り替わることを Testing Library で検証する。

UI 変更なので、実装後に `playwright-cli open --headed` で desktop と mobile 幅を確認する。

## 実装後の確認

通常の品質チェックを実行する。

```bash
pnpm run format:check
pnpm run typecheck
pnpm run lint
pnpm test
git diff --check
```

PR 作成前に Antigravity review を実行する。

```bash
pnpm run review:antigravity
```
