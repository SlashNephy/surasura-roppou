# AGENTS.md

すらすら六法は、e-Gov 法令データをもとにした法令ビューア、条文参照ジャンプ、OCR 取り込み、ブックマーク、復習を扱う Web/PWA アプリです。
既存の Android アプリ「ときどき六法」は通知やネイティブ体験を担い、このリポジトリは PC・タブレット・スマートフォンから使える読みやすい法令学習体験を担当します。

プロダクト仕様や設計判断の背景が必要な場合は、`docs/design-doc.md` を参照してください。

## 技術スタック

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

## 主要ディレクトリ

- `src/app/`: アプリシェル、ルーター、ページ単位の実装
- `src/shared/ui/`: 再利用する UI primitives
- `src/shared/utils/`: 汎用ユーティリティ
- `src/test/`: テストセットアップ
- `public/`: PWA manifest や静的アセット
- `docs/`: プロダクト設計や実装計画

## コマンド

```bash
mise install
pnpm install
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

## Antigravity review

PR を作成する前に `pnpm run review:antigravity` を実行してください。
PR 作成後に大きな変更を入れた場合も、再度実行してください。

このコマンドは `script/antigravity-review.sh` を通じて Antigravity CLI (`agy`) による静的レビューを行います。
`agy` のバージョンは `.mise.toml` で管理します。
`agy` が利用できない環境では skip されるため、その場合は最終報告や PR 本文に記録してください。
非対話環境で権限確認が詰まる場合に限り、信頼できるローカル環境で `ANTIGRAVITY_SKIP_PERMISSIONS=1 pnpm run review:antigravity` を使うことができます。
この設定は `agy --dangerously-skip-permissions` を渡すため、通常は使わないでください。

Antigravity CLI のレビュー後は、クォータ、使用量、残量が出力に含まれていればその値を報告してください。
クォータ情報が出力されず CLI から取得できない場合は、その旨を報告してください。
Antigravity CLI の指摘は鵜呑みにせず、実際のコード、型、実行時 contract、プロジェクト規約に照らして妥当性を検証してください。
Antigravity CLI のレビューを踏まえて修正した場合、その修正後に Antigravity CLI を再実行しないでください。
再レビューの無限ループやクォータ消費を避けるため、通常の品質チェックで検証を終えてください。

## 実装方針

- 法令本文の原文は必ず保持し、読みやすい表示や漢数字変換は表示レイヤーで扱う。
- 法的助言や個別事案への結論提示をアプリ機能として実装しない。
- AI/OCR を扱う場合は、学習補助であること、根拠条文へのリンク、ユーザー同意、画像を保存しない既定動作を重視する。
- OCR 画像はデフォルトで端末内処理し、保存しない。
- 保存データはローカル優先とし、同期機能を入れる場合は同期対象をユーザーが選べるようにする。
- 画面は法令を読む・探す・復習するための作業 UI として設計し、装飾より可読性、操作効率、アクセシビリティを優先する。

## フロントエンド規約

- ルーティングは `src/app/router.tsx` に集約する。
- ページの大枠は `src/app/pages.tsx`、アプリ共通の外枠は `src/app/AppShell.tsx` に置く。
- 共通 UI は `src/shared/ui/` に置き、既存の variant / className 合成パターンを使う。
- `@/` alias は `src/` を指す。
- アイコンは原則として `lucide-react` を使う。
- UI 変更ではデスクトップ幅とモバイル幅の両方を意識する。
- 表示テキストがコンテナからはみ出さないようにする。
- アクセシビリティ上の名前、ランドマーク、キーボード操作を維持する。

## テスト方針

- 実装詳細の文字列探索だけで通るテストは避ける。
- ルーティング、ユーザーから見える DOM、公開 API、変換ロジックなど、意味のある契約を検証する。
- UI コンポーネントでは Testing Library でユーザー視点の振る舞いを見る。
- 新しい純粋関数を追加する場合は table testing に近い形で代表ケースと境界ケースを並べる。
- フロントエンドの見た目や導線を変えた場合は、`playwright-cli open --headed` によるブラウザ確認も行う。

## 注意点

- `.mise.toml` は Node、pnpm、agy のバージョン管理の基準です。
- lint や format の設定ファイルは、人間の許可なしに変更しないでください。
- `dist/`、`node_modules/`、`.playwright-cli/`、`.specstory/` の生成物を理由なく編集・コミットしないでください。
- 既存の未コミット変更を勝手に戻さないでください。
- e-Gov API や Antigravity CLI など外部サービスに依存する仕様は、古くなりやすいため必要に応じて現時点の挙動を確認してください。
