# Issue #94 テーマ統一設計

## 1. 背景

すらすら六法の画面内ブランド色は深緑 `#166534` である一方、PWA アイコン背景とスマートフォンの `theme-color` は紫 `#4f46e5` のまま残っている。
また、PWA の起動背景 `#fafafa` は実画面の背景 `#fcfbf8` とわずかに異なる。

Issue #94 では、ホーム画面のアイコン、PWA 起動時、ブラウザまたは standalone 表示のシステム UI、アプリ画面の間でブランド色が切り替わって見える問題を解消する。

## 2. 採用する方向

アプリアイコン背景、HTML の `theme-color`、Web App Manifest の `theme_color` を、画面内の primary と同じ `#166534` に統一する。
Web App Manifest の `background_color` は、ライトテーマの画面背景と同じ `#fcfbf8` に統一する。

アイコンの本を表す黄、紙色、墨色と既存の形状は維持する。
maskable アイコンとして確保している余白と角丸も変更しない。

## 3. スコープ

### 3.1 対象

- `public/pwa.svg` の背景色を `#166534` へ変更する。
- `index.html` の `meta[name="theme-color"]` を `#166534` へ変更する。
- `src/core/pwa/config.ts` の `theme_color` を `#166534`、`background_color` を `#fcfbf8` へ変更する。
- 静的配信用の `public/manifest.webmanifest` も同じ値へ変更する。
- 既存の PWA 設定テストを新しい公開契約へ更新する。
- production build の生成 manifest と配信アイコンを確認する。
- headed ブラウザのモバイル幅で、meta、favicon、画面のブランド色を確認する。

### 3.2 対象外

- ライトテーマとダークテーマに応じた `theme-color` の動的変更。
- 表示設定ストレージやテーマ選択 UI の変更。
- アイコンの図形、文字、maskable 領域の再設計。
- PNG、ICO、Apple touch icon など、新しい形式のアイコン追加。
- CSS カラートークン全体の共通定数化。

## 4. 静的契約

PWA 色は、読み込み前からブラウザが参照する HTML、manifest、SVG に存在するため、実行時の TypeScript だけへ集約できない。
Issue #94 ではビルドプラグインやアセット生成処理を追加せず、それぞれの静的境界で値を明示する。

| 境界                        | 色        | 用途                                            |
| --------------------------- | --------- | ----------------------------------------------- |
| `meta[name="theme-color"]`  | `#166534` | モバイルブラウザと standalone 表示のシステム UI |
| manifest `theme_color`      | `#166534` | インストール済み PWA の既定テーマ色             |
| manifest `background_color` | `#fcfbf8` | PWA 起動中の背景                                |
| SVG 最背面                  | `#166534` | ホーム画面とfaviconのアイコン背景               |

色は表示設定のライト／ダーク選択から独立したブランド契約とする。
そのため、初回描画前のテーマ解決スクリプトや React Provider は変更しない。

## 5. エラー処理

新しい実行時処理、ネットワーク要求、ストレージ操作は追加しない。
主な失敗要因は、静的ファイルと生成 manifest の値が再びずれること、または SVG がビルド出力へ含まれないことである。
これらは設定オブジェクトの公開契約テスト、production build の生成物確認、ブラウザからの実取得で検出する。

## 6. テストと検証

### 6.1 TDD

既存の `src/core/pwa/config.test.ts` で、manifest の `theme_color` を `#166534`、`background_color` を `#fcfbf8` と期待するよう先に変更する。
旧実装に対して期待値差分で失敗することを確認してから、設定と静的アセットを変更する。

ソースコードや設定ファイルを文字列検索するだけの新規テストは追加しない。

### 6.2 ビルド契約

`pnpm run build` を実行し、生成された `dist/manifest.webmanifest` の公開値と `dist/pwa.svg` の配信を確認する。
生成物の内容確認は、アプリが配信するファイルの振る舞いを検証するものとして扱う。

### 6.3 実画面

システムの `playwright-cli open --headed` でモバイル幅の画面を開き、次を確認する。

- `meta[name="theme-color"]` の content が `#166534` である。
- manifest と `/pwa.svg` が HTTP 200 で取得できる。
- ヘッダーのブランド緑とアイコン背景が視覚的に一致する。
- ライト／ダークを切り替えても、固定ブランド色の契約が維持される。
- console error がない。

確認画面のスクリーンショットを `github-image-upload` でアップロードし、PR 本文へ添付する。

## 7. 完了条件

- アプリアイコン背景、HTML、生成 manifest、公開 manifest のテーマ色が `#166534` で一致する。
- PWA 起動背景が `#fcfbf8` で実画面と一致する。
- アイコンの既存図形とmaskable領域が維持される。
- 対象テスト、プロジェクト標準チェック、production build が成功する。
- headed ブラウザのモバイル幅で実際の配色と配信契約を確認できる。
- Issue #94 を閉じる PR に、検証証跡とスクリーンショットが掲載される。
