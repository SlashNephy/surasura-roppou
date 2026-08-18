# 条文のハイライト機能 設計

- Issue: [#188](https://github.com/SlashNephy/surasura-roppou/issues/188)
- 日付: 2026-08-17

## 目的

法令ビューアで条文の任意のテキスト範囲を蛍光ペンのように着色し、保存する。選択中に色を選ぶポップアップを出し、選ぶと色が付く。

## スコープ

### v1 に含む

- テキスト選択 → 4色（イエロー・オレンジ・ピンク・水色）から選んで着色
- ハイライトの永続化と再表示
- 既存ハイライトをタップして色変更・削除
- 表示モード（`readable` / `original`）を切り替えてもハイライトが保たれる
- ライト／ダーク両テーマ対応

### v1 に含まない

- ハイライトへのメモ付与（データモデル上は将来対応可能にしておく）
- 複数ノード・複数条にまたがる選択（同上）
- ハイライトの一覧画面・横断検索
- ハイライトからの学習カード生成
- 部分消去（消しゴム）

## 決定事項

### 描画方式: CSS Custom Highlight API

`CSS.highlights` + `Highlight` + `::highlight()` を使い、DOM を分割せずに着色する。Baseline Newly available (2025-06)。

本文 span の Text ノードは 1 個とは限らない。`LawNodeList.tsx` の `renderLinkedText`（条文参照を `<a>` に分割）と `LawTextWithRuby.tsx`（ルビ語を `<ruby><rt>` に分割）により、本文 span の子は複数の Text ノードに分かれるのが実データ（民法など）で高頻度に発生する。そのため、表示文字列上の文字オフセットをそのまま単一 Text ノードの offset として使うことはできない。

本文 span 配下の Text ノードを文書順に走査し、文字オフセット ↔ (Text ノード, ノード内オフセット) を相互変換する方式を採る。走査時、`<rt>`（ルビの読み）配下の Text ノードは表示文字列に含まれないため除外する。

非対応ブラウザでは**機能ごと隠す**（後述の「機能検出とフォールバック」）。

### データモデル: 既存 `Annotation` の拡張

新しいストアや型を作らず、既存の `annotations` オブジェクトストアに乗せる。ハイライトは「色が付いた注釈」として扱う。

```ts
export type HighlightColor = "cyan" | "orange" | "pink" | "yellow";

// 1つのテキスト範囲。W3C Web Annotation の TextQuoteSelector 相当。
// 位置は文字オフセットではなく引用文と前後文脈で表す。条文が改正で伸縮しても再探索できる。
export interface TextQuoteAnchor {
  target: LawReferenceTarget;
  quote: string;
  prefix: string;
  suffix: string;
}

export interface Annotation {
  id: string;
  target: LawReferenceTarget; // 代表ノード。既存の targetKey 索引に使う
  anchors: TextQuoteAnchor[]; // 1回のユーザー選択の断片。v1 は必ず長さ 1
  color?: HighlightColor; // 未定義 = 色なしの純粋な注釈
  note?: string; // 必須から任意へ。v1 では常に未設定
  tags: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

既存の `targetText` / `prefixText` / `suffixText` は `anchors` に一般化して置き換える。これらは UI から一度も書き込まれていないため、IndexedDB 上の実データ移行は不要。ただし過去にエクスポートされた JSON が存在しうるため、読み出し側に正規化を置く（後述）。

この形を選ぶ理由は、将来射程として挙がった「メモを付ける」（`note` を書くだけ）と「複数ノードにまたがる選択」（`anchors` を伸ばすだけ）が、**どちらもスキーマ変更なしで到達できる**ため。

#### 永続化への影響

- IndexedDB は schemaless であり、任意フィールドの追加ではストア定義が変わらない。**`surasuraDatabaseVersion` の繰り上げとマイグレーションは不要**（3 のまま）。
- `docs/schemas/saved-data-export-v2.schema.json` の `$defs.annotation` は `additionalProperties: false` かつ `note` が required のため、**更新が必要**。
  - `anchors` / `color` を許可プロパティに追加する。`anchors` は `required` に**しない**（旧エクスポートが通らなくなるため）。
  - `note` を `required` から外す。
  - `targetText` / `prefixText` / `suffixText` は許可プロパティに残す（旧エクスポートを読めるようにするため）。
  - 旧形式のエクスポートが新スキーマで通ること（後方互換）をテストで担保する。

#### 旧データの正規化

`anchors` はドメイン型では必須だが、v2 エクスポート由来のレコードは持たない。repository の読み出し側に正規化を置く。

- `anchors` があればそのまま使う。
- 無く、`targetText` があれば `{ target, quote: targetText, prefix: prefixText ?? "", suffix: suffixText ?? "" }` の 1 件に変換する。
- どちらも無ければ空配列とする。`anchors` が空、または `color` が未定義の注釈は**ハイライトとして描画しない**。

正規化は純関数として切り出し、単体テストの対象にする。

## アンカーとテキストアラインメント

### 問題

画面に描画される文字列と、保存の基準にすべき文字列が一致しない。

| 表示モード | 描画される文字列                        | 差分の性質                                       |
| ---------- | --------------------------------------- | ------------------------------------------------ |
| `readable` | `transformReadableText(node.plainText)` | 「第三条」→「第3条」等の局所置換。文字数が変わる |
| `original` | `node.rawText`                          | ルビを含み、`plainText` のブロック空白結合がない |

`plainText` は `collectPlainText`（RubyChar を捨て、ブロックタグ境界を空白で結合）、`rawText` は `collectRawText`（素直に連結）で生成される別系統の文字列である。したがって両者の関係は関数適用ではなく、**近似した2つの文字列の対応づけ**として扱う必要がある。

### 解決

正規空間を `node.plainText` に固定し、保存するアンカーは常に `plainText` 上の引用文＋前後文脈とする。表示文字列との相互変換に汎用のテキストアラインメントを使う。

```ts
// src/core/viewer/text-alignment.ts
// 2つの近似した文字列の文字単位対応を作る。共通の接頭辞・接尾辞を落として
// 差分のある中間だけ LCS を取る。実データは局所置換なので中間は短い。

// source 側と display 側の対応区間の列。区間内は 1 対 1 対応（等長）であり、
// 区間の切れ目が挿入・削除・置換の境界になる。
export interface TextAlignment {
  segments: { sourceStart: number; displayStart: number; length: number }[];
  sourceLength: number;
  displayLength: number;
}

export const alignTexts = (source: string, display: string): TextAlignment;
export const toSourceOffset = (alignment: TextAlignment, displayOffset: number): number;
export const toDisplayRange = (
  alignment: TextAlignment,
  sourceStart: number,
  sourceEnd: number,
): { start: number; end: number } | undefined;
```

```ts
// src/core/viewer/text-anchor.ts
export const createTextQuoteAnchor = (
  plainText: string,
  start: number,
  end: number,
): { quote: string; prefix: string; suffix: string };

// 引用文が複数箇所に出るときは prefix/suffix の一致長で最良候補を選ぶ。
// 見つからなければ undefined（条文が改正で変わった）。
export const resolveTextQuoteAnchor = (
  plainText: string,
  anchor: TextQuoteAnchor,
): { start: number; end: number } | undefined;
```

アラインメント結果は `(nodeId, displayMode)` をキーにメモ化し、ハイライトを持つノードでのみ遅延計算する。

引用文が解決できない場合は既存の `anchor-verification.ts` と同じ `drift` として扱い、**描画しない。データは削除しない。**

## 交差の解決規則

**同一ノード内でハイライトは互いに重ならない**ことを不変条件とする。これにより `Highlight.priority` による重ね順の議論が不要になり、「この位置はどの注釈か」が一意に定まってタップ編集と削除が成立する。

新しく色を塗るとき、`plainText` 空間の範囲集合を次の規則で正規化する。

| 状況                               | 挙動                                             |
| ---------------------------------- | ------------------------------------------------ |
| 同色と重なる／隣接する             | 和集合にマージして 1 本にする                    |
| 異色と重なる                       | 新しい色が勝つ。既存側から重なった部分を削り取る |
| 削り取った結果、既存が空になる     | その注釈を削除する                               |
| 削り取った結果、既存が両側に残る   | 2 本の注釈に分割する（新しい id を採番）         |
| 既存の同色ハイライトの内側を選んだ | マージ結果が同一になり、何も変わらない           |

例。`ABCDEF` の `BCD` が黄色のとき、`CDE` を選んでピンクにすると `B` が黄、`CDE` がピンクになる。既存のハイライトが伸びたり色が変わったりせず、塗った範囲だけが新しい色になる。

分割で生じた 2 本を別々の注釈にするのは、`anchors` が「1 回のユーザー選択の断片」を表す配列だからである。同一注釈にすると、片方をタップして色を変えたときに離れたもう片方も変わってしまう。

将来メモが付いたときは、分割はメモを両側に複製する。

```ts
// src/core/viewer/highlight-merge.ts
// plainText 空間の範囲集合に対する正規化。DOM もストレージも知らない。
export interface HighlightRange {
  annotationId: string;
  start: number;
  end: number;
  color: HighlightColor;
}

export const applyHighlight = (
  existing: HighlightRange[],
  next: { start: number; end: number; color: HighlightColor },
): {
  // 新規採番が必要な範囲。塗った範囲そのものと、異色分割で生じた断片。
  created: Omit<HighlightRange, "annotationId">[];
  // 既存 id を保ったまま範囲が変わったもの（同色マージの代表、片側だけ削られた異色）。
  updated: HighlightRange[];
  // 消えた既存注釈の id（同色マージで吸収された側、完全に上書きされた異色）。
  deleted: string[];
};
```

`existing` は単一ノード内の範囲のみを渡す。呼び出し側が `plainText` 空間の座標に揃えてから渡す責務を持つ。同色マージでは既存のうち最も先頭側の注釈を代表として `updated` に残し、残りを `deleted` に入れる（`createdAt` を保つため）。

## 描画と Range 管理

`CSS.highlights` に登録する `Range` は実 DOM の Text ノードを掴んでいる。React の再レンダーで Text ノードが差し替わると、古い Range は例外も警告も出さずに描画されなくなる。

対策として、本文 span に `data-law-node-id` を付与し、レンダー後の effect で対象ノードの Range を作り直して再登録する層を置く。

```
LawNodeList              本文 span に data-law-node-id を付与（描画内容は不変）
      ↓ DOM
useHighlightPainting()   レンダー後の effect で Range を全再構築し、登録する
      ↓
highlight-registry.ts    CSS.highlights への登録を担うアダプタ層
                         registry を引数で受け取り、テストでフェイクを注入できるようにする
```

- **色ごとに `Highlight` を 1 個、計 4 個**を registry に登録し、各 `Highlight` に複数 `Range` を入れる。注釈ごとに登録名を作らない。
- 「どの Range がどの注釈か」はヒットテストのために自前の対応表として持つ。
- `nodes` / `displayMode` / ハイライト集合のいずれかが変わったら差分更新せず**毎回全構築**する。ノード数もハイライト数も高々数百で `Range` 生成は安価であり、単純さを優先する。

## 色の設計

`::highlight()` で実質的に指定できるのは `background-color` と `color` に限られ、太字や下線のような色以外の手がかりを足せない。したがって 4 色は色相だけでなく**輝度でも区別できる**必要がある（1 型・2 型色覚では黄とオレンジ、ピンクとオレンジが接近するため）。

方針は次のとおり。

1. 本文の文字色は変えない（`--foreground` のまま）。ユーザーのフォント設定・テーマと衝突させない。
2. 背景色は 4 色とも本文文字に対して WCAG AA（4.5:1）以上を確保する。
3. 4 色を輝度順に並べ、両テーマで同じ順序にする。グレースケールに落としても順序で判別できる。

### ライトモード（本文 `#27272a` に対して）

| 色       | 値        | 相対輝度 | コントラスト比 |
| -------- | --------- | -------- | -------------- |
| イエロー | `#fde68a` | 0.79     | 11.9:1 (AAA)   |
| 水色     | `#67e8f9` | 0.67     | 10.3:1 (AAA)   |
| ピンク   | `#f9a8d4` | 0.53     | 8.2:1 (AAA)    |
| オレンジ | `#fb923c` | 0.41     | 6.6:1 (AA)     |

### ダークモード（本文 `#fafaf9` に対して）

明るい蛍光色に薄い文字を乗せると読めないため、同じ色相の深いトーンに差し替える。

| 色       | 値        | 相対輝度 | コントラスト比 |
| -------- | --------- | -------- | -------------- |
| イエロー | `#725f14` | 0.118    | 5.9:1 (AA)     |
| 水色     | `#125a68` | 0.084    | 7.4:1 (AAA)    |
| ピンク   | `#7d2b57` | 0.068    | 8.5:1 (AAA)    |
| オレンジ | `#5e2b0c` | 0.041    | 10.9:1 (AAA)   |

輝度順は両テーマで イエロー > 水色 > ピンク > オレンジ に揃っている。

値は `src/index.css` の `:root` と `.dark` に `--highlight-*` として定義する。`::highlight()` 疑似要素内で `var()` が解決されるかはブラウザ実装が不安定だった経緯があるため実機で検証し、使えなければテーマごとにリテラル値を直書きする。

### 色以外のアクセシビリティ

- ポップアップの色見本は色だけで表さない。`aria-label`（例: 「黄でハイライト」）を付け、キーボードで到達・選択できるようにする。Escape で閉じる。
- スウォッチ自体のコントラスト: `#fde68a` は `--popover`（`#fffdf9`）に対して約 1.2:1 で WCAG 1.4.11（非テキストコントラスト 3:1）を満たさない。**各スウォッチに枠線を付ける。**
- `@media (forced-colors: active)` では 4 色をシステムの `Mark` / `MarkText` に集約する。色の区別は失われるがハイライトの存在は保たれる。

### 既知の制約

`::highlight()` はアクセシビリティツリーに現れず、**スクリーンリーダーに一切公開されない**（`<mark>` と異なる）。v1 はハイライトが色以外の情報を持たないため実害は小さい。**将来メモを付けた時点で、メモは必ず DOM 上のテキストとして出す必要がある。**

## 選択とポップアップ UI

### ヒットテスト

`Highlight` は DOM ノードではないため、既存ハイライトをタップしても click イベントが飛ばない。座標から文字位置を求めて登録済み範囲と突き合わせる。

`caretPositionFromPoint` は標準だが Safari が長らく `caretRangeFromPoint` のみだった経緯があるため、両対応の薄いラッパーを置く。

### 選択のクランプ

`<p>` 内には項番号の marker span が同居しているため、次の条件を満たす選択だけを扱う。

- 始点と終点が同一の本文 span（`data-law-node-id` を持つ span）内に収まる。
- marker span や複数ノードにまたがる選択、および折りたたみ選択（0 文字）では**ポップアップを出さない**。押せないポップアップを出すより明快である。

### 2 つのポップアップ

| 契機                               | 内容                                                  |
| ---------------------------------- | ----------------------------------------------------- |
| 新規: テキスト選択が確定したとき   | 4 色スウォッチ。選ぶと保存して閉じる                  |
| 既存: ハイライト上をタップしたとき | 4 色スウォッチ（現在色を選択状態で表示）＋ 削除ボタン |

いずれも選択範囲の直上（画面上端に近ければ直下）に浮かべる。同一コンポーネント `HighlightColorPopover` の状態違いとして実装する。

radix-ui の Popover は導入しない。radix の Popover はアンカー要素を必要とするが、ここでのアンカーは DOM 要素ではなく選択範囲の矩形（`Range.getBoundingClientRect()`）である。座標指定の `position: fixed` な div の方が素直で、依存も増えない。フォーカストラップと Escape 処理のみ自前で持つ。

### コンポーネント構成

```
law-viewer-page.tsx
  └ useArticleHighlights()      ハイライトの読み込み・保存・削除。
                                読み込みは listAnnotations({ lawId }) を法令単位で 1 回だけ行い、
                                anchors と color を持つものだけを対象にする
  └ useHighlightSelection()     selectionchange / pointerup を購読し、
                                有効な選択またはヒットテスト成功でポップアップ状態を作る
  └ <HighlightColorPopover />   src/core/viewer/ に置く提示専用コンポーネント
```

### 保存の流れ

1. 本文 span から `nodeId` と表示空間のオフセットを取得する
2. `alignTexts(node.plainText, displayText)` で `plainText` 空間のオフセットへ変換する
3. `applyHighlight()` で既存ハイライトとの交差を解決する
4. `createTextQuoteAnchor()` で `quote` / `prefix` / `suffix` を作る
5. `computeArticleFingerprint(articleNode.plainText)` で指紋を取る
6. `repository.putAnnotation()` / `repository.deleteAnnotation()` を呼ぶ
7. 再描画（Range 全再構築）

条文保存（`law-viewer-page.tsx` の `handleSaveAnchor`）が既に同じ形なので、そのパターンを踏襲する。

### repository への追加

`putAnnotation` / `listAnnotations` は既にあるが `deleteAnnotation` が存在しない。`deleteStudyCard` の書式（単一トランザクション）にならって追加する。`src/test/fixtures/storage.ts` の in-memory 実装にも同じメソッドを足す。

## 機能検出とフォールバック

```ts
// src/core/viewer/highlight-support.ts
// 描画とヒットテストの両方が揃って初めて機能を出す。
// 片方でも欠けると「色は付くが消せない」状態になり、隠すより悪い。
export const isHighlightSupported = (target: Document = document): boolean =>
  typeof CSS !== "undefined" &&
  "highlights" in CSS &&
  typeof Highlight === "function" &&
  ("caretPositionFromPoint" in target || "caretRangeFromPoint" in target);
```

`false` のときは選択ポップアップを出さず、既存ハイライトも描画しない。**annotations の読み書きは行わない**（他端末で付けたハイライトを消さないため）。

## テスト戦略

jsdom には `CSS.highlights` も `caretPositionFromPoint` もない。そのためブラウザ API に触る層を薄く保ち、判断ロジックを純関数へ寄せる。

| 層                      | テスト方法                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `text-alignment.ts`     | 純関数の単体テスト。`readable` 変換前後、`plainText` と `rawText`（ルビあり）、境界オフセット |
| `text-anchor.ts`        | 純関数。引用文が複数箇所に出る場合の prefix/suffix 選択、改正で消えた場合の `undefined`       |
| `highlight-merge.ts`    | table testing。完全一致・内包・被内包・部分重なり・隣接・離散 × 同色/異色                     |
| `highlight-support.ts`  | 各 API を欠いた偽 `document` を渡して判定を検証                                               |
| Range 登録層            | フェイクの `CSS.highlights` を引数で注入し、どの色にどの範囲が入ったかを検証                  |
| repository              | `fake-indexeddb/auto` と一意 DB 名（`repository.test.ts` の流儀）                             |
| インポート/エクスポート | 旧形式のエクスポートが新スキーマで通ること、`color` と `anchors` が往復すること               |
| `law-viewer-page`       | `createMemoryStorageRepository` を注入。非対応時に UI が出ないことは jsdom のまま検証できる   |
| 実描画・実操作          | `playwright-cli` で preview build を検証                                                      |

`playwright-cli` での検証項目は次の 3 本を録画する。

1. 選択 → 色選択 → 再読込 → 色が残る
2. 表示モード切替でハイライトがずれない
3. ダークモードでの見え方

## 実機検証結果（Task 1）

- 検証日: 2026-08-18
- 検証環境: Chromium 151（Playwright `playwright-cli` 経由の headless Chromium, `HeadlessChrome/151.0.0.0`）
- 検証方法: スクラッチディレクトリに置いた単体 HTML（`highlight-spike.html`、リポジトリ非管理）を `python3 -m http.server` で配信し、`playwright-cli` で開いて `#out` のログとスクリーンショットを確認した。`file://` は `playwright-cli` からブロックされるため HTTP 配信に切り替えた。

### 1. `::highlight()` 内で `var()` が解決されるか

- 結果: **解決される。** `::highlight(spike-var) { background-color: var(--highlight-yellow); }` を指定した 1 行目（`第三条 私権は、`）が `:root` の `--highlight-yellow: #fde68a` どおり黄色で着色された。
- 生の観測値（`#out`）: `CSS.highlights: true`
- スクリーンショット: `/tmp/claude-1000/-home-spica-ghq-github-com-SlashNephy-surasura-roppou/679d3af9-d086-470e-a00a-f35c0faebcbf/scratchpad/highlight-normal.png`（1 行目が黄色、2 行目がリテラル指定の水色で着色されていることを確認）
- 設計への反映: `::highlight()` 内でテーマトークン（`--highlight-*`）を `var()` でそのまま使ってよい。リテラル値への直書きは不要。

### 2. `caretPositionFromPoint` / `caretRangeFromPoint` の対応状況

- 結果: 検証環境（Chromium 151）では両方とも存在する。
- 生の観測値（`#out`）:
  ```
  caretPositionFromPoint: true
  caretRangeFromPoint: true
  caret hit offset: 4
  ```
  （ハイライト範囲 `[0, 8)` の矩形中心点に対する `caretPositionFromPoint` のヒット結果。範囲中央付近の offset 4 が返っており、ヒットテストは想定どおり機能している。）
- Safari での対応状況: 本タスクの検証環境には Safari/WebKit が無く**未検証**。`caret-position.ts` は設計どおり `caretPositionFromPoint` を優先し、無ければ `caretRangeFromPoint` にフォールバックし、どちらも無ければ機能を隠す分岐を維持する（両対応の薄いラッパーは変更不要）。
- 設計への反映: フォールバック分岐（`"caretPositionFromPoint" in target || "caretRangeFromPoint" in target` で対応判定）は現状のままでよい。Safari 実機での再確認は後続タスクでの宿題として残す。

### 3. `@media (forced-colors: active)` 下での `::highlight()` の実挙動

- 結果: **`playwright-cli` から直接 `forcedColors` を指定するコマンドは無い**が、`run-code` で Playwright の `page.emulateMedia({ forcedColors: "active" })` を実行することで検証できた。
  - `@media (forced-colors: active)` で `Mark` / `MarkText` への上書きを指定した 1 行目（`spike-var`）は、上書きどおり紺地に白文字で描画された。
  - 上書きを指定していない 2 行目（`spike-literal`）も、**同じ紺地に白文字**で描画された。Chromium は forced-colors モードでは `::highlight()` の author 指定色（`background-color: #67e8f9` 等）を明示的な `@media (forced-colors: active)` 上書きの有無に関わらずシステム色へ強制する。
  - 色の区別は失われるが、ハイライトの存在自体（下線・背景）は両方とも保たれた。設計の想定（「色の区別は失われるがハイライトの存在は保たれる」）と一致する。
- スクリーンショット:
  - `/tmp/claude-1000/-home-spica-ghq-github-com-SlashNephy-surasura-roppou/679d3af9-d086-470e-a00a-f35c0faebcbf/scratchpad/highlight-forced-colors.png`（全体）
  - `/tmp/claude-1000/-home-spica-ghq-github-com-SlashNephy-surasura-roppou/679d3af9-d086-470e-a00a-f35c0faebcbf/scratchpad/highlight-forced-line1.png`（1 行目拡大）
  - `/tmp/claude-1000/-home-spica-ghq-github-com-SlashNephy-surasura-roppou/679d3af9-d086-470e-a00a-f35c0faebcbf/scratchpad/highlight-forced-line2.png`（2 行目拡大）
- 設計への反映: `@media (forced-colors: active)` ブロックは設計どおり入れておく（4 色のうち少なくとも 1 色は `Mark`/`MarkText` に明示的に寄せておくことで意図を明示できる）。ただし Chromium では未指定でも強制されるため、このブロックが無くても致命的な破綻（着色そのものの消失）は起きない。Safari/Firefox の forced-colors 挙動は未検証。

## 変更ファイル

### 新規

- `src/core/viewer/text-alignment.ts`
- `src/core/viewer/text-anchor.ts`
- `src/core/viewer/highlight-merge.ts`
- `src/core/viewer/highlight-support.ts`
- `src/core/viewer/highlight-registry.ts`
- `src/core/viewer/HighlightColorPopover.tsx`
- `src/app/use-article-highlights.ts`
- `src/app/use-highlight-selection.ts`
- 上記に対応するテストファイル

### 変更

- `src/core/domain/models.ts` — `Annotation` の拡張、`HighlightColor` と `TextQuoteAnchor` の追加
- `src/core/domain/index.ts` — re-export
- `src/core/storage/repository.ts` — `deleteAnnotation` の追加
- `src/test/fixtures/storage.ts` — in-memory 実装に `deleteAnnotation` を追加
- `src/core/viewer/LawNodeList.tsx` — 本文 span に `data-law-node-id` を付与
- `src/core/viewer/index.ts` — re-export
- `src/app/law-viewer-page.tsx` — 配線
- `src/index.css` — `--highlight-*` トークンと `::highlight()` 規則
- `docs/schemas/saved-data-export-v2.schema.json` — `$defs.annotation` の更新
