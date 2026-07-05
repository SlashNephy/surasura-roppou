# Test Utilities

このディレクトリには、テストセットアップと共有 fixture を置く。

## Fixture policy

- 共有 fixture は `src/test/fixtures/` に置く。
- fixture はテスト専用であり、アプリ本体の実装コードから import しない。
- e-Gov API response の fixture は、外部 API の形を repository contract で検証するために使う。
- 条文参照、文字列正規化、読みやすさ変換の fixture は、後続 Issue の parser / normalizer 実装でそのまま table testing に使う。
- fixture を追加するときは、名称が一意で、入力と期待値の意図が分かる形にする。

## Browser verification

Playwright は npm dependency として追加しない。AGENTS.md の方針に従い、UI 変更やブラウザ確認が必要な作業では、環境に用意された `playwright-cli open --headed` を使う。

Issue #10 はテスト基盤と fixture の整備がスコープであり、今回の変更では UI を変更しない。そのためブラウザ自動化は実施対象外とする。
