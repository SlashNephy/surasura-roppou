# 品質基準

## 1. この文書の位置付け

この文書は、すらすら六法のアクセシビリティ、表示設定、性能、OCR の遅延読み込み、プライバシー、セキュリティ、ローカルデータ削除に適用する規範である。

[承認済みの設計](./superpowers/specs/2026-07-16-quality-baselines-design.md)を具体的な判定条件へ落とし込み、機能の設計、実装、レビュー、監査で共通して使用する。

判定の強さは次の語で区別する。

- **必須**：満たさない変更はマージしない。
- **禁止**：実装に含めない。
- **推奨**：満たせない場合は、理由と代替策をレビューで示す。
- **監査値**：記録した環境と条件で得た測定値であり、全利用者の環境における性能や適合を保証しない。

この文書では先に規範を確定し、現行実装の測定値と証跡は、基準制定の直後に行う監査作業で第 8 節へ記録する。

第 8 節に証跡が記録されるまでは、現行実装が基準へ適合しているとは扱わない。

## 2. アクセシビリティ

### 2.1 適合目標

Web UI は、W3C の [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) の Level AA を適合目標とする。

実装と監査では、少なくとも [Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)、[Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)、[Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)、[Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)、[Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) の公式解説を参照することが必須である。

自動監査だけで WCAG 2.2 AA への適合を宣言することは禁止する。

主要フローを実際のキーボードで操作し、デスクトップ幅とモバイル幅の実画面を確認することが必須である。

### 2.2 キーボード操作

マウスまたはタッチで実行できるすべての操作には、キーボードから同等の結果へ到達できる操作を用意することが必須である。

Tab と Shift+Tab の移動順は、視覚上の順序と作業の流れに沿うことが必須である。

正の `tabIndex` でフォーカス順を上書きすることは禁止する。

ボタンは Enter と Space で作動し、リンクは Enter で作動することが必須である。

ダイアログ、メニュー、ポップオーバー、シートなどの一時的な UI は Escape で閉じられることが必須である。

