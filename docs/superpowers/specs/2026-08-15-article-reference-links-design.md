# 条文中の条・項参照リンク（Issue #192）

## 目的

条文本文に現れる「第七百九十八条」「前項」「前条」などの参照を、同じ法令内の該当箇所へのリンクとして表示する。
参照先の条に見出し（caption）があるときは、見やすい表示に限り `〈救助料の割合の案〉` の形で添える。

design-doc の M3「同一法令内リンク化」に対応する。

## スコープ

対象:

- 法令名を伴わない参照のうち、同一法令内で解決できるもの
  - 絶対参照: `第798条` `第15条第1項` `第709条の2`
  - 相対参照: `前条` `次条` `前項` `次項`
- 参照先の条が本則に存在する場合のみリンク化する
- 号を伴う参照（`前項第三号`）は号まで含めた範囲をリンクにし、着地は項とする。
  条も項も伴わない号のみの参照（`第三号`）は、着地先が現在の項そのものになり
  移動しないリンクが残るためリンク化しない。

対象外（別 Issue とする）:

- 他法令への参照（`商法第798条`）のリンク化
- 項・号を加味した URL / ルーティング（`?paragraph=` の解釈、項単位のハイライト）

意図的に扱わないもの:

- `同条` `同項` `同法` は「直前に言及された条」を指す文脈依存の表現であり、現在位置とは限らない。
  誤ったリンクは無リンクより有害なため、リンク化しない（パーサーは従来どおり消費するだけ）。
- 附則・別表の中の条番号は本則の条を指さないため、リンク化しない。
  `lawToc` の `isUrlAddressableArticleContext` が既にこの区別を持つので、それを再利用する。

## 表示

- `【 】` は Issue のモックアップ記法であり、実文字としては出さない。参照部分はリンクとしてスタイルする。
- `〈見出し〉` は実文字として注入するが、**見やすい表示のときだけ**とする。
  原文表示では原文にない文字を足さない（AGENTS.md の「法令本文の原文は必ず保持し、読みやすい表示や漢数字変換は表示レイヤーで扱う」に従う）。
- 見出しは `（親告罪）` の形で格納されているため、外側の括弧を剥がしてから `〈 〉` で囲む。

## アンカー体系

| 対象               | 現在            | 変更後   |
| ------------------ | --------------- | -------- |
| 条                 | `article-15`    | `a15`    |
| 条（枝番 `798-2`） | `article-798-2` | `a798-2` |
| 項                 | なし            | `a15-p2` |

条アンカーも短縮して項アンカーと表記を揃える。
現在の利用箇所は `law-viewer-page.tsx` の `getElementById`、`LawNodeList.tsx` の `id` 付与、`lawToc.test.ts` の 3 箇所のみで、
URL のハッシュとして公開していないため互換性の問題は生じない。

項 id は「Article 直下の Paragraph」かつ URL 到達可能文脈のときだけ振る。
号アンカーは作らず、`前項第三号` のような参照は項に着地させる。

## 構成

### `src/core/jump/reference-pattern.ts`（新規）

`reference-detector.ts` のローカル定数だった位置表現の正規表現ソースを切り出し、OCR 検出と本文リンク化の双方から使う。
検出の入口だけを共有し、`detectLawReferences` 自体は流用しない。
`detectLawReferences` は OCR 固有の関心事（同一参照の重複除去、OCR confidence 減衰、法令名の後方窓探索）を持ち、
本文リンク化では「同じ参照が複数回出たら全部リンクする」必要があるため、重複除去が害になる。

### `src/core/viewer/reference-links.ts`（新規）

```ts
export interface ArticleLinkTarget {
  articleNumber: string;
  paragraphNumber?: string;
}

// 法令 1 件ぶんの条の一覧。文書順に並ぶ。
export interface ArticleLinkEntry {
  articleNumber: string;
  // 条見出し（外側の括弧は剥がしてある）
  caption?: string;
  // 条直下の項番号。前項・次項の解決と、存在しない項への着地の抑止に使う
  paragraphNumbers: string[];
}

export interface ArticleLinkContext {
  articles: ArticleLinkEntry[];
  // 前条・次条の基準となる現在の条番号
  currentArticleNumber?: string;
  // 前項・次項の基準となる現在の項番号
  currentParagraphNumber?: string;
}

// リンク文字列に差し込む見出し。offset は text 内の挿入位置
// （「第15条第2項」なら offset 4 で 第15条〈補助開始の審判〉第2項 になる）
export interface ReferenceLinkCaption {
  text: string;
  offset: number;
}

export type ReferenceLinkSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; target: ArticleLinkTarget; caption?: ReferenceLinkCaption };

export const buildArticleLinkEntries: (nodes: LawNode[]) => ArticleLinkEntry[];

export const segmentReferenceLinks: (
  text: string,
  context: ArticleLinkContext,
) => ReferenceLinkSegment[];
```

解析は `parseReference` をそのまま使う。次のいずれかに該当する参照は素のテキストとして返す。

- `kind === "absolute"`（法令名を伴う＝他法令参照）
- 参照先の条が `articles` に存在しない、または参照先の項がその条に存在しない
- 番号を持たない（`同条` `同法` など）
- 前条・次条で、文書順の隣が存在しない（第 1 条の `前条` など）
- 項のみの参照で `currentArticleNumber` が未確定
- 着地先が現在位置と同じになるもの（現在の条自身への条参照、号のみの参照）

