# すらすら六法 Task Index

Last updated: 2026-07-05

この文書は GitHub Issues の親子関係、フェーズ、依存関係をリポジトリ内から追うための索引である。実際の作業状態、議論、担当者は GitHub Issues を正とする。

## 1. 基本方針

- プロダクト仕様と設計判断の背景は [design-doc.md](design-doc.md) を正とする。
- 作業単位は GitHub Issue を正とする。
- 大きな親 Issue はマイルストーンや体験単位を表し、子 Issue は実装可能な粒度に分割する。
- ADR が必要な判断は [adr/README.md](adr/README.md) の規約に従って記録する。
- 法令本文の原文は必ず保持し、読みやすい表示や漢数字変換は表示レイヤーで扱う。
- OCR 画像はデフォルトで端末内処理し、保存しない。
- 法的助言や個別事案への結論提示はアプリ機能として実装しない。

## 2. フェーズ一覧

| Phase | Goal                                           | Parent Issue                                                 | Status      |
| ----- | ---------------------------------------------- | ------------------------------------------------------------ | ----------- |
| M0    | 開発基盤、設計、型、取得層、初期 docs を整える | [#1](https://github.com/SlashNephy/surasura-roppou/issues/1) | In progress |
| M1    | e-Gov データを使った法令ビューア MVP を作る    | [#2](https://github.com/SlashNephy/surasura-roppou/issues/2) | Open        |
| M2    | PWA、オフライン保存、ブックマークを作る        | [#3](https://github.com/SlashNephy/surasura-roppou/issues/3) | Open        |
| M3    | 参照検索、略称、検索バーを作る                 | [#4](https://github.com/SlashNephy/surasura-roppou/issues/4) | Open        |
| M4    | 学習カード、クイズ、復習を作る                 | [#5](https://github.com/SlashNephy/surasura-roppou/issues/5) | Open        |
| M5    | OCR で撮って条文を開く体験を作る               | [#6](https://github.com/SlashNephy/surasura-roppou/issues/6) | Open        |
| M6    | ときどき六法連携、品質、運用を整える           | [#7](https://github.com/SlashNephy/surasura-roppou/issues/7) | Open        |

## 3. M0: 開発基盤

| Issue                                                          | Title                              | Status | Notes                                                                                           |
| -------------------------------------------------------------- | ---------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| [#8](https://github.com/SlashNephy/surasura-roppou/issues/8)   | フロントエンド基盤とCIを構築する   | Closed | Vite、React、TypeScript、TanStack Router、Tailwind CSS、shadcn/ui style primitives、CI の入口。 |
| [#9](https://github.com/SlashNephy/surasura-roppou/issues/9)   | ドメインモデルと条文パスを定義する | Closed | `src/core/domain` の基礎型と条文参照キー。                                                      |
| [#10](https://github.com/SlashNephy/surasura-roppou/issues/10) | テスト基盤とfixtureを整備する      | Open   | Vitest/CI 導入済み。`src/test/fixtures/` に e-Gov、条文参照、読みやすさ変換 fixture を置く。    |
| [#11](https://github.com/SlashNephy/surasura-roppou/issues/11) | 初期ドキュメントとREADMEを整備する | Open   | README、design doc、task index、ADR 入口を整える。                                              |
| [#12](https://github.com/SlashNephy/surasura-roppou/issues/12) | データ取得層を実装する             | Closed | `src/core/egov` の e-Gov API 取得層。                                                           |

M0 が完了すると、後続 Issue は共通の UI 基盤、ドメイン型、e-Gov 取得層、ドキュメント入口を前提に進められる。

## 4. M1: 法令ビューア MVP

Parent: [#2](https://github.com/SlashNephy/surasura-roppou/issues/2)

| Issue                                                          | Title                                 | Status | Notes                                                                        |
| -------------------------------------------------------------- | ------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| [#13](https://github.com/SlashNephy/surasura-roppou/issues/13) | 本文データをLawNodeツリーへ正規化する | Open   | `src/core/egov/lawText.ts` で e-Gov 由来本文を `LawNode[]` に正規化する。    |
| [#14](https://github.com/SlashNephy/surasura-roppou/issues/14) | レスポンシブな本文ビューア画面を作る  | Open   | `/laws/:lawId` で fixture-backed な本文ビューア MVP を表示する。             |
| [#15](https://github.com/SlashNephy/surasura-roppou/issues/15) | 目次と条文ナビゲーションを実装する    | Open   | `/laws/:lawId/articles/:article`、目次、条番号ジャンプ、本文 anchor の MVP。 |
| [#16](https://github.com/SlashNephy/surasura-roppou/issues/16) | 表示モードと文字列正規化を実装する    | Open   | 原文保持と読みやすい表示の切替。                                             |

## 5. M2: PWA・保存・オフライン

Parent: [#3](https://github.com/SlashNephy/surasura-roppou/issues/3)

| Issue                                                          | Title                                          | Status | Notes                                        |
| -------------------------------------------------------------- | ---------------------------------------------- | ------ | -------------------------------------------- |
| [#17](https://github.com/SlashNephy/surasura-roppou/issues/17) | IndexedDBスキーマと保存リポジトリを定義する    | Open   | 保存データの土台。                           |
| [#18](https://github.com/SlashNephy/surasura-roppou/issues/18) | キャッシュ基盤を実装する                       | Open   | アプリシェルと保存済み法令のキャッシュ。     |
| [#19](https://github.com/SlashNephy/surasura-roppou/issues/19) | 保存済み本文のオフライン閲覧を実装する         | Open   | 保存済み法令をネットワークなしで読む。       |
| [#20](https://github.com/SlashNephy/surasura-roppou/issues/20) | 保存リストとメモを実装する                     | Open   | ブックマーク、メモ、タグの UI と保存。       |
| [#21](https://github.com/SlashNephy/surasura-roppou/issues/21) | コピー・共有・エクスポートの基本導線を実装する | Open   | 出典付きコピー、共有、export/import の入口。 |

## 6. M3: 参照検索

Parent: [#4](https://github.com/SlashNephy/surasura-roppou/issues/4)

| Issue                                                          | Title                      | Status | Notes                                        |
| -------------------------------------------------------------- | -------------------------- | ------ | -------------------------------------------- |
| [#22](https://github.com/SlashNephy/surasura-roppou/issues/22) | 初期の略称辞書を作る       | Open   | `国賠`、`民`、`行手法` などの初期辞書。      |
| [#24](https://github.com/SlashNephy/surasura-roppou/issues/24) | 参照候補の解決を実装する   | Open   | alias、条番号、候補 score を組み合わせる。   |
| [#25](https://github.com/SlashNephy/surasura-roppou/issues/25) | 検索バーを実装する         | Open   | 法令検索、本文検索、クイックジャンプの入口。 |
| [#31](https://github.com/SlashNephy/surasura-roppou/issues/31) | 条文参照パーサーを実装する | Open   | 手入力、OCR、クリップボードからの参照抽出。  |
| [#32](https://github.com/SlashNephy/surasura-roppou/issues/32) | 検索機能を実装する         | Open   | 保存済み法令と e-Gov 由来メタデータの検索。  |

## 7. M4: 学習・復習

Parent: [#5](https://github.com/SlashNephy/surasura-roppou/issues/5)

| Issue                                                          | Title                          | Status | Notes                                |
| -------------------------------------------------------------- | ------------------------------ | ------ | ------------------------------------ |
| [#28](https://github.com/SlashNephy/surasura-roppou/issues/28) | 条文からクイズカードを生成する | Open   | 穴埋め、正誤、条文番号当ての生成。   |
| [#29](https://github.com/SlashNephy/surasura-roppou/issues/29) | 復習画面を実装する             | Open   | 今日の復習、苦手条文、回答履歴。     |
| [#30](https://github.com/SlashNephy/surasura-roppou/issues/30) | 学習ダッシュボードを作る       | Open   | 学習状況の入口。                     |
| [#33](https://github.com/SlashNephy/surasura-roppou/issues/33) | 学習カード基盤を実装する       | Open   | card、session、result の保存と更新。 |
| [#34](https://github.com/SlashNephy/surasura-roppou/issues/34) | 科目別パックを実装する         | Open   | 行政書士などの学習プリセット。       |

## 8. M5: OCR 取り込み

Parent: [#6](https://github.com/SlashNephy/surasura-roppou/issues/6)

| Issue                                                          | Title                              | Status | Notes                                          |
| -------------------------------------------------------------- | ---------------------------------- | ------ | ---------------------------------------------- |
| [#35](https://github.com/SlashNephy/surasura-roppou/issues/35) | スキャナー画面と画像入力を実装する | Open   | カメラ、画像アップロード、クリップボード入力。 |
| [#36](https://github.com/SlashNephy/surasura-roppou/issues/36) | OCR処理を実装する                  | Open   | クライアントサイド OCR を優先する。            |
| [#37](https://github.com/SlashNephy/surasura-roppou/issues/37) | OCR結果から条文参照候補を抽出する  | Open   | OCR 誤認識を前提に候補確認 UI へつなぐ。       |

## 9. M6: 連携・品質・運用

Parent: [#7](https://github.com/SlashNephy/surasura-roppou/issues/7)

| Issue                                                          | Title                                              | Status | Notes                                           |
| -------------------------------------------------------------- | -------------------------------------------------- | ------ | ----------------------------------------------- |
| [#38](https://github.com/SlashNephy/surasura-roppou/issues/38) | ときどき六法連携のURL契約を定義する                | Open   | Web と Android の stable URL / deep link 契約。 |
| [#39](https://github.com/SlashNephy/surasura-roppou/issues/39) | ローカルデータのインポート・エクスポートを実装する | Open   | Web/Android 連携の安全な最初の一歩。            |
| [#40](https://github.com/SlashNephy/surasura-roppou/issues/40) | アクセシビリティ・性能・プライバシー基準を整える   | Open   | 操作性、速度、OCR 画像の扱い、保存方針。        |

## 10. 運用 Issue

| Issue                                                          | Title                  | Status | Notes                         |
| -------------------------------------------------------------- | ---------------------- | ------ | ----------------------------- |
| [#41](https://github.com/SlashNephy/surasura-roppou/issues/41) | Issue Dependency Gantt | Open   | Issue 依存関係の可視化。      |
| [#46](https://github.com/SlashNephy/surasura-roppou/issues/46) | Dependency Dashboard   | Open   | Renovate の依存関係更新状況。 |

## 11. 次の進め方

1. M0 の残件である [#10](https://github.com/SlashNephy/surasura-roppou/issues/10) と [#11](https://github.com/SlashNephy/surasura-roppou/issues/11) を閉じる。
2. M1 の [#13](https://github.com/SlashNephy/surasura-roppou/issues/13) で e-Gov 取得結果を viewer 用ツリーへ正規化する。
3. [#14](https://github.com/SlashNephy/surasura-roppou/issues/14) と [#15](https://github.com/SlashNephy/surasura-roppou/issues/15) で本文ビューアの初期体験を作る。
4. 保存、検索、学習、OCR は viewer MVP の契約を崩さない範囲で段階的に足す。
