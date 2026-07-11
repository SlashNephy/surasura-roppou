# OCR 処理（画像 → テキスト）の設計

Status: Approved (設計検討セッション 2026-07-11)
Last updated: 2026-07-11

関連ドキュメント:

- [Design Doc](../../design-doc.md) の [7.7 OCR Intake](../../design-doc.md#77-ocr-intake)、[13 OCR Design](../../design-doc.md#13-ocr-design)（特に [13.1 Client-Side First](../../design-doc.md#131-client-side-first)、[13.2 OCR UI](../../design-doc.md#132-ocr-ui)）、[8.1 Performance](../../design-doc.md#81-performance)、[8.3 Privacy](../../design-doc.md#83-privacy)、[9.5 Caching Strategy](../../design-doc.md#95-caching-strategy)、[18 Milestones の Open Question](../../design-doc.md#18-milestones)（「OCR は Tesseract.js で十分か」）を実装に落とすものである。
- 対応 Issue: [#36 OCR処理を実装する](https://github.com/SlashNephy/surasura-roppou/issues/36)（親 [#6](https://github.com/SlashNephy/surasura-roppou/issues/6)、マイルストーン M5: OCR Intake）。
- 依存（解決済み）: [#10 テスト基盤とfixture](https://github.com/SlashNephy/surasura-roppou/issues/10)、[#35 スキャナー画面と画像入力](https://github.com/SlashNephy/surasura-roppou/issues/35)。
- 姉妹設計: [スキャナー画面と画像入力の設計](./2026-07-11-scanner-intake-design.md)（`core/ocr` の取り込み層・`CapturedImage` 契約はここで確立済み）。
- 後続（本 Issue が Blocking）: [#37 OCR結果から条文参照候補を抽出する](https://github.com/SlashNephy/surasura-roppou/issues/37)、[#40](https://github.com/SlashNephy/surasura-roppou/issues/40)。本 Issue の出力 `OcrResult` を #37 が消費する。

## 1. 決定事項の要約

- **スコープ**: 「入力画像からテキストを取得できる」ところまで。画像の前処理（サイズ調整）・OCR エンジン実行・生テキスト表示・進捗表示・キャンセルを含む。テキスト正規化・法令参照抽出・候補確認 UI・§13.2 の画像上ハイライトは**含めない**（後続 #37 系）。
- **OCR エンジン**: **Tesseract.js**（WASM 版 Tesseract 5）。Design Doc §18 の既定候補であり、Web Worker を内部生成し、進捗ロガーと `worker.terminate()` によるキャンセルまでエンジン自体が備えるため、Issue の作業（worker lazy load / 進捗 / キャンセル）と素直に噛み合う。手書き Worker は作らない。
- **日本語モデル**: `tessdata_fast/jpn`（実測 2.4MB、gzip 済み `jpn.traineddata.gz` は約 1.5MB）。`tessdata_best/jpn` は 13.7MB、標準 `tessdata/jpn` は 34.0MB。fast はモバイル初回体験を最優先し、精度は後続 #37 の**候補確認 UI**（§7.6「OCR 由来は必ず候補確認を挟む」）と手入力 fallback（§18 リスク表）で補う前提で選定する。**横書き `jpn` のみ**とし、縦書き `jpn_vert` は §13.1 の既知トレードオフとして本 Issue では見送る。
- **モデル配布**: **自オリジン配信**。`public/tessdata/jpn.traineddata.gz` をリポジトリにコミットし、取得元 URL とバージョン（コミット SHA）を `public/tessdata/README.md` に明記する。fast なのでコミットが現実的で、第三者オリジンへのリクエストがゼロになり §8.3「画像を端末外に出さない」の趣旨（モデル取得も含めて自オリジンに閉じる）と整合する。Tesseract.js の `corePath`（WASM）・`workerPath` も同一オリジンから配る。
- **モデルのロード方式**: **opt-in + lazy load**。tesseract.js は初回読み取り時に**動的 import** し、Worker/WASM/モデルの取得は初回のみ行う。traineddata は Tesseract.js が IndexedDB に自動キャッシュするため 2 回目以降とオフラインで再取得しない。初回はモデル未キャッシュ時に「日本語モデル（約2.4MB）をダウンロードします」を確認し、同意をローカルストレージに保存する。
- **モジュール境界**: OCR ドメイン（前処理・認識・型）を既存 `core/ocr` に追加し、DOM/React 依存（状態遷移・進捗表示・キャンセル操作）は `app` に閉じ込める。tesseract.js の worker 生成は `OcrWorkerFactory` インターフェースで抽象化し、既定引数で本番実装を注入する（既存 `CameraStreamProvider` / `storageRepository` の DI 流儀に合わせ、テストの決定性を確保する）。

## 2. スコープ

| 項目                                                    | 本 Issue #36 | 担当      |
| ------------------------------------------------------- | ------------ | --------- |
| 画像前処理（長辺リサイズ・canvas 正規化）               | ○（core）    |           |
| OCR エンジン（tesseract.js 動的 import・worker 生成）    | ○（core）    |           |
| 日本語モデルの自オリジン配置と opt-in ダウンロード      | ○            |           |
| `OcrResult`（text / confidence / words[bbox]）の生成    | ○（core）    |           |
| scanner 画面への配線（同意・進捗・キャンセル・生テキスト表示） | ○（app）  |           |
| 単体・コンポーネントテスト＋実ブラウザ検証              | ○            |           |
| テキスト正規化（漢数字・全半角・改行整形）              | ×（後続）    | #37       |
| 法令参照抽出・候補確認 UI・画像上ハイライト             | ×            | #37 / 後続 |
| 縦書き（`jpn_vert`）・トリミング/回転/明るさ調整        | ×（§13）     | 将来      |
| fast/best のユーザー切替設定                            | ×（YAGNI）   | 将来      |

## 3. アーキテクチャ

```text
┌─ core/ocr（既存・DOM 非依存の取り込み層に OCR を追加） ───────────────┐
│  types.ts       CapturedImage 等（既存）＋ OcrResult / OcrWord /       │
│                 OcrProgress / OcrErrorKind を追記                      │
│  preprocess.ts  computeResizeDimensions()（純関数・テスト対象）／      │
│                 prepareImageForOcr(blob)（canvas 縮小・正規化）        │
│  recognizer.ts  OcrWorkerFactory（interface）／                        │
│                 createOcrRecognizer({ workerFactory })→               │
│                   recognize(blob,{ signal, onProgress }) / terminate() │
│  model.ts       langPath / corePath / MODEL_LANG / MODEL_SIZE_BYTES    │
└────────────────────────────────────────────────────────────────────────┘
      ▲ OcrResult を後続 #37（参照候補抽出）が消費する出口
      │
┌─ app 層 ─────────────────────────────────────────────────────────────┐
│  use-ocr.ts       状態遷移（idle→consent→downloading→recognizing→...） │
│                   AbortController・進捗 state・recognizer ライフサイクル│
│  scanner-page.tsx プレビュー画面の「準備中」表記を実 OCR 導線に置換    │
└────────────────────────────────────────────────────────────────────────┘
```

`core/ocr` は Blob と `OcrResult` だけを公開契約とし、tesseract.js への依存（worker/WASM/モデル取得）は `recognizer.ts` の内部と `OcrWorkerFactory` の背後に隠す。canvas 描画（前処理）は純粋関数化できないため `preprocess.ts` に隔離し、寸法計算だけ `computeResizeDimensions()` として切り出してテストする。

## 4. core: `core/ocr`

### 4.1 型（`types.ts` に追記）

```ts
// 語単位の認識結果。bbox は前処理後画像の座標系（#37 のハイライト・並び復元に使う）。
export interface OcrWord {
  text: string;
  confidence: number; // 0..100（tesseract の word confidence）
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

// #36 の出力契約。#37 がテキスト正規化・参照抽出の入力に使う。
export interface OcrResult {
  text: string;
  confidence: number; // 0..100（ページ全体）
  words: OcrWord[];
}

// 進捗。status は tesseract のフェーズ、progress は 0..1。
export interface OcrProgress {
  status: "loading-model" | "recognizing";
  progress: number;
}

// 失敗の UI 文言への写像。手入力 fallback へ必ず逃がすため種別化する。
export type OcrErrorKind = "model-download-failed" | "engine-load-failed" | "recognize-failed" | "unknown";
```

### 4.2 前処理（`preprocess.ts`）

- `computeResizeDimensions(width, height, maxEdge = 2000)`: 長辺が `maxEdge` を超える場合のみ縦横比を保って縮小した整数寸法を返す純関数。上限以下は原寸のまま返す。大きな写真を等倍で OCR に流すと WASM のメモリと処理時間が跳ねるため、長辺 2000px を既定上限とする（モバイル撮影の実用解像度をおおむね保ちつつ WASM 負荷を抑える閾値）。
- `prepareImageForOcr(blob, { maxEdge })`: `createImageBitmap(blob)` → `computeResizeDimensions` → canvas へ描画 → `canvas.convertToBlob`/`toBlob` で PNG Blob を返す。DOM 依存のため純粋関数化せず、寸法計算のみテストする。

### 4.3 認識（`recognizer.ts`）

- `OcrWorkerFactory`: tesseract.js の worker 生成を抽象化するインターフェース。`create(onProgress): Promise<Worker-like>`（`recognize(blob)` と `terminate()` を持つ最小形）。本番実装は `createOcrWorkerFactory()` が tesseract.js を**動的 import** し、`createWorker("jpn", 1, { langPath, corePath, workerPath, logger })` で生成する。
- `createOcrRecognizer({ workerFactory = createOcrWorkerFactory() })`:
  - `recognize(blob, { signal, onProgress })`: worker を（未生成なら）生成し、`logger` の進捗を `OcrProgress` に写像して `onProgress` へ流し、`worker.recognize(blob)` の結果を `OcrResult` に整形して返す。`signal.aborted` / `abort` イベントで `terminate()` を呼びキャンセルする。
  - `terminate()`: worker を破棄する。scanner を離れる/やり直す際に呼ぶ。
- worker は初回 `recognize` まで生成しない（lazy load）。これにより tesseract.js 本体と WASM のダウンロードも初回まで遅延する。

### 4.4 モデル配置（`model.ts` と `public/tessdata/`）

- `public/tessdata/jpn.traineddata.gz`（`tessdata_fast` 由来）をコミットする。`public/tessdata/README.md` に取得元（`https://github.com/tesseract-ocr/tessdata_fast`）・ファイル・取得時点のコミット SHA・サイズを記録し、由来と更新手順を文書で担保する（Renovate 追跡対象外のため）。
- `model.ts` に `MODEL_LANG = "jpn"`、`MODEL_SIZE_BYTES`（同意文言「約2.4MB」の単一の出所）、`langPath`（`/tessdata` 等の自オリジン）、`corePath`（自オリジン配置の tesseract.js-core）を定義する。
- corePath/workerPath も同一オリジンから配るため、Vite のアセット配置（`public/` へのコピー、または依存パッケージからのコピー手順）を実装計画で確定する。

## 5. app: scanner 画面への配線

### 5.1 状態遷移（`use-ocr.ts`）

既存 `use-camera.ts` に倣うフック。`createOcrRecognizer` を既定引数で注入し、テストで fake に差し替え可能にする。

```text
idle ─(読み取る)→ [モデル未同意?] ─yes→ consent ─(同意)→ downloading(進捗)
                                    └no──────────────────→ recognizing(進捗%)
downloading → recognizing → done(OcrResult)
任意フェーズ ─(キャンセル)→ idle
任意フェーズ ─(失敗)→ error(kind)  →(再試行 / 手入力へ)
```

- キャンセルは `AbortController` を握り、`abort()` → recognizer が `terminate()`。
- 同意フラグは既存 storage 層（`idb`）に保存し、キャッシュ済みなら consent を飛ばす。

### 5.2 画面（`scanner-page.tsx`）

- プレビュー画面（`image !== undefined`）の「条文の読み取りは準備中です。」を、`読み取る` ボタン＋状態表示に置換する。
- **同意**: 「日本語モデル（約2.4MB）をダウンロードします。以降はオフラインで使えます。」＋実行/やめる。
- **進捗**: 進捗バー＋パーセント。`role="status"` / `aria-live="polite"` で読み上げ、`キャンセル` ボタンを常時提示。
- **完了**: 認識した生テキストをスクロール可能領域に表示（暫定。#37 で参照候補表示に差し替え）。`やり直す` で再取り込み。
- **失敗**: `OcrErrorKind` ごとの文言＋`再試行`。§18 リスク表に従い、常に「別の画像を選ぶ／手入力」に逃がせるようにする。
- デスクトップ幅・モバイル幅の両方で崩れないこと、テキストがコンテナからはみ出さないことを担保する。

## 6. エラー処理

- モデル DL 失敗・エンジン（WASM/worker）ロード失敗・認識失敗を `OcrErrorKind` で分類し、`app` 側で文言へ写像する。
- いずれも握りつぶさず（no silent failure）、UI に状態を表示し、手入力/別画像への fallback を必ず提示する。
- キャンセル（`AbortError`）はエラーではなく idle 復帰として扱い、失敗表示しない。

## 7. テスト方針

- `computeResizeDimensions`: table test（上限未満＝原寸／横長／縦長／正方形／境界 = 2000）。
- `recognizer`: fake `OcrWorkerFactory` を注入し、(1) 進捗コールバックが `OcrProgress` に正しく写像されること、(2) `AbortSignal` で `terminate()` が呼ばれ recognize が中断されること、(3) worker の生 words → `OcrResult` 整形、を検証する。実 WASM は動かさない。
- `use-ocr` + `scanner-page`: Testing Library で fake recognizer を注入し、同意→進捗表示→生テキスト表示、キャンセルで idle 復帰、失敗時に fallback 導線が出ることを、ユーザー視点の DOM で検証する。
- 実ブラウザ: `playwright-cli open --headed` で、日本語の条文テキストを描画した**合成 fixture 画像**を実 OCR し、テキストが取得できることをスクリーンショットで証跡化して PR に添付する。fixture 画像は**実装完了後に用意**し、この検証は実装コードが揃ってから行う（実装作業のブロッカーにはしない）。
- 実装詳細の文字列探索だけで通るテストは書かない（AGENTS.md テスト方針）。

## 8. リスクと対応

| リスク                                       | 影響                       | 対応                                                           |
| -------------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| fast モデルの精度が低い                      | テキストの誤認識           | #37 の候補確認 UI・手入力 fallback。将来 best への差し替え余地を型で確保 |
| 初回モデル DL がモバイルで重い               | 初回体験の重さ             | fast（2.4MB）採用・opt-in・lazy load・IndexedDB キャッシュ      |
| WASM/worker が Vite で正しく配信されない      | 実行時ロード失敗           | corePath/workerPath を自オリジンに固定。実ブラウザ検証を必須化 |
| jsdom で canvas/OffscreenCanvas が使えない    | 前処理の単体テスト不可     | 寸法計算を純関数に分離してテスト。描画は実ブラウザ検証で担保   |
| 縦書き・ルビ・斜め撮影                        | 認識失敗                   | 本 Issue では非対応と明示。横書き前提の案内文言                |

## 9. 未確定事項（実装計画で確定）

- tesseract.js / tesseract.js-core のバージョンと、Vite での corePath/workerPath 配信手順（`public/` コピー or 依存パッケージからのコピー）。
- 同意フラグの storage への保存キーとスキーマ（既存 storage バージョンとの整合）。
- 合成 fixture 画像の生成方法（テスト時オンザフライ生成 or 事前生成アセット）。実装完了後に用意し、実ブラウザ検証で用いる。