`caption` はセグメントに常に載せ、`〈 〉` を出すかどうかは描画側が `displayMode` で決める。
ただし現在の条自身を指すリンク（`前項` など）には見出しを付けない。同じ条の見出しを繰り返しても情報がない。

#### 法令名ガード

位置表現の正規表現は「商法第15条」のうち `第15条` の部分しかマッチしない。
マッチ文字列だけを `parseReference` に渡すと法令名が届かず、他法令への参照が
同一法令内リンクとして通ってしまう。OCR 検出側は `findLawNameStart` で後方に法令名を探して
スパンを広げることでこれを避けている。本文リンク化では次の 2 段で抑止する。

1. マッチ直前の文字列を alias 辞書で後方スキャンし、法令名（`商`『民訴』などの略称を含む）に一致したらリンク化しない
2. マッチ直前の 1 文字が `法` `令` `則` `例` `条` のいずれかならリンク化しない

2 は辞書に載っていない法令名（`不正競争防止法第2条`）、附則（`附則第15条`）、
直前に別の条を指す語がある場合（`同条第2項`）を抑止する。
`本法第15条` のような正しい自法令参照も巻き添えで抑止されるが、誤ったリンクは無リンクより有害という
本件の判断基準に従って無リンクへ倒す。

### `src/core/viewer/lawToc.ts`（変更）

- `articleAnchorId` を `a{number}` 形式に変更する。
- `paragraphAnchorId(articleNumber, paragraphNumber)` を追加する。

条の一覧を作る `buildArticleLinkEntries(nodes)` は、`ArticleLinkEntry` 型が
`segmentReferenceLinks` の入力そのものであるため `reference-links.ts` に置く。
附則・別表の判定は `lawToc.ts` の `computeChildArticleContext` を import して共有する。

### `src/core/viewer/LawNodeList.tsx`（変更）

- 本文の描画（条直下テキスト・項・号・章節の前文）を、文字列の直挿しからセグメント配列の写像に置き換える。
- トップで `buildArticleLinkEntries` を `useMemo` し、再帰の中で現在の条番号・項番号を足して各本文へ渡す。
- Article 直下の Paragraph に `paragraphAnchorId` の `id` と `scroll-mt` を付ける。
- 附則・別表の中（`isUrlAddressableArticleContext === false`）ではリンク化しない。
  絶対参照は現在位置の基準がなくても解決できてしまうため、この抑止がないと附則の中の条番号が本則へリンクする。
- リンクは飛び先で 2 種類に分かれる。
  - 他の条へ: `buildLawArticleUrl` で作った `href` を持つ `<a>`。`onSelectArticle` があれば
    `preventDefault` してコールバックで SPA 遷移する。URL が addressable になり、既存の
    `activeArticleNumber` によるハイライトとスクロールがそのまま効く。
  - 同じ条の中の項へ: `<a href="#a15-p2">` のページ内リンク。ルーター・URL スキーマには手を入れない。
- `core/viewer` は router 非依存を保つ。TanStack Router の `Link` は使わず、遷移は
  既存の `LawTableOfContents` と同じくコールバック注入で行う。
- 修飾キー付きクリック（Ctrl / Cmd / Shift / Alt）と非主ボタンのクリックは `preventDefault` しない。
  新しいタブ・ウィンドウで開くというブラウザ標準のリンク操作を保つ。
- `lawId` を `LawDocumentView` → `LawNodeList` に props で渡す。`LawDocumentView` は `law.lawId` から取る。

リンク化は表示文字列が確定した後に行う。
現在の `bodyText` は displayMode 変換 → 子要素の末尾テキスト除去 → 先頭マーカー除去を経た文字列であり、
これより前で分割すると文字位置がずれる。

## 処理順序

1. `getDisplayText` などで表示文字列を確定する（漢数字→算用数字の変換を含む）
2. `segmentReferenceLinks` で参照位置を検出し、リンク候補を解決する
3. セグメント配列を ReactNode へ写す

見やすい表示では算用数字、原文表示では漢数字に一致することになるが、
`positionPattern` の数値クラスと `parseReference` の `toArabicNumber` が双方を扱うため、追加の分岐は不要。

## エラーハンドリング

参照の解決に失敗した場合は例外を投げず、素のテキストとして描画する。
表示上の欠落はリンクが付かないだけで、本文は常に読める状態を保つ。

## テスト

- `reference-links.test.ts`: table testing で代表ケースと境界ケースを並べる。
  `第798条` / `前条` / `次条` / `前項` / `次項` / `第17条第1項` / `第709条の2` /
  存在しない条 / 他法令参照 / 第 1 条の `前条` / 原文表示の漢数字表記 / 同一文中に同じ参照が 2 回出る場合。
- `LawNodeList.test.tsx`: Testing Library で、参照がリンクとして描画され `href` が正しいこと、
  附則内ではリンクにならないこと、見やすい表示で `〈見出し〉` が出て原文表示では出ないこと。
- `lawToc.test.ts`: `articleAnchorId` / `paragraphAnchorId` の生成規則。

## 検証

- `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `pnpm test`
- preview build に対する playwright-cli での実画面確認（リンクのクリックで該当条へ移動すること、
  見やすい表示と原文表示の差、モバイル幅での折り返し）
