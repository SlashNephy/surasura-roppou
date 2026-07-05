# Law Viewer MVP Design

## Goal

Issue #14 では、`/laws/:lawId` で代表的な法令本文を PC とスマートフォンの両方で破綻なく読める本文ビューア画面を作る。

後続の #15 で目次・条文ナビゲーション、#16 で表示モードと文字列正規化を実装するため、今回は本文表示の土台、状態表示、`LawNode` 描画契約に範囲を絞る。

## Scope

実装する。

- `/laws/:lawId` の route。
- 法令タイトル、法令番号、取得日時、施行日、保存状態の表示。
- `LawNode[]` から本文を表示する viewer component。
- Part / Chapter / Article / Paragraph / Item / Subitem / SupplementaryProvision / AppdxTable / AppdxStyle の基本表示。
- loading、error、オフライン未保存状態の表示。
- PC 幅とモバイル幅で破綻しない本文レイアウト。

今回は実装しない。

- 目次ツリー、現在位置ハイライト、条文 anchor、条番号ジャンプ。
- 原文表示と読みやすい表示の切り替え。
- IndexedDB 保存、保存解除、保存済み一覧。
- 実 e-Gov API をブラウザから直接叩く runtime fetch。

## Architecture

既存の `AppShell` が desktop 3 カラムと mobile bottom navigation を持つため、#14 では shell を大きく変えない。

`src/app/router.tsx` に `/laws/$lawId` を追加し、`src/app/pages.tsx` から本文ビューアページを export する。ページ本体は `src/app/law-viewer-page.tsx` に分離する。

本文描画は `src/core/viewer/` に置く。`LawNode[]` を domain model のまま受け取り、表示に必要な parent-child 解決と node type 別 className を viewer 側で扱う。データ取得は #14 では fixture-backed の page model から始め、後続で repository / storage に接続できる境界にする。

## Components

### `LawViewerPage`

Route component。

- `lawId` path parameter を受け取る。
- `getLawViewerDocument(lawId)` から page model を取得する。
- loading / error / offline unavailable / ready の状態を `LawViewerState` として表示する。
- ready 状態では `LawDocumentView` に document を渡す。

### `getLawViewerDocument`

`src/app/law-viewer-page.tsx` 内の小さな page adapter。

- `lawId === "129AC0000000089"` のとき、民法 fixture 由来の viewer document を返す。
- 未知の `lawId` では error state を返す。
- #17 以降で repository 取得へ差し替えやすいよう、戻り値を discriminated union にする。

### `LawDocumentView`

`src/core/viewer/LawDocumentView.tsx`。

- `Law`, `LawRevision`, `LawNode[]`, `isSaved` を props で受け取る。
- header にタイトル、法令番号、施行日、取得日時、保存状態を表示する。
- 本文は `LawNodeList` に渡す。

### `LawNodeList`

`src/core/viewer/LawNodeList.tsx`。

- parentId がない top-level node から再帰描画する。
- children は `LawNode.children` の id 順に従う。
- Article はカード状の article block として表示する。
- Paragraph / Item / Subitem はインデントと番号を分けて表示する。
- Part / Chapter / Section 系は見出しとして表示する。
- SupplementaryProvision / appendix 系は本文の連続 block として表示する。

## Data Flow

```text
/laws/$lawId route
  -> LawViewerPage
  -> getLawViewerDocument(lawId)
  -> LawDocumentView
  -> LawNodeList
  -> LawNode renderer
```

`LawNode.rawText` は原文保持、`LawNode.plainText` は今回の表示本文、`LawNode.normalizedText` は #16 の表示モード用に残す。#14 の UI は `plainText` を表示する。

## Visual Layout

### Desktop

既存 `AppShell` の中央ペインに本文ビューアを置く。

```text
┌──────────────┬──────────────────────────────┬──────────────┐
│ 既存ナビ      │ 民法                         │ 既存学習      │
│              │ 明治二十九年法律第八十九号   │              │
│              │ 施行日 / 取得日時 / 未保存    │              │
│              │ 第一編 総則                  │              │
│              │ 第1条                        │              │
│              │   私権は、公共の福祉に...     │              │
└──────────────┴──────────────────────────────┴──────────────┘
```

### Mobile

本文を最優先にし、既存 bottom navigation を残す。

```text
┌────────────────────┐
│ 民法                │
│ 明治二十九年法律... │
│ 施行日 / 取得日時   │
│ 未保存              │
│                    │
│ 第一編 総則         │
│ 第1条               │
│ 私権は、公共の...   │
├────────────────────┤
│ 法令 ジャンプ 撮る 復習 設定 │
└────────────────────┘
```

## Error Handling

- loading state は skeleton を使い、本文領域の高さを保つ。
- unknown lawId は error alert と `/laws` への戻り導線を表示する。
- offline unavailable は「この法令は端末に保存されていません」と表示する。
- 法的助言に見える文言は出さず、本文閲覧 UI に徹する。

## Accessibility

- 本文ページは `article` landmark を使う。
- 法令名は route page の h1 とする。
- 条文 block は heading level を飛ばさず、Article title を h2、Part / Chapter を見出しとして扱う。
- ボタンや status は visible text と accessible name が一致するようにする。

## Testing

TDD で進める。

- `src/app/router.test.tsx`: `/laws/129AC0000000089` が本文ビューアを render すること。
- `src/core/viewer/LawDocumentView.test.tsx`: metadata、未保存状態、Article / Paragraph / Item の DOM 表示。
- `src/core/viewer/LawNodeList.test.tsx`: children 順、階層インデント class、附則と別表の表示。
- `src/app/law-viewer-page.test.tsx`: unknown lawId error と offline unavailable state。

UI 変更なので実装後に `playwright-cli open --headed` で desktop と mobile 幅を確認する。

## Implementation Notes

- 既存 `PagePanel` は placeholder 用なので、本文ビューアでは使わない。
- nested card は避け、Article だけを独立 block として扱う。
- アイコンは `lucide-react` を使う。
- `@/` alias を使う。
- 文字がはみ出さないよう `min-w-0`, `overflow-wrap:anywhere`, responsive spacing を入れる。
