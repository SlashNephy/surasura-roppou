# スキャナー画面と画像入力の設計

Status: Approved (設計検討セッション 2026-07-11)
Last updated: 2026-07-11

関連ドキュメント:

- [Design Doc](../../design-doc.md) の [7.7 OCR Intake](../../design-doc.md#77-ocr-intake)、[13 OCR Design](../../design-doc.md#13-ocr-design)（特に [13.1 Client-Side First](../../design-doc.md#131-client-side-first)、[13.2 OCR UI](../../design-doc.md#132-ocr-ui)）を実装に落とすものである。
- 対応 Issue: [#35 スキャナー画面と画像入力を実装する](https://github.com/SlashNephy/surasura-roppou/issues/35)（親 [#6](https://github.com/SlashNephy/surasura-roppou/issues/6)、マイルストーン M5: OCR Intake）。
- 依存（解決済み）: [#8 フロントエンド基盤と CI](https://github.com/SlashNephy/surasura-roppou/issues/8)、[#25 検索バー](https://github.com/SlashNephy/surasura-roppou/issues/25)。
- 後続（本 Issue が Blocking）: [#36](https://github.com/SlashNephy/surasura-roppou/issues/36)、[#37](https://github.com/SlashNephy/surasura-roppou/issues/37)、[#40](https://github.com/SlashNephy/surasura-roppou/issues/40)、[#6](https://github.com/SlashNephy/surasura-roppou/issues/6)。これらは OCR エンジン・条文抽出・候補確認 UI を担う。

## 1. 決定事項の要約

- **スコープ**: 「画像を入力してプレビューできる」ところまで。OCR エンジン・テキスト正規化・法令参照抽出・候補ジャンプは本 Issue に**含めない**（後続 #36 / #37）。captured 状態では読み取りが「準備中」であることを正直に示す。
- **カメラ方式**: **ハイブリッド**。`navigator.mediaDevices.getUserMedia` が使える環境ではアプリ内ライブプレビュー＋シャッターで撮影し、非対応・権限拒否時は `<input type="file" capture="environment">`（OS カメラ）とライブラリ選択にフォールバックする。「権限エラー時の UI」要件はこの getUserMedia 経路の失敗ハンドリングで満たす。
- **クリップボード貼り付け**: 本 Issue のスコープ外。既存プレースホルダーの「貼り付け」ボタンは撤去する（Design Doc §7.7 には入力手段として記載があるが、Issue の作業リストには無いため後続に委ねる）。
- **プライバシー明示**: 画像を端末外へ送信しないことを UI に明記する（ユーザー要望）。既存の「🔒 画像は端末内で処理され、保存・送信されません」を軸に、idle と撮影/選択の導線で視認できるよう配置する。
- **モジュール境界**: 取り込みのドメイン（Blob / File・分類済みエラー・object URL ライフサイクル）を新規 `core/ocr` に置き、DOM / React 依存（getUserMedia ストリーム・canvas 描画・状態遷移）を `app` に閉じ込める。`getUserMedia` は `CameraStreamProvider` インターフェースで抽象化し、既定引数で本番実装を注入する（既存 repository DI 流儀に合わせ、テストの決定性を確保する）。

## 2. スコープ

| 項目                                                        | 本 Issue #35     | 担当             |
| ----------------------------------------------------------- | ---------------- | ---------------- |
| `core/ocr` 取り込みドメイン（型・File 取り込み・エラー分類）| ○                |                  |
| `/scanner` 画面（idle / camera / permissionError / preview）| ○（app）         |                  |
| カメラ撮影 UI（getUserMedia ライブプレビュー＋シャッター）  | ○（app）         |                  |
| 画像アップロード UI（ライブラリ選択）                       | ○（app）         |                  |
| 撮影/選択画像のプレビュー                                   | ○（app）         |                  |
| 権限エラー時の UI＋フォールバック                           | ○（app）         |                  |
| 単体・コンポーネントテスト                                  | ○                |                  |
| クリップボード貼り付け                                      | ×（後続）        | 将来             |
| 画像の前処理（トリミング・回転・明るさ）                    | ×（Design §13.2）| 後続             |
| OCR エンジン・テキスト正規化                                | ×                | #36 / #37        |
| 法令参照抽出・候補ジャンプ・復習カード化                    | ×                | #37 系 / 後続    |

## 3. アーキテクチャ

```
┌─ core/ocr（新規・DOM/React 非依存の取り込みドメイン） ───────────┐
│  types.ts   CaptureSource / CapturedImage / CameraErrorKind      │
│  capture.ts createCapturedImageFromFile / releaseCapturedImage   │
│             / isImageFile                                        │
│  camera.ts  CameraStreamProvider（interface）                    │
│             createCameraStreamProvider()（getUserMedia 既定実装） │
│             classifyCameraError / isCameraSupported              │
└──────────────────────────────────────────────────────────────────┘
      ▲ CapturedImage を後続 OCR（#36/#37）が消費する入口
      │
┌─ app 層 ─────────────────────────────────────────────────────────┐
│  scanner-page.tsx  画面本体・状態遷移・プライバシー明示          │
│  use-camera.ts     getUserMedia ストリーム/ライフサイクル/       │
│                    映像フレーム → canvas → Blob（CapturedImage） │
└──────────────────────────────────────────────────────────────────┘
```

`core/ocr` は Blob / File と分類済みエラーだけを扱い、`MediaStream` の取得は `CameraStreamProvider` の背後に隠す。canvas 描画・`HTMLVideoElement` 制御は純粋関数化できないため `use-camera.ts`（app 層）に隔離する。

## 4. core: `core/ocr`

### 4.1 型（`types.ts`）

```ts
// 取り込み元。プレビューやログでの区別、後続 OCR の前処理分岐に使う。
export type CaptureSource = "camera" | "upload";

// 端末内メモリに保持する取り込み結果。保存・送信はしない。
export interface CapturedImage {
  blob: Blob; // 撮影は canvas.toBlob、アップロードは File（Blob のサブタイプ）
  objectUrl: string; // <img src> 用。差し替え/破棄時に revoke する
  source: CaptureSource;
  fileName?: string; // アップロード時のみ。撮影は未設定
}

// getUserMedia 失敗を UI 文言に写像するための分類。
export type CameraErrorKind =
  | "permission-denied" // NotAllowedError / SecurityError
  | "not-found" // NotFoundError / OverconstrainedError
  | "not-supported" // mediaDevices/getUserMedia が無い、非セキュアコンテキスト
  | "unknown";
```

### 4.2 File 取り込み（`capture.ts`）

- `isImageFile(file: File): boolean` — `file.type` が `image/` で始まるかを判定（純粋関数）。
- `createCapturedImageFromFile(file: File): CapturedImage | undefined` — 画像でなければ `undefined`。画像なら `URL.createObjectURL(file)` で object URL を作り `CapturedImage`（`source: "upload"`、`fileName: file.name`）を返す。
- `releaseCapturedImage(image: CapturedImage): void` — `URL.revokeObjectURL(image.objectUrl)`。プレビュー差し替え・アンマウント時に呼び、object URL のリークを防ぐ。

### 4.3 カメラ（`camera.ts`）

```ts
export interface CameraStreamProvider {
  // 背面カメラを優先して取得。失敗時は CameraError（kind 付き）で reject する。
  requestStream(): Promise<MediaStream>;
}

export interface CameraError {
  kind: CameraErrorKind;
  cause?: unknown;
}

export function createCameraStreamProvider(): CameraStreamProvider;
export function classifyCameraError(error: unknown): CameraErrorKind;
export function isCameraSupported(): boolean;
```

- `createCameraStreamProvider` は `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })` を呼び、reject を `classifyCameraError` で分類して `CameraError` に包み直す。
- `classifyCameraError` は `DOMException.name` を `CameraErrorKind` に写像する純粋関数（`NotAllowedError`/`SecurityError`→`permission-denied`、`NotFoundError`/`OverconstrainedError`→`not-found`、その他→`unknown`）。
- `isCameraSupported` は `navigator.mediaDevices?.getUserMedia` の有無を返す（SSR/非セキュアコンテキストで `false`）。

## 5. app: `use-camera.ts`

getUserMedia のストリーム取得・保持・破棄と、映像フレームの Blob 化を担う hook。`CameraStreamProvider` を引数で受け取り、テストで fake 差し替え可能にする。

- `start()` — provider から `MediaStream` を得て `videoRef` に接続、再生開始。失敗時は `CameraErrorKind` を `error` state に格納。
- `capture(): Promise<CapturedImage | undefined>` — `videoRef` の現在フレームを offscreen `<canvas>` に描画し、`canvas.toBlob` で JPEG Blob を得て `CapturedImage`（`source: "camera"`）を返す。
- `stop()` — すべての `MediaStreamTrack` を停止し `videoRef` を解放する。アンマウント時にも必ず呼ぶ（カメラ点灯の残留を防ぐ）。
- 公開する state: `status`（`idle` / `active` / `error`）、`error`（`CameraErrorKind`）、`videoRef`。

## 6. app: `scanner-page.tsx`

`pages.tsx` の暫定 `ScannerPage` を削除し、本ファイルに実装して `pages.tsx` から re-export する（既存 `HomePage`/`SearchPage` と同じ分離方針）。`router.tsx` は変更不要（`component: ScannerPage` のまま）。

### 6.1 props / DI

```ts
export const ScannerPage = ({
  cameraStreamProvider = defaultCameraStreamProvider,
}: {
  cameraStreamProvider?: CameraStreamProvider;
}) => { /* ... */ };
```

テストは `scanner-page.tsx` を直接 import し、fake provider を注入する。

### 6.2 状態遷移

```
idle ──「撮る」──▶ cameraActive ──シャッター──▶ captured
  │                    │
  │                    └─ 取得失敗 ─▶ permissionError ─(フォールバック)─▶ captured
  │
  └──「画像を選ぶ」/ フォールバック選択 ─▶ captured
captured ──「撮り直す/選び直す」──▶ idle（object URL を revoke）
```

- **idle**: 見出し「問題集や資料から条文を開く」＋プライバシー注記（🔒 端末内処理・保存/送信なし）＋主要2アクション「撮る」「画像を選ぶ」。`isCameraSupported()` が `false` の環境では「撮る」を OS カメラ（`<input capture>`）へ委ねる。
- **cameraActive**: `use-camera` のライブ映像＋シャッターボタン＋キャンセル。映像の下にもプライバシー注記を残す。
- **permissionError**: `role="alert"` で `CameraErrorKind` に応じた説明（権限拒否は再許可の案内、非対応は OS カメラ案内）。フォールバックとして OS カメラ `<input type="file" accept="image/*" capture="environment">` とライブラリ選択を並べる。
- **captured**: プレビュー画像（`objectUrl`）＋「撮り直す／選び直す」＋「条文の読み取りは準備中です」注記（OCR は後続 Issue）。

### 6.3 アクセシビリティ / レスポンシブ

- エラーは `role="alert"`、各ボタンに可視ラベル＋必要なら `aria-label`、ライブ映像に説明。
- モバイル幅＝下部プライマリ配置、デスクトップ幅も両対応（AGENTS.md フロントエンド規約）。表示テキストがコンテナからはみ出さないようにする。
- アイコンは lucide の `Camera` / `ImageUp` / `X` 等を用いる。

## 7. プライバシー

- 画像は `CapturedImage`（Blob / object URL）として端末内メモリにのみ保持し、保存・送信しない（Design Doc §13.1、AGENTS.md 実装方針）。
- 送信しないことを UI に明記する（ユーザー要望）。idle と撮影/選択の導線で注記が視認できるよう配置する。

## 8. テスト方針

- **core/ocr**（table testing）:
  - `isImageFile`: `image/png` 等は `true`、`application/pdf`・空文字は `false`。
  - `classifyCameraError`: `NotAllowedError`/`SecurityError`→`permission-denied`、`NotFoundError`/`OverconstrainedError`→`not-found`、未知の `DOMException`・非 Error→`unknown`。
  - `createCapturedImageFromFile`: 画像 File → `CapturedImage`（`source: "upload"`・`fileName` 設定・`objectUrl` あり）、非画像 → `undefined`。`URL.createObjectURL` はテストでスタブする。
- **app `scanner-page`**（Testing Library・ユーザー視点、fake `CameraStreamProvider` 注入）:
  - アップロード: 画像 File を選択 → プレビュー `<img>` が現れる。
  - 権限拒否: provider が `permission-denied` で reject →「撮る」押下で権限エラー UI（`role="alert"`）とフォールバックが現れる。
  - キャンセル: cameraActive でキャンセル → idle に戻る。
  - プライバシー注記が idle で可視である。
  - `canvas.toBlob`・`HTMLMediaElement.play` はテストでモックする。
- 検証ゲート: `pnpm run typecheck` / `lint` / `format:check` / `test`。UI 導線を変えるため `playwright-cli open --headed` で idle → 撮影/選択 → プレビューを実画面確認し、スクショを PR に添付する。PR 前に `pnpm run review:antigravity` を実行する。

## 9. 未解決・後続に委ねる点

- クリップボード貼り付け（Design Doc §7.7 の入力手段）。
- 撮影後の画像前処理（トリミング・回転・明るさ調整、Design Doc §13.2）。
- OCR エンジン・テキスト正規化・法令参照抽出・検出箇所の画像ハイライト・候補確認 UI（#36 / #37 系）。
- 撮影画像を後続 OCR パイプラインへ引き渡す配線（`CapturedImage` を入口として定義するに留める）。
