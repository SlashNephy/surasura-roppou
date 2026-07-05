# Law Navigation Design

## 目的

Issue #15「目次と条文ナビゲーションを実装する」の設計である。

既存の `/laws/:lawId` 本文ビューアを壊さず、長い法令本文でも目次、条番号ジャンプ、共有可能な URL から目的の条文へ移動できるようにする。

## スコープ

実装する。

- `LawNode[]` から目次ツリーを生成する。
- 本文中の条文単位に安定した DOM anchor を付ける。
- 目次クリックで該当条文 URL へ遷移し、本文へスクロールする。
- `/laws/:lawId/articles/:article` から条文へ直接ジャンプする。
- 条番号入力で該当条文へジャンプする。
- mobile では本文を主表示にし、目次を必要時に開く。
- 現在表示対象の条文を目次で強調する。

実装しない。

- 実際の e-Gov 全文取得や永続化の導入。
- IntersectionObserver による読書位置の自動追跡。
- 検索機能、ブックマーク、共有 API、コピー機能。
- 大規模法令向け仮想リスト。

## URL 契約

Design Doc の Routing / URL Design に合わせ、条文 URL は次の形式にする。

```text
/laws/:lawId/articles/:article
```

例:

```text
/laws/129AC0000000089/articles/1
```

`article` は当面、主文側の URL-addressable な `LawNode.type === "Article"` の `number` を使う。附則、別表、様式の配下にある `Article` は同じ条番号が重複し得るため、この MVP の `/articles/:article` URL では直接指定しない。

`/laws/:lawId` は法令トップとして残す。

存在しない `article` が指定された場合は本文ビューアを表示したまま、条文が見つからない状態を明示する。

## コンポーネント設計

### `core/viewer`

`LawNodeList` は URL-addressable な条文 anchor を本文側に付ける責務を持つ。

- 主文側の URL-addressable な `Article` node の outer `article` に `id` を付ける。
- `SupplementaryProvision`、`AppdxTable`、`AppdxStyle` 配下の `Article` は同じ条番号が重複し得るため、この MVP では `id` を付けない。
- id は `article-${articleNumber}` とし、URL パラメータや selector で扱いやすい ASCII に寄せる。
- 現在対象の article number を受け取り、該当条文カードを視覚的に強調する。

新しく `LawTableOfContents` を追加する。

- `items: LawTocItem[]`
- `activeArticleNumber?: string`
- `onSelectArticle(articleNumber: string): void`

`LawTocItem` は表示に必要な最小情報だけを持つ。

```ts
export interface LawTocItem {
  id: string;
  title: string;
  type: LawNodeType;
  depth: number;
  articleNumber?: string;
  children: LawTocItem[];
}
```

目次生成は純粋関数 `buildLawTableOfContents(nodes: LawNode[]): LawTocItem[]` として実装する。

- `Part`、`Chapter`、`Section`、`Subsection`、`Division`、`Article` を目次対象にする。
- `Paragraph`、`Item`、`Subitem` は本文階層に残し、目次には出さない。
- `SupplementaryProvision`、`AppdxTable`、`AppdxStyle` は見出しとして目次に出す。
- 主文側の URL-addressable な `Article` は `articleNumber` を持ち、クリック可能にする。
- `SupplementaryProvision`、`AppdxTable`、`AppdxStyle` 配下の `Article` は目次には表示するが、`articleNumber` を持たず非クリックの text/group item として扱う。
- article を持たない見出しは、子 article があればグループとして表示する。

### `app`

router に `laws/$lawId/articles/$article` を追加する。

両ルートは同じ `LawViewerPage` を使い、page 側で optional な article param として扱う。

`LawViewerPageContent` は ready state のとき、本文、目次、条番号ジャンプを同じ page 状態から組み立てる。

desktop では本文上部にナビゲーション領域を置き、その中に条番号ジャンプと目次を並べる。

mobile では本文上部に「目次」ボタンを置き、押すと本文直下にコンパクトな目次パネルを開く。外部ライブラリの modal や drawer は追加しない。

## データフロー

1. route が `lawId` と任意の `article` を渡す。
2. page が fixture-backed document を取得する。
3. page が `buildLawTableOfContents(nodes)` を呼ぶ。
4. page が article param を `activeArticleNumber` として viewer に渡す。
5. TOC または条番号ジャンプの操作で `navigate({ to: "/laws/$lawId/articles/$article" })` を呼ぶ。
6. article param が変わったら、`document.getElementById(articleAnchorId(article)).scrollIntoView()` を実行する。

## エラーと境界条件

- 該当 article が見つからない場合、本文上部に「指定された条文が見つかりません」と表示する。
- 条番号ジャンプで空文字が送信された場合は何もしない。
- 条番号ジャンプで存在しない条番号が送信された場合は URL 遷移せず、入力欄の近くにエラーを表示する。
- 目次対象がない場合は目次領域に「目次を表示できません」と表示する。
- `Element.scrollIntoView` はブラウザ実行時のみ呼び、テスト環境では mock できるようにする。

## アクセシビリティ

- 目次は `nav aria-label="法令目次"` とする。
- 現在の条文リンクは `aria-current="location"` を付ける。
- 条番号ジャンプは `form`、`label`、`input`、`button` で構成する。
- mobile の目次開閉ボタンは `aria-expanded` と `aria-controls` を付ける。
- 見出し階層は #14 の `h1 -> h2 -> h3 -> h4` 契約を維持する。

## テスト方針

`core/viewer`:

- `buildLawTableOfContents` が階層を保持して目次を生成する。
- `LawTableOfContents` が article item をクリック可能にし、active item に `aria-current` を付ける。
- `LawNodeList` が article anchor と active styling を付ける。

`app`:

- `/laws/129AC0000000089/articles/1` で第一条が active になり、スクロールが呼ばれる。
- TOC クリックで `/laws/129AC0000000089/articles/2` に遷移する。
- 条番号ジャンプで存在する条へ遷移する。
- 存在しない条番号を入力すると URL を変えずにエラーを表示する。
- `/laws/129AC0000000089/articles/999` で本文を表示したまま not-found notice を出す。

ブラウザ確認:

- desktop 1280px 幅で TOC、条番号ジャンプ、本文 anchor の表示を確認する。
- mobile 390px 幅で目次開閉と本文表示を確認する。
- console error / warning がないことを確認する。
