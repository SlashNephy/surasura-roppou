# Frontend Foundation Design

## Goal

Issue #8 では、すらすら六法の Web/PWA 実装を始めるためのフロントエンド基盤を作る。
完成 UI や法令データ処理は作り込まず、後続 Issue が乗れる AppShell、ルーティング、UI 基盤、品質チェック、CI を整える。

## Scope

採用するスコープは **AppShell skeleton** とする。

- Vite + React + TypeScript の初期構成を作る。
- TanStack Router で主要画面の入口を作る。
- Tailwind CSS と shadcn/ui を導入する。
- Desktop 3 ペイン layout の雛形を作る。
- Mobile header + bottom navigation の雛形を作る。
- PWA manifest と基本メタ情報を用意する。
- typecheck / lint / format check / test をローカルと CI で実行できるようにする。

## Non-Scope

次の内容は Issue #8 では扱わない。

- e-Gov API 連携。
- 実際の法令本文取得、正規化、保存。
- Service Worker と offline cache。
- IndexedDB schema。
- OCR 処理。
- 条文参照 resolver。
- 学習カードの生成や復習ロジック。
- 完成度の高い本文ビューア UI。

## Tech Stack

- Package manager: pnpm。
- Toolchain pinning: mise で Node.js を固定する。
- Build: Vite。
- UI runtime: React。
- Language: TypeScript strict。
- Routing: TanStack Router。
- Styling: Tailwind CSS。
- UI primitives: shadcn/ui と Radix UI primitives。
- Icons: lucide-react。
- Unit/UI tests: Vitest と Testing Library。
- Browser verification: npm 経由の Playwright ではなく、環境に用意された `playwright-cli open --headed` を使う。

## Architecture

初期構成は次の境界に分ける。

- `src/app`: アプリ起動、router、route 定義、AppShell。
- `src/shared/ui`: shadcn/ui 由来の基本部品と薄い共通 UI。
- `src/shared/utils`: `cn()` のように複数の UI 部品から使う純粋な小ユーティリティ。

TanStack Router は、初期段階では明示的な route tree で始める。
Issue #8 では route 数が少ないため、file-based routing よりも起動点から構造を追いやすい。
将来 route が増えた場合は file-based routing へ移行できる余地を残す。

## Routes

Issue #8 の完了条件として、次の入口を用意する。

- `/`: ホームまたはダッシュボード入口。
- `/laws`: 法令閲覧入口。
- `/jump`: 条文参照ジャンプ入口。
- `/scanner`: OCR/スキャン入口。
- `/study`: 復習入口。
- `/settings`: 設定入口。

Design Doc には `/scan` の記述もあるが、Issue #8 の完了条件に合わせて `/scanner` を canonical path とする。
必要になった時点で `/scan` から `/scanner` への redirect を検討する。

## Layout

Desktop では 3 ペインの AppShell を作る。

- 左ペイン: 目次、検索結果、保存済み。
- 中央ペイン: 法令本文の表示領域。
- 右ペイン: メモ、定義語、復習カード。

Issue #8 では実データを扱わず、各ペインは後続機能の配置先が分かる静的な雛形にする。

Mobile では header + main content + bottom navigation にする。
bottom navigation には `/laws`, `/jump`, `/scanner`, `/study`, `/settings` の入口を置く。
`/` はトップまたは直近作業への入口として扱い、bottom navigation の主要タブからは外す。

## UI Components

shadcn/ui の初期導入対象は次の通りとする。

- button。
- input。
- card。
- badge。
- separator。
- sheet。
- scroll-area。
- command。
- skeleton。
- sonner。
- breadcrumb。
- resizable。

`card` は個別の小部品や繰り返し項目に限定して使う。
画面全体の section や shell を card で囲わない。

## Theme Direction

初期テーマは `zinc + indigo + amber` を基調にする。

- `zinc`: 本文と基本 UI。
- `indigo`: 検索、ジャンプ、主要操作。
- `amber`: ブックマーク、ハイライト、学習。

画面全体が単一色調に寄りすぎないよう、本文可読性と操作対象の識別性を優先する。

## PWA Boundary

Issue #8 では manifest と基本メタ情報までを扱う。
Service Worker、offline cache、保存済み法令の永続化は後続 Issue で扱う。

## Quality Gates

ローカル script と CI で次を実行できるようにする。

- `typecheck`: TypeScript の型検査。
- `lint`: ESLint。
- `format:check`: Prettier の差分確認。
- `test`: Vitest。

GitHub Actions では pnpm を有効化し、依存関係を lockfile 固定で install してから上記 checks を実行する。

## Test Strategy

初期テストでは、内部実装の詳細ではなく公開挙動を確認する。

- App が主要 route を描画できること。
- AppShell が主要ナビゲーション入口を表示すること。
- Mobile navigation と Desktop navigation の入口が一致すること。
- `src/shared/utils` の小ユーティリティが期待通りに class 名を結合すること。

## Browser Verification

実装後は `playwright-cli open --headed` で開発サーバーを表示し、次の route を確認する。

- `/`
- `/laws`
- `/jump`
- `/scanner`
- `/study`
- `/settings`

確認観点は、初期表示が崩れていないこと、Desktop と Mobile 幅で navigation が破綻しないこと、route 遷移で空白画面にならないこととする。

## Delivery

実装作業では、第9条第1項に基づいて作業ブランチ上で進める。
Issue #8 を満たす PR では、本文に `Closes #8` を入れる。
スクリーンショットを撮影した場合は、PR 本文へ添付する。