矢印キーを使う複合ウィジェットは、対応する [WAI-ARIA Authoring Practices Guide のパターン](https://www.w3.org/WAI/ARIA/apg/patterns/)に従うことが必須である。

フォーカストラップはモーダル UI の表示中だけに限定し、ページ本体へ戻れない状態を作ることは禁止する。

### 2.3 フォーカス、構造、状態通知

キーボードフォーカスは常に視認でき、固定ヘッダー、モバイルナビゲーション、ダイアログ、通知に完全に隠れないことが必須である。

モーダル UI を閉じた後は、原則として起動元へフォーカスを戻すことが必須である。

起動元が削除されている場合は、操作の流れに沿う安全な要素へフォーカスを移すことが必須である。

各画面は `main` などの意味を持つランドマークを備え、見出し階層を飛躍させず、画面の主題を一意に示す見出しを持つことが必須である。

アイコンだけの操作を含むすべてのコントロールに、操作対象と結果が分かるアクセシブルネームを付けることが必須である。

選択状態、展開状態、読み込み状態、成功、失敗は、適切な名前、role、状態属性、status message を使って支援技術へ通知することが必須である。

色だけで選択、警告、失敗、保存状態を区別することは禁止する。

### 2.4 拡大、リフロー、タッチ

200% のページ拡大で、情報または操作を失わないことが必須である。

320 CSS px 相当の幅で、情報または操作を失わず、ページ全体に二方向スクロールを発生させないことが必須である。

法令の表など、意味の理解に二次元配置が必要な領域には公式の例外を適用できるが、横スクロールはその領域内に限定することが必須である。

単独のボタン、ナビゲーション、カード操作のタッチターゲットは、WCAG 2.2 Level AAA の [Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) を製品上の推奨値とし、44 x 44 CSS px 以上にすることを推奨する。

WCAG 2.2 Level AA の [Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) が定める公式の例外を適用しないタッチターゲットは、24 x 24 CSS px を下回ることを禁止する。

本文中のインラインリンクに Target Size (Minimum) の例外を適用する場合も、隣接ターゲットとの識別、公式基準を満たす間隔、キーボードフォーカスを維持することが必須である。

hover でだけ現れる操作を唯一の導線にすることは禁止する。

## 3. 文字サイズ、行間、テーマ

文字サイズは少なくとも「標準」「大きめ」「特大」、行間は少なくとも「標準」「広め」、テーマは「ライト」「ダーク」「OS 設定」から選べることが必須である。

利用者が選んだ値は端末内へ保存し、次回起動時に復元することが必須である。

初回起動時のテーマは OS 設定に従い、文字サイズと行間は標準値を使用することが必須である。

設定は法令本文、目次、検索結果、ダイアログを含むすべての表示面へ一貫して適用することが必須である。

表示設定によって法令原文、保存データ、コピー内容を変更することは禁止する。

文字の変換と装飾は表示レイヤーだけで行い、保持した原文を変更しないことが必須である。

現行の設定 UI は設定値を表示するだけで変更操作を提供していないため、操作と永続化は合意済みの後続 Issue で実装することが必須である。

## 4. 性能

### 4.1 製品目標

[Core Web Vitals](https://web.dev/articles/vitals) の良好な体験を製品目標とし、LCP は 2.5 秒以下、INP は 200 ms 以下、CLS は 0.1 以下を必須の目標値とする。

実利用データを評価する場合は、mobile と desktop を分け、それぞれの 75 パーセンタイルで判定することが必須である。

ローカルのラボ測定値だけで、実利用環境の Core Web Vitals を満たすと宣言することは禁止する。

実利用データを収集する場合は、収集実装の前に第 6.2 節のプライバシー条件について承認を得ることが必須である。

### 4.2 大規模法令の監査基準

ローカル監査の代表データには、e-Gov API から取得した民法（lawId `129AC0000000089`）の実レスポンスを使うことが必須である。

小規模な手書き fixture を代用して大規模法令の性能を判定することは禁止する。

測定には production build と warm 状態の headed Chromium を使うことが必須である。

すべての性能測定は、同一 page time origin の Performance timeline と `performance.now()` を共通の時計として使い、開始 mark と終了 mark を同じ時刻源へ記録することが必須である。

初回法令表示の各試行では、warm browser session のまま同じ開始 route へ一度移動し、scroll top に戻してから民法へ遷移することが必須である。

初回法令表示の開始時刻には、その試行で取得した e-Gov API resource の `PerformanceResourceTiming.responseEnd` を使うことが必須である。

初回法令表示の終了時刻は、最初の子孫条文 `article[aria-label="民法"] article` が存在して `textContent.trim()` が空でなくなり、その検出後に連続する二つの `requestAnimationFrame` callback が完了した時点とすることが必須である。

初回法令表示は同じ開始 route と scroll 状態から 3 回測定し、中央値が 1,000 ms を超えた場合は未達と判定する。

表示モード切替の各試行では、「読みやすい表示」を選択して scroll top に戻し、「原文表示」を作動させる直前に開始 mark を記録することが必須である。

表示モード切替の終了時刻は、「原文表示」の `aria-pressed` が `true` になり、その後に連続する二つの `requestAnimationFrame` callback が完了した時点とすることが必須である。

「読みやすい表示」から「原文表示」への切替を 3 回測定し、中央値が 200 ms を超えた場合は未達と判定する。

逆方向の切替も測定する場合は別の監査値として明示し、必須の「読みやすい表示」から「原文表示」への測定に代えることを禁止する。

目次操作の各試行では scroll top に戻し、民法で URL addressable な最後の条文ボタンを固定対象にして、そのアクセシブルネームを記録することが必須である。

目次操作の開始時刻は固定対象を作動させる直前とし、終了時刻は対象条文の `aria-current` が `location` になり、その後に連続する二つの `requestAnimationFrame` callback が完了した時点とすることが必須である。

同じ固定対象の目次操作を 3 回測定し、中央値が 200 ms を超えた場合は未達と判定する。

Long Task の `PerformanceObserver` は、初回法令表示の `responseEnd` から終了 mark までと、各操作の開始 mark から終了 mark までの全区間を監視することが必須である。

各区間で 50 ms を超えたすべての entry を記録し、同じ区間の Chromium performance trace で正規化または描画に由来する処理と無関係な処理を区別することが必須である。

法令データの変換または描画に 50 ms を超える Long Task が一つでも発生した場合は未達と判定する。

Long Task の帰属を確定できない場合は「未監査」と判定し、「適合」と判定することを禁止する。

監査中にクラッシュ、操作不能、描画停止、未処理例外、console error が一つでも発生した場合は未達と判定する。

これらのローカル基準は回帰を検出する guardrail であり、実利用環境の Core Web Vitals と同一の指標として扱うことは禁止する。

### 4.3 測定条件

監査では、測定日、対象 commit、OS、CPU、メモリ、Node、pnpm、ブラウザとそのバージョン、viewport、production build のコマンドを記録することが必須である。

ネットワーク条件、ブラウザキャッシュ、Cache Storage、Service Worker の登録と制御状態を各試行と対応付けて記録することが必須である。

共通の時刻源、各開始 mark と終了 mark、二つの `requestAnimationFrame` callback、各試行前の開始 route、表示モード、scroll 状態、目次の固定対象を記録することが必須である。

民法の取得 URL、HTTP status、API revision、payload size、正規化後のノード数を実レスポンスの証跡とともに記録することが必須である。

ネットワーク時間とレスポンス受信後の変換および描画時間を分けて記録することが必須である。

3 回の値をすべて残し、中央値だけを記録することは禁止する。

端末差を隠す補正は行わず、同じ条件で比較できる情報を残すことが必須である。

## 5. OCR の遅延読み込み

ホーム、法令ビューア、検索、学習、設定の各主要 route は、OCR worker、WASM、OCR モデル、OCR 実行時だけに必要な chunk を取得しないことが必須である。

`/scanner` を開いただけの時点と、画像を選択しただけの時点で、OCR worker、WASM、OCR モデルを取得することは禁止する。

利用者がモデル取得へ同意し、OCR の実行を開始した時点に限り、OCR runtime とモデルを取得できる。

同意前の Service Worker precache に、OCR engine の動的 chunk、worker、WASM、OCR モデルを含めることは禁止する。

初回読み込みの監査は、対象 origin 専用の新しい headed Chrome profile と context から開始することが必須である。

監査開始前に、その origin の Cache Storage、IndexedDB、`localStorage`、`sessionStorage` を消去し、既存の Service Worker を unregister して、HTTP cache を無効化または bypass することが必須である。

消去後にアプリを reload し、新しい Service Worker が install、activate、control を完了するまで待つことが必須である。

監査段階の操作を始める前に、precache manifest と Cache Storage の初期状態を記録することが必須である。

初期状態の記録後に、表示済みのホーム、法令ビューア、検索、学習、設定、`/scanner`、画像選択、同意表示、OCR 実行開始の順で監査することが必須である。

各段階で module の dynamic import、Service Worker の precache manifest、Network の URL と initiator、Cache Storage、IndexedDB、Web Storage、Service Worker の登録と制御状態を記録することが必須である。

Network に新規 request がないことだけを lazy load の根拠にすることは禁止し、precache manifest と cache に OCR 資産が存在しないことも確認することが必須である。

## 6. プライバシーとセキュリティ

### 6.1 データ境界

データごとの保存、送信、削除の境界は次のとおりとする。

| データ                   | 端末保存                          | 外部送信                                               | analytics | 削除対象                 | 備考                                      |
| ------------------------ | --------------------------------- | ------------------------------------------------------ | --------- | ------------------------ | ----------------------------------------- |
| 閲覧履歴                 | 許可                              | 禁止                                                   | 禁止      | 必須                     | 利用者の端末内だけで扱う                  |
| ブックマークと保存リスト | 許可                              | 明示的な export または合意済み同期だけ許可             | 禁止      | 必須                     | 同期は別途同意を必要とする                |
| メモ                     | 許可                              | 明示的な export または合意済み同期だけ許可             | 禁止      | 必須                     | URL、ログ、例外情報にも含めない           |
| 学習履歴                 | 許可                              | 明示的な export または合意済み同期だけ許可             | 禁止      | 必須                     | 回答ログと学習セッションを含む            |
| OCR 画像                 | 永続化を禁止                      | 別途承認された server OCR と明示同意がある場合だけ許可 | 禁止      | 破棄時のメモリ解放が必須 | export を禁止し、端末内で一時的に処理する |
| OCR テキスト             | IndexedDB の OCR セッションに許可 | 禁止                                                   | 禁止      | 必須                     | 現行 export では復元できない              |
| 表示設定                 | 許可                              | 禁止                                                   | 禁止      | 必須                     | 名前空間付きの端末設定として扱う          |
| 法令キャッシュ           | 許可                              | 禁止                                                   | 禁止      | 必須                     | 現行のローカル保存領域である              |
| 検索インデックス         | 許可                              | 禁止                                                   | 禁止      | 必須                     | 現行のローカル保存領域である              |

OCR 画像の永続化、export、analytics への送信を禁止する。

OCR 画像の外部送信は、server OCR の設計が別途承認され、利用者が送信先、保存期間、削除条件の説明を確認して明示的に同意した場合だけ許可する。

一般の export または同期への同意を OCR 画像の送信同意として扱うことを禁止する。

現行アプリには承認済みの server OCR がないため、現行監査では OCR 画像の外部 request が一件もないことを必須の期待値とする。

OCR のキャンセル時は worker を解放することが必須である。

画像の差し替え、明示的な破棄、画面のアンマウント時は object URL を解放することが必須である。

キャンセル操作だけを根拠として object URL を解放したと記録することは禁止する。

OCR テキストは IndexedDB のセッションデータとして保存できるが、analytics へ含めることは禁止する。

閲覧履歴、学習履歴、メモ、OCR テキストを URL、console、例外メッセージ、エラー報告 payload に含めることを禁止する。

### 6.2 analytics の導入条件

analytics を導入する変更は、目的とデータ境界を合意する独立した Issue の承認を得ることが必須である。

その Issue では、opt-in の方法、データ分類、収集目的、保存期間、削除方法、送信先、同意撤回の方法を確定することが必須である。

承認前に analytics SDK、収集 endpoint、イベント送信を追加することは禁止する。

承認後も閲覧履歴、学習履歴、検索語、メモ、OCR テキスト、OCR 画像を analytics へ送ることは禁止する。

自由形式の payload は禁止し、送信可能な event 名と field を allowlist で定義することが必須である。

### 6.3 外部データの表示

e-Gov API のレスポンス、import したデータ、OCR テキストは信頼済み HTML として扱わないことが必須である。

外部データは React の text node または検証済みの構造として描画することが必須である。

外部データを `dangerouslySetInnerHTML` へ渡すなど、HTML injection が可能になる描画を禁止する。

外部リンクには HTTPS を使用し、新しいタブで開く場合は opener への参照を残さないことが必須である。

## 7. ローカルデータの削除

利用者がローカルデータを全削除できる機能は、合意済みの後続 Issue で実装することが必須である。

全削除では、アプリ本体の IndexedDB、アプリが所有する Cache Storage、Service Worker の登録、アプリ名前空間の `localStorage` と `sessionStorage`、表示設定、OCR セッションを削除対象にすることが必須である。

法令キャッシュと検索インデックスは現行のローカル保存領域であり、全削除の対象に含めることが必須である。

OCR モデルを別の IndexedDB または Cache Storage に保存している場合も、アプリが所有する保存領域を削除対象に含めることが必須である。

アプリが所有していると確認できない database、cache、storage key を削除することは禁止する。

origin 全体へ影響する `localStorage.clear()` の使用を禁止する。

削除確認画面では、export で復元できるデータと不可逆に失われるデータを分けて、実行前に説明することが必須である。

現行 export は OCR セッションと表示設定を復元できないため、export が全削除からの完全な復元手段であるかのように表示することは禁止する。

削除前にデータベース接続と実行中の worker を閉じ、削除後に再読み込みして各保存領域から対象データが消えたことを公開動作として検証することが必須である。

## 8. 現行実装の監査結果

本節は、現行実装の監査値、判定、証跡を一か所へ記録するための書式である。

規範を測定より先に確定したため、現時点の監査項目は未検証であり、適合または未達の判定を先取りしない。

各値と証跡は、Issue #40 の実装計画で直後に続く Task 2（現行実装の監査）で記録する。

### 8.1 監査環境

| 項目                    | 現在の記録                                                                   |
| ----------------------- | ---------------------------------------------------------------------------- |
| 監査実施日と時刻        | 未記録。Task 2（現行実装の監査）で記録する                                   |
| 監査対象 commit         | 未記録。監査時に完全な commit SHA を記録する                                 |
| OS、CPU、メモリ         | 未記録。監査端末の実値を記録する                                             |
| Node と pnpm            | 未記録。実行した version コマンドの出力を記録する                            |
| ブラウザ                | 未記録。製品名と完全なバージョンを記録する                                   |
| viewport                | 未記録。desktop と mobile の CSS px を記録する                               |
| build                   | 未記録。production build のコマンドと出力を記録する                          |
| network                 | 未記録。接続先と throttling の有無を記録する                                 |
| cache と Service Worker | 未記録。各試行の warm または cold、Cache Storage、登録と制御状態を記録する   |
| e-Gov API               | 未記録。取得 URL、HTTP status、revision、payload size、node count を記録する |

### 8.2 アクセシビリティ

| 監査項目                              | 判定   | 記録する証跡                                                       |
| ------------------------------------- | ------ | ------------------------------------------------------------------ |
| 主要 route の Tab と Shift+Tab 順     | 未検証 | 操作順と headed browser のスクリーンショット                       |
| Enter、Space、Escape、矢印キー        | 未検証 | 対象コントロールと実操作の結果                                     |
| フォーカス表示とモーダル終了後の復帰  | 未検証 | 起動元、モーダル内、終了後のフォーカス位置                         |
| ランドマーク、見出し、名前、状態通知  | 未検証 | accessibility tree と画面上の結果                                  |
| 200% 拡大と 320 CSS px 相当のリフロー | 未検証 | desktop と mobile のスクリーンショットと横スクロールの有無         |
| 44 x 44 CSS px の推奨                 | 未検証 | 単独のボタン、ナビゲーション、カード操作の実測値、未達理由、代替策 |
| 24 x 24 CSS px の最低基準             | 未検証 | 全対象の実測値、Target Size (Minimum) の公式例外と間隔             |

### 8.3 性能

| 監査項目                   | 判定   | 記録する値と証跡                                              |
| -------------------------- | ------ | ------------------------------------------------------------- |
| 民法の実レスポンス         | 未検証 | URL、status、revision、payload size、node count、実レスポンス |
| 受信完了から最初の条文表示 | 未検証 | responseEnd、DOM と二つの rAF、3 回の値、中央値、trace        |
| 表示モード切替             | 未検証 | readable から original、二つの rAF、3 回の値、中央値、判定    |
| 目次操作                   | 未検証 | 固定対象名、aria-current、二つの rAF、3 回の値、中央値、判定  |
| 変換と描画の Long Task     | 未検証 | 全 entry、観測区間、最大時間、trace による処理の帰属          |
| LCP、INP、CLS のラボ値     | 未検証 | 各値、測定条件、field data ではない旨                         |
| 安定性                     | 未検証 | crash、操作不能、描画停止、未処理例外、console error の有無   |

### 8.4 OCR とプライバシー

| 監査項目                          | 判定   | 記録する証跡                                                                      |
| --------------------------------- | ------ | --------------------------------------------------------------------------------- |
| OCR 監査の初期状態                | 未検証 | fresh profile、消去した storage、HTTP cache、Service Worker の再制御状態          |
| 主要 route の OCR 資産取得        | 未検証 | URL、initiator、dynamic import、precache manifest、cache と Service Worker の状態 |
| `/scanner` 表示と画像選択         | 未検証 | 同意前に取得された OCR chunk、worker、WASM、model の一覧                          |
| 同意後の OCR 実行                 | 未検証 | 同意操作、取得資産、request URL と body                                           |
| OCR 画像の保存と送信              | 未検証 | 各 storage と、現行アプリで画像の外部 request がない Network 証跡                 |
| OCR テキストと analytics          | 未検証 | OCR セッションの保存状態と送信イベントの実状態                                    |
| worker と object URL の lifecycle | 未検証 | キャンセル、差し替え、破棄、アンマウントごとの観測結果                            |
| 外部データの安全な描画            | 未検証 | DOM 上の text node と injection が起きない実入力結果                              |
| 全削除の対象領域                  | 未検証 | IndexedDB、Cache Storage、Service Worker、Web Storage の棚卸し                    |

### 8.5 未達事項と後続 Issue

監査に起因する未達事項と Issue URL は、監査未実施のため現在は記録されていない。

実在しない Issue URL を記載することは禁止する。

監査前に確定している後続作業は次のとおりである。

| 対象                     | 現在の状態                                            | 後続 Issue の記録                                |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------ |
| 文字サイズ、行間、テーマ | 現行 UI は表示のみであり、第 3 節の操作と永続化が必要 | Issue 作成後に実在する URL を記録する            |
| ローカルデータの全削除   | 第 7 節の利用者向け操作が必要                         | Issue 作成後に実在する URL を記録する            |
| 監査で検出した追加の未達 | 監査値がないため判定していない                        | 再現手順と証跡を持つ Issue の実在 URL を記録する |

## 9. 実装者チェックリスト

**実装前**

- [ ] 変更対象へ適用する本書の「必須」「禁止」「推奨」を列挙した。
- [ ] マウスまたはタッチ操作ごとに、対応するキーボード操作とフォーカス遷移を決めた。
- [ ] 追加または変更するデータを第 6.1 節の分類へ対応付け、保存先、外部送信、analytics、削除対象を決めた。
- [ ] ローカルスキーマへの影響を確認し、export、import、全削除への影響を設計した。
- [ ] analytics が必要な場合は、第 6.2 節の独立した Issue が承認済みであることを確認した。
- [ ] 外部 API を扱う場合は、監査に使う実レスポンスと失敗時の確認方法を決めた。

**実装中**

- [ ] Tab と Shift+Tab の順序、Enter、Space、Escape、必要な矢印キー操作を公開動作として実装した。
- [ ] フォーカス表示、モーダル終了後の復帰、ランドマーク、見出し、アクセシブルネーム、状態通知を維持した。
- [ ] 200% 拡大、320 CSS px 相当のリフローで情報と操作が失われない構造にした。
- [ ] 単独のボタン、ナビゲーション、カード操作は 44 x 44 CSS px 以上を推奨値として設計した。
- [ ] 公式の例外を適用しないタッチターゲットが 24 x 24 CSS px を下回らないようにした。
- [ ] 文字サイズ、行間、テーマは表示レイヤーだけへ適用し、法令原文を変更していない。
- [ ] ホーム、法令ビューア、検索、学習、設定から OCR 実行時専用資産へ静的な依存を追加していない。
- [ ] OCR の同意前取得を防ぎ、worker と object URL を第 6.1 節の lifecycle に従って解放した。
- [ ] OCR 画像を永続化、export、analytics の対象にせず、外部送信を第 6.1 節の条件に限定し、OCR テキストを analytics へ含めていない。
- [ ] 外部データを text node または検証済み構造として描画し、HTML injection を許していない。

**PR 前**

- [ ] **Web UI 変更**：`playwright-cli open --headed` で確立したセッションを再利用し、desktop と mobile で変更した操作を実行してスクリーンショットを保存した。
- [ ] **Web UI 変更**：Tab、Shift+Tab、Enter、Space、Escape、必要な矢印キーを操作し、フォーカス表示と復帰を確認した。
- [ ] **Web UI 変更**：200% 拡大、320 CSS px 相当、mobile viewport でリフロー、はみ出し、タッチ操作を確認した。
- [ ] **Web UI 変更**：単独のボタン、ナビゲーション、カード操作について 44 x 44 CSS px の推奨値を別に確認した。
- [ ] **Web UI 変更**：全タッチターゲットについて 24 x 24 CSS px の最低基準または Target Size (Minimum) の公式例外を確認した。
- [ ] **法令ビューアまたは性能関連の変更**：民法（lawId `129AC0000000089`）の実レスポンスを取得し、第 4.2 節の手順で初回法令表示を 3 回測定した。
- [ ] **法令ビューアまたは性能関連の変更**：表示モード切替と目次操作を第 4.2 節の手順で別々に 3 回ずつ測定し、それぞれの中央値と判定を記録した。
- [ ] **法令ビューアまたは性能関連の変更**：全測定区間の Long Task を記録し、Chromium performance trace で正規化または描画への帰属を確認した。
- [ ] **OCR/PWA 変更**：fresh headed Chrome profile で origin の storage と Service Worker を初期化し、HTTP cache を bypass して各段階の Network、precache manifest、Cache Storage を記録した。
- [ ] **OCR/PWA 変更**：現行アプリでは OCR 画像の外部 request と永続化がなく、OCR 画像と OCR テキストの analytics 送信もないことを Network と各保存領域で確認した。
- [ ] **保存スキーマ変更**：ローカルスキーマの変更が export、import、全削除へ与える影響を、公開動作で確認した。
- [ ] **すべての変更**：`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm test` をコミット直前に順番どおり実行し、すべて終了コード 0 であることを記録した。
- [ ] **すべての変更**：PR 前に `pnpm run review:antigravity` を実行し、skip または指摘がある場合も出力を記録した。
- [ ] **すべての変更**：適合の根拠として、実行したコマンドと出力、実レスポンス、スクリーンショットのうち該当する証跡を添付した。

## 10. 監査の更新手順

1. 監査日と時刻、対象 commit の完全な SHA を第 8.1 節へ記録する。
2. OS、CPU、メモリ、Node、pnpm、ブラウザとそのバージョン、desktop と mobile の viewport を記録する。
3. production build のコマンド、ネットワーク条件、ブラウザキャッシュ、Cache Storage、Service Worker の登録と制御状態、共通の時刻源、各試行の開始 mark と終了 mark、開始 route、表示モード、scroll 状態を記録する。
4. e-Gov API の取得 URL、HTTP status、revision、payload size、正規化後の node count と実レスポンスの証跡を記録する。
5. 初回法令表示は `responseEnd`、`article[aria-label="民法"] article` の空でない text、二つの `requestAnimationFrame` callback を記録し、同じ開始状態から 3 回測定する。
6. 表示モード切替は「読みやすい表示」から「原文表示」、目次操作はアクセシブルネームを記録した同一の固定対象を使い、各開始操作、状態属性、二つの `requestAnimationFrame` callback、3 回の値、中央値、判定を別々に記録する。
7. 初回表示と各操作の全測定区間で 50 ms を超える Long Task を記録し、同じ区間の Chromium performance trace で正規化または描画への帰属を記録して、LCP、INP、CLS、console error も測定条件と対応付ける。
8. OCR 監査は fresh headed Chrome profile で origin の Cache Storage、IndexedDB、`localStorage`、`sessionStorage` を消去し、Service Worker を unregister して HTTP cache を bypass した状態から始める。
9. reload 後の新しい Service Worker の install、activate、control を待ち、段階操作前と各段階の Network URL と initiator、dynamic import、precache manifest、Cache Storage、IndexedDB、Web Storage、OCR 画像の外部 request の有無を記録する。
10. アクセシビリティと OCR の各操作について、実行順、観測結果、Network、Application、accessibility tree、スクリーンショットを記録し、44 x 44 CSS px の推奨値と 24 x 24 CSS px の最低基準または公式例外を分けて判定する。
11. 各項目を「適合」「未達」「未検証」「未監査」「対象外」のいずれかで判定し、「未監査」と「対象外」には理由を添える。
12. 「未達」には再現手順、利用者への影響、測定値を付け、作成済みの後続 Issue の実在 URL を記録する。
13. 証跡には実行したコマンドと出力、実レスポンス、スクリーンショットだけを使用し、確認したという記述だけで適合にしない。
14. 条件が前回と異なる場合は差分を記録し、比較できない値を改善または悪化の根拠にしない。
