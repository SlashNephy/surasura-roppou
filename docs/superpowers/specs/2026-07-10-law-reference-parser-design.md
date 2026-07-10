# 条文参照パーサーの設計

Status: Approved (設計検討セッション 2026-07-10)
Last updated: 2026-07-10

関連ドキュメント:

- [Design Doc](../../design-doc.md) の [7.6 Law Reference Resolver](../../design-doc.md#76-law-reference-resolver) と [11. Law Reference Resolver Design](../../design-doc.md#11-law-reference-resolver-design) を実装に落とすものである。
- 対応 Issue: [#31 条文参照パーサーを実装する](https://github.com/SlashNephy/surasura-roppou/issues/31)（親 [#4](https://github.com/SlashNephy/surasura-roppou/issues/4)）。
- 依存（解決済み）: [#10 テスト基盤と fixture](https://github.com/SlashNephy/surasura-roppou/issues/10)、[#16 表示モードと文字列正規化](https://github.com/SlashNephy/surasura-roppou/issues/16)、[#22 初期の略称辞書](https://github.com/SlashNephy/surasura-roppou/issues/22)。
- 後続（本 Issue が Blocking）: [#24 参照候補の解決](https://github.com/SlashNephy/surasura-roppou/issues/24)、[#25 検索バー](https://github.com/SlashNephy/surasura-roppou/issues/25)。
- **この spec は [2026-07-07-law-reference-resolver-design.md](2026-07-07-law-reference-resolver-design.md) を supersede する。** 旧 spec の「MVP のみ」「離散 rank」「lawId まで解決」の 3 決定は、その後の Issue 再編（#22 実装・#31 パーサー / #24 解決の分割）と現行 fixtures（`confidenceFloor`）により置き換わっている。

## 1. 決定事項の要約

- **責務**: 入力文字列を、参照先を表す構造化フィールドへ変換する純粋関数 `parseReference(input) => ParsedReference | undefined` を `core/jump` に新設する。
- **解決は分離する**: パーサーは `lawId` を出力しない。法令名/略称の「原文テキスト候補」と条・項・号等を返すのみ。`lawId` への実解決と候補の複数化は後続 #24 が担う。パーサーは official / alias の分類にのみ #22 の `createAliasResolver` を利用する（`lawId` は結果に載せない）。
- **対応範囲は design-doc 7.6 の全域**: MVP 表記に加え、漢数字・枝番・ローマ数字項・相対参照（前条/次条/前項/次項/同）・本文/ただし書・別表まで受理する。ユーザー選択により「できる限り全部」を採る。
- **確信度は数値 score**: 0..1 の決定的スコアを返す。仕様の受け入れ基準はテストフィクスチャ `src/test/fixtures/lawReferences.ts` とし、実 score が各ケースの `confidenceFloor`（下限）以上であることを検証する。
- **単一参照のみ**: 1 入力＝1 参照を対象とする。自由文中の複数参照検出（`民法709条及び710条`）は範囲外（OCR/検索側 #37・#25 の関心事）。

## 2. スコープ

| 項目 | 本 Issue #31 | 担当 |
| --- | --- | --- |
| 入力正規化（NFKC・全半角・空白・小文字化）| ○ | |
| 法令名/略称の切り出しと official/alias 分類 | ○ | |
| 条・項・号・枝番・別表・本文/ただし書のパース | ○ | |
| 漢数字・ローマ数字の数値化 | ○ | |
| 相対参照（前/次/同、前項/次項）| ○ | |
| 決定的スコアリング | ○ | |
| 単体テスト（fixture 駆動）| ○ | |
| `lawId` への実解決・候補複数化 | | #24 |
| 自由文中の複数参照検出 | | #37 / #25 |
| OCR 誤認識補正の本格対応 | | 将来（最小限の old-form 補正のみ本 Issue）|

`core/jump` の依存方向は `core/jump → core/search / shared/utils` の一方向を保つ。パーサーはストレージにも e-Gov にも依存しない純粋なドメインロジックである。

## 3. パイプライン

design-doc 11.1 のパイプラインを単一の純粋関数に実装する。

```text
入力文字列
  → 正規化（既存 normalizeForSearch を再利用: NFKC → 全半角統一 → 小文字化 → 空白除去、sourceIndex 追跡）
  → 法令名/略称部の切り出し（先頭の非数値・非マーカーのラン）と official/alias 分類（createAliasResolver）
  → 条番号部の構文解析（条・枝番・項・号・別表・本文/ただし書、アラビア/漢数字/ローマ数字混在）
  → 決定的スコアリング
  → 単一の構造化結果（未解析なら undefined）
```

再利用する既存資産:

- `normalizeForSearch`（`core/search`）: NFKC・全半角・小文字化・空白除去を行い `sourceIndex` を返す。法令名の原文抽出は `sourceIndex` で正規化位置 → 原文位置を引く。辞書照合とも同じ正規化を共有し整合を保つ。
- `toArabicNumber`（`shared/utils/readability`）: 漢数字（一〜千、9999 まで）→ 数値。条・項・号・枝番・別表の漢数字に用いる。
- `createAliasResolver`（`core/jump`）: 切り出した法令名トークンを `resolve` し、返る候補の `matchKind`（official/alias）を分類に使う。`lawId` は結果へ載せない。

## 4. 出力型

```ts
export type ReferenceKind = "absolute" | "relative";
export type ReferenceSentence = "main" | "proviso"; // 本文 / ただし書

export interface ParsedReference {
  // 法令名/略称があれば "absolute"、なければ（相対参照・法令なし数字列）"relative"。
  kind: ReferenceKind;
  // 正式名称っぽい原文（辞書照合が official、または辞書外の推定名）。
  lawNameCandidate?: string;
  // 略称の原文（辞書照合が alias）。
  lawAlias?: string;
  // 条: "1" / "242-2"（枝番はハイフン連結）/ "previous" / "next"。
  article?: string;
  // 項: "1" / "previous" / "next"。
  paragraph?: string;
  // 号: "1"。
  item?: string;
  // 本文 / ただし書。
  sentence?: ReferenceSentence;
  // 別表第一 → "1"。
  appendix?: string;
  // 0..1 の決定的スコア。fixture の confidenceFloor 以上になる。
  score: number;
}
```

- `article` の枝番ハイフン表現（`242-2`）は、既存 `src/core/domain/references.ts` の `buildLawArticleUrl` が URL の `:article` に使う表現と同一とし、変換を挟まない。
- 相対シフトは専用フィールドを設けず `article` / `paragraph` の値 `"previous"` / `"next"` として符号化する（fixture が `paragraph: "previous"` とするのに倣う）。
- **「同」＝シフトなし＝フィールド省略**の規則を採る。`同条第一号` は「現在の条の第一号」を意味し、`article` を設けず `item: "1"` のみを返す（fixture と一致）。`同法1条` は law を省略し `article: "1"` のみ（法令は現在文脈）。

## 5. 文法とパース

正規化後の入力に対し、次を受理する。`<num>` はアラビア数字列 `\d+` または漢数字列 `[一二三四五六七八九十百千]+`（`toArabicNumber` で数値化）。

```text
参照     := 法令部? 位置部
法令部   := 法令名 | 略称                       // 先頭の非数値・非マーカーラン。同法 は法令部を空にし relative 化
位置部   := 相対 | 別表 | 本文ただし書 | 条項号
相対     := "前条" | "次条" | "前項" | "次項"     // article/paragraph = "previous"|"next"
別表     := "別表" "第"? <num>                   // appendix
本文ただし書 := "本文" | ("ただし書" | "但書")     // sentence = "main" | "proviso"
条項号   := 条? 項? 号?
条       := "同"? ("第"? <num> "条"? 枝番* | 相対条)  // 709 / 709条 / 第709条 / 242条の2 / 前条
枝番     := "の" <num>                            // 複数可。ハイフン連結
項       := "同"? ("第"? <num> "項" | ローマ数字)   // 憲21Ⅰ の Ⅰ→1（NFKC で "I"→小文字 "i"）
号       := "第"? <num> "号"
```

- **条の省略**（`民709` / `国賠1`）: 法令部の直後が数値列で始まり `条` が無い場合、その数値を条番号とする。
- **法令なし数値列**（`1条1項1号` / `一条二項三号`）: 法令部が空で位置部だけの入力は `kind: "relative"`（現在文脈への相対）とする。
- **ローマ数字項**（`憲21Ⅰ`）: 条番号の直後に続くローマ数字を項とする。NFKC で `Ⅰ`→`I`、`normalizeForSearch` の小文字化で `i` になるため、`i, ii, …` を項番号へ変換する小関数を持つ。
- **「同」接頭**: `同法` は法令部を空にし relative 化。`同条` / `同項` はマーカーを消費するがシフトを与えない（フィールド省略）。
- 未解析（空文字・参照として解釈不能）は `undefined` を返す。エラーにはしない。

## 6. スコアリング

決定的な加減点で 0..1 を算出する。fixture の `confidenceFloor` は下限であり、実 score がこれ以上になるよう設計する。

- **基底**
  - absolute（法令部あり）: 辞書一致の正式名称 `0.55` / 略称 `0.45` / 辞書外の推定名 `0.35`
  - relative（法令部なし）: `0.4`
- **加点**: 具体的な条番号 `+0.35`（relative では `+0.1`）、項 `+0.05`、号 `+0.05`、本文/ただし書 `+0.02`、別表 `+0.05`
- **減点**: 漢数字由来の数値を含む `-0.05`（1 回のみ）
- 0..1 にクランプ

検算（現行 fixture 全 12 件）:

| 入力 | 内訳 | score | floor |
| --- | --- | --- | --- |
| 国家賠償法第1条 | 0.55+0.35 | 0.90 | 0.9 |
| 国賠1 | 0.45+0.35 | 0.80 | 0.8 |
| 民709 | 0.45+0.35 | 0.80 | 0.8 |
| 行政手続法14条 | 0.55+0.35 | 0.90 | 0.9 |
| 地方自治法242条の2 | 0.55+0.35 | 0.90 | 0.85 |
| 民法第七百九条の二 | 0.55+0.35−0.05 | 0.85 | 0.75 |
| 憲法21条1項 | 0.45+0.35+0.05 | 0.85 | 0.85 |
| 民法第七百九条第一項第一号 | 0.55+0.35+0.05+0.05−0.05 | 0.95 | 0.75 |
| 前項 | 0.4 | 0.40 | 0.4 |
| 次項 | 0.4 | 0.40 | 0.4 |
| 同条第一号 | 0.4+0.05−0.05 | 0.40 | 0.4 |
| 同項第一号 | 0.4+0.05−0.05 | 0.40 | 0.4 |

全件が floor 以上。将来 OCR（#37）で外部信号（編集距離・OCR confidence・履歴）を加える場合は、本パーサーの基底 score を保ったまま呼び出し側で加点する。

## 7. ファイル構成

| ファイル | 役割 |
| --- | --- |
| `src/core/jump/reference-parser.ts` | `parseReference` / `ParsedReference` 型 / 正規化・数値パース・スコアリング |
| `src/core/jump/reference-parser.test.ts` | `lawReferenceParseFixtures` 駆動の table test + 発展表記の追加ケース |
| `src/core/jump/index.ts` | `parseReference` と型の export 追加 |
| `src/test/fixtures/lawReferences.ts` | 発展表記の fixture 追加、型に `sentence` / `appendix` を追加 |

## 8. テスト方針

公開インターフェース `parseReference` の振る舞いのみを検証する。ソース走査や定数複製比較は行わない。

- **fixture 駆動（table test）**: `lawReferenceParseFixtures` の各ケースについて、`parseReference(input)` の構造化フィールド（`kind` / `lawNameCandidate` / `lawAlias` / `article` / `paragraph` / `item` / `sentence` / `appendix`）が期待値と一致し、`score >= confidenceFloor` を満たす。
- **発展表記の追加ケース**: `同法1条`・`前条`・`次条`・`本文`・`ただし書`・`別表第一`・`憲21Ⅰ`・`一条二項三号`・`1条1項1号`・`第1条第1項第1号` を fixture へ追加し同様に検証する。
- **境界・非参照**: 空文字・空白のみ・数字のみ（`123`）・法令名のみ（`国家賠償法`: 条番号なしで article 無しの absolute 候補）・辞書外の法令名（推定名 score）を検証する。
- **正規化のゆれ**: 全角数字（`国家賠償法第１条`）・空白混じり（`国家賠償法 1条`）が同じ結果へ落ちる。
- **決定性**: 同一入力に対し常に同一 score・同一フィールドを返す。

## 9. 対象外（明示）

- `lawId` への実解決・候補の複数化（#24）。
- 自由文中の複数参照検出・範囲参照（`1条から3条まで`）。
- OCR 誤認識補正の本格対応（本 Issue は old-form の最小補正のみ、または未実装として明示）。
- 辞書の BFF 配信・遠隔更新。
