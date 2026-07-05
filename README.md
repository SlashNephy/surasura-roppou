# すらすら六法

**すらすら六法** は、e-Gov 法令データをもとに、法令を読みやすく閲覧し、学習中に出会った条文をすぐ確認・保存・復習できる Web/PWA アプリです。

既存の Android アプリ **ときどき六法** は通知・バックグラウンド処理・ネイティブ体験を担い、すらすら六法はレスポンシブ Web/PWA として、法令ビューア、条文参照ジャンプ、OCR、ブックマーク、オフライン閲覧、クイズ復習を担います。

## Product Scope

すらすら六法は、法律学習や実務調査で頻出する「条文を探す、読む、保存する、復習する」流れを短くすることを目指します。

- `国賠法1条`、`民709` のような条文参照から目的の条文へすぐ移動する。
- e-Gov 由来の法令本文を、原文を保持したまま読みやすく表示する。
- 法令、条、項、号を保存し、オフライン閲覧や復習カードへつなげる。
- カメラ、画像、クリップボード、手入力から条文参照を取り込む。
- 法的助言や個別事案への結論提示は扱わず、根拠条文を確認する学習補助に徹する。

## Documentation

- [docs/design-doc.md](docs/design-doc.md)
- [docs/tasks.md](docs/tasks.md)
- [docs/adr/README.md](docs/adr/README.md)

`docs/design-doc.md` はプロダクト方針と設計の canonical document です。`docs/tasks.md` は GitHub Issues の親子関係、フェーズ、依存関係を追うための索引です。

## Tech Stack

- React 19
- Vite 8
- TypeScript 6
- TanStack Router
- Tailwind CSS 4
- radix-ui / shadcn/ui style の共通 UI
- lucide-react
- Vitest + Testing Library + jsdom
- ESLint strict type checked config
- Prettier
- mise + pnpm

## Development

初回セットアップ:

```bash
mise install
pnpm install
```

開発サーバー:

```bash
pnpm dev
```

品質チェック:

```bash
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
```

PR 前の独立レビュー:

```bash
pnpm run review:antigravity
```

`review:antigravity` は Antigravity CLI (`agy`) が利用できない環境では skip します。skip した場合は、PR 本文や最終報告にその旨を記録します。

## Deployment

Cloudflare Pages に Vite の `dist` を配信します。
`public/_redirects` で SPA fallback を明示しているため、`/laws/:lawId` などのクライアントルーティング URL へ直接アクセスしても `index.html` が返ります。

Cloudflare Pages の build 設定:

- Build command: `pnpm run build`
- Build output directory: `dist`
- Environment variables: `NODE_VERSION=24.16.0`, `PNPM_VERSION=11.7.0`

本番 build のローカル確認:

```bash
pnpm run build
pnpm preview
```

## Repository Layout

- `src/app/`: アプリシェル、ルーター、ページ単位の実装。
- `src/core/domain/`: 法令、条文参照、保存対象、学習カードなどのドメイン型。
- `src/core/egov/`: e-Gov 法令 API 由来データの取得と正規化。
- `src/shared/ui/`: 再利用する UI primitives。
- `src/shared/utils/`: 汎用ユーティリティ。
- `src/test/`: テストセットアップ。
- `public/`: PWA manifest や静的アセット。
- `docs/`: プロダクト設計、タスク整理、実装計画。

## Relationship with ときどき六法

ときどき六法は Android ネイティブの強みを活かし、通知、バックグラウンド処理、端末機能との統合を担います。すらすら六法は Web/PWA として、PC・タブレット・スマートフォンを横断した閲覧、検索、OCR、復習導線を担います。

将来的には、安定 URL、Android App Links、export/import、アカウント同期などを通じて連携します。通知機能を PWA 側で無理に完全再現することは、現時点では目標に含めません。
