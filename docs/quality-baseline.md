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

文字サイズは少なくとも「標準」「やや大きい」「大きい」、行間は少なくとも「標準」「ゆったり」「広い」、テーマは「システム」「ライト」「ダーク」から選べることが必須である。

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

測定には同一の production build と headed Chromium を使い、cold cache と warm cache の初回法令表示をそれぞれ 3 回測定することが必須である。

すべての性能測定は、同一 page time origin の Performance timeline と `performance.now()` を共通の時計として使い、開始 mark と終了 mark を同じ時刻源へ記録することが必須である。

cold cache の各試行は、一意な名前を持つ新しい headed Chrome session と context で行うことが必須である。

cold cache の各試行では、アプリを開く前に HTTP cache を消去して無効化または bypass し、対象 origin の Cache Storage、IndexedDB、`localStorage`、`sessionStorage` を消去することが必須である。

消去後に `/` を開き、新しく登録された Service Worker の install、activate、control を待ち、民法の法令データが IndexedDB、Cache Storage、Resource Timing のいずれにも存在しないことを確認してから民法へ遷移することが必須である。

cold cache の各試行では民法への遷移で発生した実際の e-Gov API request を測定し、別の session または事前 request の値を代用することを禁止する。

warm cache の各試行では、同じ warm headed session で法令データと browser cache を warm に保ち、同じ開始 route `/` へ一度移動して scroll top に戻してから民法へ遷移することが必須である。

初回法令表示の開始時刻には、その試行で取得した e-Gov API resource の `PerformanceResourceTiming.responseEnd` を使うことが必須である。

初回法令表示の終了時刻は、最初の子孫条文 `article[aria-label="民法"] article` が存在して `textContent.trim()` が空でなくなり、その検出後に連続する二つの `requestAnimationFrame` callback が完了した時点とすることが必須である。

cold cache と warm cache の両方で、e-Gov API の fetch または resource timing、`responseEnd`、終了時刻、差分、final double-rAF 時点の DOM element 数、50 ms を超えるすべての Long Task と trace 上の帰属、HTTP cache、Cache Storage、Service Worker の状態を試行ごとに記録することが必須である。

cold cache の値はネットワークと初回状態を含む監査用の参照値とし、時間だけを 1,000 ms の guardrail で判定することを禁止する。

warm cache の初回法令表示は 3 回の responseEnd 後の差分を測定し、中央値が 1,000 ms を超えた場合は未達と判定する。

表示モード切替の各試行では、「読みやすい表示」を選択して scroll top に戻し、「原文表示」を作動させる直前に開始 mark を記録することが必須である。

表示モード切替の終了時刻は、「原文表示」の `aria-pressed` が `true` になり、その後に連続する二つの `requestAnimationFrame` callback が完了した時点とすることが必須である。

「読みやすい表示」から「原文表示」への切替を 3 回測定し、中央値が 200 ms を超えた場合は未達と判定する。

逆方向の切替も測定する場合は別の監査値として明示し、必須の「読みやすい表示」から「原文表示」への測定に代えることを禁止する。

目次操作の各試行では scroll top に戻し、民法で URL addressable な最後の条文ボタンを固定対象にして、そのアクセシブルネームを記録することが必須である。

目次操作の開始時刻は固定対象を作動させる直前とし、終了時刻は対象条文の `aria-current` が `location` になり、その後に連続する二つの `requestAnimationFrame` callback が完了した時点とすることが必須である。

同じ固定対象の目次操作を 3 回測定し、中央値が 200 ms を超えた場合は未達と判定する。

Long Task の `PerformanceObserver` は、cold cache と warm cache の各初回法令表示の `responseEnd` から終了 mark までと、各操作の開始 mark から終了 mark までの全区間を監視することが必須である。

各区間で 50 ms を超えたすべての entry を記録し、同じ区間の Chromium performance trace で正規化または描画に由来する処理と無関係な処理を区別することが必須である。

cold cache と warm cache のどちらでも、法令データの変換または描画に 50 ms を超える Long Task が一つでも発生した場合は未達と判定する。

Long Task の帰属を確定できない場合は「未検証」と判定し、「適合」と判定することを禁止する。

監査中にクラッシュ、操作不能、描画停止、未処理例外、console error が一つでも発生した場合は未達と判定する。

これらのローカル基準は回帰を検出する guardrail であり、実利用環境の Core Web Vitals と同一の指標として扱うことは禁止する。

### 4.3 測定条件

監査では、測定日、対象 commit、OS、CPU、メモリ、Node、pnpm、ブラウザとそのバージョン、viewport、production build のコマンドを記録することが必須である。

production build では、初期 JavaScript の minified / gzip サイズと PWA precache の entry 数および合計サイズを記録することが必須である。

Vite の既定値で 500 kB を超える chunk warning が残る場合は、その chunk の責務と minified / gzip サイズを証跡にした独立の改善 Issue を作ることが必須である。

Vite の chunk warning は bundle 分割の目標と後続 Issue の trigger であり、それだけを Core Web Vitals または大規模法令表示の未達根拠にすることを禁止する。

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

削除フローでは、破壊的な削除を確定する確認へ進む前に、復元可能データを export するための視認可能で利用できる導線または操作を提示することが必須である。

利用者が削除フローからその導線へ移動し、export を実行できることを公開動作として検証することが必須である。

現行 export は OCR セッションと表示設定を復元できないため、export が全削除からの完全な復元手段であるかのように表示することは禁止する。

削除前にデータベース接続と実行中の worker を閉じ、削除後に再読み込みして各保存領域から対象データが消えたことを公開動作として検証することが必須である。

## 8. 現行実装の監査結果

本節は、commit `ae3d5e5fc4781a94f6a1f417b6c8999df914cf9c` の production build を実レスポンスと headed Chrome で監査した結果である。

値は第 4.2 節の基準と同じ page time origin、`performance.now()`、二つの `requestAnimationFrame` を用いたローカル監査値であり、実利用環境全体の適合を表すものではない。

### 8.1 監査環境

| 項目                    | 実測 / 観測                                                                                                                                                                                                                                                                                                   | 証跡                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 監査実施日と時刻        | 2026-07-16T01:56:14+09:00                                                                                                                                                                                                                                                                                     | `date --iso-8601=seconds`                                                                 |
| 監査対象 commit         | `ae3d5e5fc4781a94f6a1f417b6c8999df914cf9c`                                                                                                                                                                                                                                                                    | `git rev-parse HEAD`                                                                      |
| OS、CPU、メモリ         | Linux 7.1.3-2-cachyos-bore-lto x86_64、12th Gen Intel Core i7-12700K、20 logical CPU / 12 core、メモリ 31 GiB（監査開始時 available 10 GiB）                                                                                                                                                                  | `uname -a`、`lscpu`、`free -h`                                                            |
| Node と pnpm            | Node v24.18.0、pnpm 11.12.0                                                                                                                                                                                                                                                                                   | `node --version`、`pnpm --version`                                                        |
| ブラウザ                | playwright-cli 0.1.15、Google Chrome 150.0.7871.114                                                                                                                                                                                                                                                           | `playwright-cli --version`、headed session の CDP `Browser.getVersion`                    |
| viewport                | desktop 1440 x 900、mobile 390 x 844、200% reflow 相当 720 x 450、minimum reflow 320 x 844 CSS px                                                                                                                                                                                                             | `playwright-cli -s=issue40 resize`、各 route の `innerWidth` と `getBoundingClientRect()` |
| build                   | `pnpm build`（`tsc -b && vite build`）成功、Vite 8.1.4、2198 modules、902 ms。main JS 686,762 bytes（gzip 204,424）、CSS 58,565 bytes（gzip 10,774）、OCR dynamic entry 17,237 bytes（gzip 7,198）。PWA precache は 9 entries、重複を除く 769,841 bytes（751.80 KiB）。main chunk に 500 kB 超過 warning あり | clean `dist` に対する build 出力、`stat`、`gzip -c`、module graph、`dist/sw.js`           |
| OCR 配信 artifact       | worker 111,307 bytes、選択される relaxed SIMD LSTM WASM loader 3,905,767 bytes、同 WASM 2,862,266 bytes、日本語 model 2,471,260 bytes。他の同梱 core は JS 3,896,484–4,697,227 bytes、WASM 2,855,361–3,456,075 bytes。precache の重複を除く合計は 769,841 bytes                                               | `find dist`、OCR dynamic entry の import graph、`dist/sw.js`                              |
| network                 | preview は `http://127.0.0.1:4173/`、e-Gov は HTTPS。UI と性能測定は throttling なし。OCR cold 境界と追加の cold cache 法令監査では CDP で HTTP cache を無効化                                                                                                                                                | preview の HTTP 200、`Network.emulateNetworkConditions`、`Network.setCacheDisabled`       |
| cache と Service Worker | 当初の性能監査は warm HTTP cache、activated かつ page controlled、Workbox Cache Storage あり。追加の cold cache 法令監査は試行ごとに新規 session で origin storage と HTTP cache を消去し、法令データ 0 件、新規 SW の activate / control 後に開始。OCR も初期化状態から開始                                  | `navigator.serviceWorker`、Cache Storage、IndexedDB、Web Storage の段階別 Playwright 出力 |
| e-Gov API               | URL `https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089?law_full_text_format=json&response_format=json`、3 回とも HTTP 200、revision `129AC0000000089_20260624_508AC0000000045`、1,618,344 bytes、民法、正規化後 4,283 nodes                                                                             | Node の独立した実リクエスト 3 回と headed Chrome request #17                              |

### 8.2 アクセシビリティ

| 領域                           | 条件 / 操作                                                                 | 実測 / 観測                                                                                                                                                                                                                                                                                                 | 判定           | 証跡                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| フォーカス順                   | 6 route、1440 x 900、Tab / Shift+Tab                                        | 5 route は header から main の順に移動した。法令 viewer は header の次に 1,173 個の目次ボタンが全て tab stop となり、skip link など本文への bypass はない。本文操作まで現実的な操作数で到達できない                                                                                                         | 未達           | `issue40-keyboard-rerun` の activeElement 列、目次 navigation 内 button 1,173、本文 action button 2,346 の実 DOM count |
| キーボード操作                 | 法令表示切替、目次第 1050 条、設定 select、data export、mobile 目次         | Enter / Space で表示状態と `aria-pressed` が切り替わり、目次は Enter で `/articles/1050` と `aria-current="location"` へ遷移した。select は ArrowDown、export は Enter で作動。mobile 目次は inline disclosure のため Escape 対象外                                                                         | 適合           | headed session の activeElement、URL、ARIA state、`desktop-law-viewer.png`、`/var/tmp/issue40-export.json`             |
| 検索 dialog の復帰             | 1440 x 900、検索起動ボタンを Enter / Space、ArrowDown、Escape               | Enter / Space で input に移動し、ArrowDown で `aria-activedescendant` が設定された。選択の有無にかかわらず Escape を 1 回押しても dialog は開いたままで、input にフォーカスが残った                                                                                                                         | 未達           | `issue40-keyboard-rerun` の dialog visibility、activeElement、ARIA state                                               |
| scanner のフォーカス           | 1440 x 900 と 390 x 844、画像選択、OCR 同意表示、Escape、「やめる」を Space | 実 file input 2 個が 1 x 1 CSS px のまま Tab 順に入り、視認可能なフォーカスにならない。同意表示直後、Escape 後、「やめる」後はいずれも `BODY` になり、Escape では inline consent panel も閉じなかった                                                                                                       | 未達           | input の rect / `:focus-visible`、各操作後の activeElement、`scanner-consent.png`                                      |
| ランドマーク、名前、ARIA state | 6 route の accessibility tree、desktop / mobile                             | 各 route に banner、global navigation、main、contentinfo と主題を示す H1 があり、操作に accessible name、表示切替と目次に ARIA state があった                                                                                                                                                               | 適合           | `playwright-cli -s=issue40 snapshot`                                                                                   |
| 閉じた検索 dialog の見出し     | 6 route の閉じた状態の accessibility tree、desktop / mobile                 | interactive descendant が閉じていても検索 H2 が accessibility tree に残り、各ページの H1 より前に現れた                                                                                                                                                                                                     | 未達           | `playwright-cli -s=issue40 snapshot` と `issue40-consent-correction-20260716` の scanner snapshot                      |
| 390 px と 200% 相当 reflow     | 6 route を 390 x 844 と 720 x 450 で表示                                    | 全 route で `scrollWidth <= clientWidth`、操作の切れなし。mobile bottom navigation は viewport 下端に残り、各項目は約 90 x 48 CSS px                                                                                                                                                                        | 適合           | 各 route の viewport、scrollWidth、control rect、`mobile-law-viewer.png`                                               |
| 320 CSS px reflow              | 6 route を 320 x 844 で表示                                                 | home / scanner は横スクロールなし。law / study / settings / data transfer は viewport の scrollbar 後の clientWidth 305 px に対して body 最小幅 320 pxとなり、最大 15 px の page-level 横スクロールが発生                                                                                                   | 未達           | 各 route の innerWidth / clientWidth / scrollWidth / 最大 scrollLeft                                                   |
| 44 x 44 CSS px 推奨            | 390 x 844 の全 button / link                                                | bottom navigation は約 90 x 48。単独操作には高さ 28–42 px があり、法令 viewer は 2,360 対象中 2,356 対象が 44 px 未満で、条文 copy / link の多くは 28 x 28。home 8、scanner 6、study 8、settings 5、data transfer 6 対象も推奨未満                                                                          | 未達（推奨値） | 全対象の `getBoundingClientRect()`                                                                                     |
| 24 x 24 CSS px 最低基準        | 390 x 844 の全 button / link と公式例外                                     | 24 px 未満は本文中の inline link、間隔例外を満たす study link、または 1 x 1 file input だった。file input は同じ file picker を起動する別の可視 button があり、その button が最低基準を満たすため Target Size (Minimum) の Equivalent 例外に該当する。公式の例外対象外で 24 x 24 未満の操作は観測しなかった | 適合           | rect と隣接 target の中心間隔。scanner の別の可視 button は 350 x 136 / 350 x 36 CSS px                                |

route 別の実キーボード出力は `playwright-cli -s=issue40-keyboard-rerun run-code --filename=/var/tmp/issue40-keyboard-audit.js` で取得した。Tab 列は page navigation 直後からの実順序であり、全対象で `:focus-visible=true` を確認したものは矢印で連結している。

| route                     | Tab / Shift+Tab の出力                                                                                            | Enter / Space の出力                                                                                | Escape / ArrowDown の出力                                                             | 操作後の URL、状態、フォーカス                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/`                       | logo → header 検索 → 法令 → 撮る → 復習 → 設定 → main 検索 → 撮って開く。Shift+Tab は撮って開く → main 検索       | 検索は Enter と Space のどちらでも dialog を開き input へ移動。撮って開くは Enter で作動            | input で ArrowDown 後 `aria-activedescendant=radix-_r_9_`。Escape 後も dialog visible | main link の Enter 後は `/scanner`、focus は `BODY`、`:focus-visible=false` |
| `/laws/129AC0000000089`   | logo → header 検索 → 法令 → 撮る → 復習 → 設定 → 目次第1条 → 第2条。Shift+Tab は第2条 → 第1条                     | 原文表示を Enter で `aria-pressed=true`、読みやすい表示を Space で `true`、目次第1条を Enter で作動 | 一時 UI と select / ARIA composite widget がないため Escape / ArrowDown は対象外      | `/articles/1`、`aria-current=location`、第一条。目次 button は 1,173        |
| `/scanner`                | logo → header 検索 → 法令 → 撮る → 復習 → 設定 → 1 x 1 file input → 1 x 1 file input。Shift+Tab は二つ目 → 一つ目 | 読み取りを Enter で同意表示し focus は `BODY`。やめるを Space で作動後も `BODY`                     | Escape 後も inline consent panel visible、focus は `BODY`。ArrowDown 対象なし         | URL は `/scanner` のまま、やめる後 consent hidden                           |
| `/study`                  | logo → header 検索 → 法令 → 撮る → 復習 → 設定 → カード一覧を開く → 憲法。Shift+Tab は憲法 → カード一覧           | カード一覧を開くは link のため Enter で作動、Space は対象外                                         | 一時 UI と composite widget がないため Escape / ArrowDown は対象外                    | `/study/cards`、遷移後 focus は `BODY`                                      |
| `/settings`               | logo → header 検索 → 法令 → 撮る → 復習 → 設定 → 年度 select → date input。Shift+Tab は date → select             | data transfer link は Enter で作動、Space は対象外                                                  | select の ArrowDown で値が `2027` → `2026`。一時 UI がないため Escape は対象外        | `/settings/data-transfer`、遷移後 focus は `BODY`                           |
| `/settings/data-transfer` | logo → header 検索 → 法令 → 撮る → 復習 → 設定 → 設定へ戻る → JSON export。Shift+Tab は export → 設定へ戻る       | export は Enter / Space の両方で `surasura-roppou-export-2026-07-15.json` を download               | 一時 UI と composite widget がないため Escape / ArrowDown は対象外                    | 各 download 後 focus は、button が残っているにもかかわらず `BODY`           |

### 8.3 性能

全 DOM element 数の追加監査は、同じ warm headed session と操作条件で `playwright-cli -s=issue40-keyboard-rerun run-code --filename=/var/tmp/issue40-dom-count-audit.js` を実行し、各試行の final double-rAF callback 内で取得した。

cold cache の追加監査は、監査結果を追記する commit とは別の監査対象 commit `b6d255de17d712c3df8a09eee10c07eecf994969` を production build し、`issue40-law-cold-1b-20260716`、`issue40-law-cold-2-20260716`、`issue40-law-cold-3-20260716` の一意な新規 headed Chrome session で実行した。

| 領域                                    | 条件 / 操作                                                                                                                                                                       | 実測 / 観測                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 判定   | 証跡                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 民法の実レスポンス                      | 同一 Node script を独立に 3 回実行                                                                                                                                                | 全回 200 / 1,618,344 bytes / revision `129AC0000000089_20260624_508AC0000000045` / 民法 / 4,283 nodes。fetch は 355.206、277.924、329.189 ms（中央値 329.189 ms）、normalize は 42.195、45.527、48.085 ms（中央値 45.527 ms）                                                                                                                                                                                                                                                                                         | 適合   | `node --input-type=module --experimental-strip-types` の実出力 3 件                                                                        |
| warm cache の受信完了から最初の条文表示 | warm headed Chrome。各回 `/`、scroll top から SPA 遷移。resource `responseEnd` から DOM 検出後の二つの rAF                                                                        | responseEnd / end / 差分は 473.0 / 990.1 / 517.1 ms、269.5 / 706.3 / 436.8 ms、284.5 / 759.6 / 475.1 ms。中央値 475.1 ms。追加 3 試行の final double-rAF 時点の全 DOM element 数は 40,253 / 40,253 / 40,253                                                                                                                                                                                                                                                                                                           | 適合   | PerformanceResourceTiming、最初の非空 `article[aria-label="民法"] article`、同一 timeline の mark、`document.querySelectorAll("*").length` |
| cold cache の受信完了から最初の条文表示 | 3 試行とも新規 session、origin usage 0、HTTP cache 無効、法令 DB 4 store / Cache Storage / Resource Timing の民法 0 件、新規 SW の install / activate / control 後に `/` から遷移 | 実 URL `https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089?law_full_text_format=json&response_format=json` は 3 回とも HTTP 200 かつ disk / SW / prefetch cache miss。CDP request は 235.755、220.707、217.911 ms（中央値 220.707 ms）。responseEnd / end / 差分は 937.2 / 1,990.3 / 1,053.1 ms、911.9 / 1,656.1 / 744.2 ms、947.9 / 1,530.7 / 582.8 ms（差分中央値 744.2 ms）。DOM は 40,264 / 40,264 / 40,264、console / page / request error は 0。時間は参照値だが、後述の attributable Long Task により未達 | 未達   | `playwright-cli -s=issue40-law-cold-{1b,2,3}-20260716`、`/var/tmp/issue40-cold-law-audit.js`、`/var/tmp/issue40-cold-law-results.json`     |
| 表示モード切替                          | 各回 readable、scroll top から original を作動、`aria-pressed=true` 後に二つの rAF                                                                                                | 179.4、176.4、177.1 ms、中央値 177.1 ms。追加 3 試行の final double-rAF 時点の全 DOM element 数は 40,253 / 40,253 / 40,253                                                                                                                                                                                                                                                                                                                                                                                            | 適合   | headed Chrome の Performance mark、ARIA state、`document.querySelectorAll("*").length`                                                     |
| 目次操作                                | 各回 scroll top、固定対象「第1050条」を作動、`aria-current=location` 後に二つの rAF                                                                                               | 103.4、94.6、93.0 ms、中央値 94.6 ms。到達先は `/laws/129AC0000000089/articles/1050`、「第千五十条」が current。追加 3 試行の final double-rAF 時点の全 DOM element 数は 40,260 / 40,260 / 40,260                                                                                                                                                                                                                                                                                                                     | 適合   | headed Chrome の Performance mark、URL、ARIA state、`document.querySelectorAll("*").length`                                                |
| 初回表示の Long Task                    | warm cache と cold cache の responseEnd から final double-rAF まで                                                                                                                | warm は 73 / 124 / 292 ms、117 / 258 ms、137 / 269 ms。cold は 53 / 125 / 328 ms、67 / 132 / 319 ms、51 / 126 / 328 ms。cold trace は 125 / 132 / 126 ms を main JS `FunctionCall`、328 / 319 / 328 ms を描画へ帰属し、Layout は 237.935 / 228.758 / 225.749 ms。53 / 67 / 51 ms の `RunMicrotasks` 単独の source 帰属は未検証だが、他の attributable entry だけで未達                                                                                                                                                | 未達   | warm の PerformanceObserver / trace、cold 3 session の全 entry と CDP trace、`/var/tmp/issue40-cold-law-results.json`                      |
| 表示切替の Long Task                    | 上記 3 区間                                                                                                                                                                       | 55 / 126 ms、156 ms、166 ms。trace で Layout 90.484–103.285 ms と main JS FunctionCall 51.957 ms 以上を観測                                                                                                                                                                                                                                                                                                                                                                                                           | 未達   | PerformanceObserver 全 entry と同区間の Chromium trace                                                                                     |
| 目次操作の Long Task                    | 上記 3 区間                                                                                                                                                                       | 86 ms、77 ms、78 ms。trace で RunMicrotasks 74.064–82.706 ms、main JS FunctionCall 71.926–80.676 ms に帰属                                                                                                                                                                                                                                                                                                                                                                                                            | 未達   | PerformanceObserver 全 entry と同区間の Chromium trace                                                                                     |
| LCP と CLS                              | 1440 x 900、headed Chrome、直接 navigation、throttling なし                                                                                                                       | final LCP 1,020 ms、CLS 0.08593。このローカル試行では良好の目標値を下回ったが、mobile / desktop 別の field data の 75 パーセンタイルがなく、第 4.1 節によりラボ値だけでは適合判定できない                                                                                                                                                                                                                                                                                                                             | 未検証 | Paint / LargestContentfulPaint / layout-shift entries                                                                                      |
| INP                                     | 同じローカル session                                                                                                                                                              | field data はなく、監査操作から有効な Event Timing entry を取得できなかった                                                                                                                                                                                                                                                                                                                                                                                                                                           | 未検証 | PerformanceEventTiming                                                                                                                     |
| 安定性                                  | 上記性能 9 試行と新規 OCR 通常フロー                                                                                                                                              | crash、操作不能、描画停止、未処理例外、通常操作の console error は 0 件。object URL 解放監査では、監査コードが失効後に明示 fetch した異なる URL 2 件だけが `ERR_FILE_NOT_FOUND` になった                                                                                                                                                                                                                                                                                                                              | 適合   | 新規 session の console は 0 errors。`console-2026-07-15T17-11-30-761Z.log` は後述する probe 2 件のみ                                      |

cold session 全体で観測した 50 ms 超の Long Task は、試行順に 69 / 53 / 125 / 328 ms、67 / 73 / 67 / 132 / 319 ms、76 / 51 / 126 / 328 ms だった。このうち `responseEnd` より前の 69 ms、67 / 73 ms、76 ms は初回法令表示の判定区間外として分けて記録した。

### 8.4 OCR とプライバシー

| 領域                          | 条件 / 操作                                                                                              | 実測 / 観測                                                                                                                                                                                                                                                                                                                                           | 判定   | 証跡                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OCR 監査の初期状態            | 新規 named headed session `issue40-ocr-rerun-20260716` を `about:blank` で作成してから対象 origin を開く | in-memory Chrome profile を新規作成。`Network.setCacheDisabled(true)`、`Network.clearBrowserCache`、`Storage.clearDataForOrigin(all)`、cookie clear を実行し、既存 storage / cache / SW がない状態から SW を再 install / activate した                                                                                                                | 適合   | `playwright-cli -s=issue40-ocr-rerun-20260716 run-code --filename=/var/tmp/issue40-ocr-audit.js`、段階別 storage snapshot。auto-attach setup error 0 件     |
| 主要 route と OCR entry       | SW install、`/`、law、search、study、settings を経て scanner へ移動                                      | OCR entry は `sw_install_home` で初めて HTTP 200 となり Workbox precache へ保存された。main からの dynamic import request は `execute_cancel` まで発生しなかった。worker、WASM loader / binary、model は同意 UI 表示まで未要求                                                                                                                        | 未達   | service worker target と page target の CDP Network、Workbox Cache Storage、段階別 matrix                                                                   |
| scanner 表示と画像選択        | `/scanner` 表示、`issue40-ocr.png` upload、同意 UI 表示まで                                              | entry は precache 済みで、新たな worker / WASM loader / binary / model request は 0。同意 UI に「約 2.4 MB」「以後オフライン」「端末内で処理」「画像を保存しない」を表示                                                                                                                                                                              | 適合   | 段階別 requests / cache、`scanner-privacy.png`、`scanner-consent.png`。後者は `民法709条` の preview、snapshot、同意表示を目視した 1440 x 900、71,389 bytes |
| 同意後の OCR 実行             | 「実行」、処理中 cancel、再実行して「もう一度読み取る」表示まで                                          | 初回実行で worker / WASM loader / model を各 HTTP 200 で取得し、cancel 後の再実行で worker / loader を再取得。standalone WASM binary request は全段階 0。完了表示を 482 ms 後に確認し、OCR session 1 件を保存。全 request は GET で body なし                                                                                                         | 適合   | named session の CDP Network、worker create / close、UI 完了 state、IndexedDB count                                                                         |
| OCR 画像の保存と送信          | 選択、実行、キャンセル、完了、破棄、scanner 離脱の各境界                                                 | 画像 blob / data URL / object URL は main IndexedDB、model IndexedDB、local / session storage、Cache Storage に残らず、画像の外部 origin request もなかった                                                                                                                                                                                           | 適合   | 全 storage の value 型 / key / URL、headed request 一覧                                                                                                     |
| OCR テキストと analytics      | OCR 完了後                                                                                               | `surasura-roppou` v3 の `ocrSessions` に sourceText を持つ 1 record を保存。analytics request は画像、OCR text、閲覧履歴、メモのいずれにも観測しなかった                                                                                                                                                                                              | 適合   | IndexedDB store count / record keys、全 headed requests                                                                                                     |
| model の永続化                | OCR 完了後                                                                                               | `keyval-store` v1 の `keyval` に key `./jpn.traineddata`、Uint8Array 2,471,260 bytes を 1 件保存。localStorage には同意 key `surasura:ocr-model-consent=granted` を保存                                                                                                                                                                               | 適合   | IndexedDB `getAllKeys()` / value byteLength、Web Storage                                                                                                    |
| worker / object URL lifecycle | OCR 中キャンセル、画像差し替え、破棄、scanner 離脱                                                       | cancel で worker `4eeb…` が close、再実行で別 worker を作成し、離脱後 page worker は 0。`blob:http://127.0.0.1:4173/4d300041-f251-4136-87bf-8c1b2c7bddae` は画像差し替え / 破棄後、`blob:http://127.0.0.1:4173/8f8f92e1-f161-463d-a93f-e11463abbeb3` は scanner 離脱後に監査コードが明示 fetch し、各 1 件 `ERR_FILE_NOT_FOUND`。通常操作では error 0 | 適合   | worker event、request #39–55、console log 2 行、DOM / storage URL scan                                                                                      |
| 外部データの安全な描画        | e-Gov 実レスポンスと OCR 実結果を DOM で表示                                                             | 実データは text と構造化 DOM で表示された。一方、HTML injection を狙う攻撃文字列を実入力として流す監査は実行していない                                                                                                                                                                                                                                | 未検証 | law viewer と OCR 結果の DOM                                                                                                                                |
| 全削除の対象領域              | 現行 UI と実 storage の棚卸し                                                                            | main IndexedDB 14 stores、OCR model 用 `keyval-store`、Workbox Cache Storage、Service Worker、同意 localStorage、sessionStorage が対象。利用者向け全削除 UI がなく、接続 / worker close 後の削除と reload 後の未復活を公開動作で実行できない                                                                                                          | 未達   | settings / data transfer の headed snapshot、IndexedDB / Cache Storage / Service Worker / Web Storage の実状態                                              |

新規 OCR session の段階別 request matrix は次のとおりである。「未要求」は context request と page / child target の CDP `Network.requestWillBeSent` の両方が 0 件だったことを表す。

| 資産                   | SW install より前                 | SW install / 同意前の route・scanner・画像・同意                                                            | 最初の実 request                                                                            | HTTP status | CDP initiator type / stack source                                                                                                                     |
| ---------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| OCR entry              | `about:blank` と clear 中は未要求 | `sw_install_home` で precache。law / search / study / settings / scanner / image / consent では新規要求なし | `http://127.0.0.1:4173/assets/src-CwV7Emr-.js`                                              | 200         | `script`。service worker target の `workbox-9c191d2f.js:0:5923`。実行時 dynamic import は main `index-BXkBy4yt.js:60:30627` から、SW / disk cache hit |
| worker                 | 未要求                            | 同意 UI 表示まで未要求                                                                                      | `http://127.0.0.1:4173/tesseract/worker.min.js`、`execute_cancel`                           | 200         | `script`。worker target の `blob:http://127.0.0.1:4173/4eeb6b98-1389-46e5-a2e7-99c86e13a7e4:0:0`                                                      |
| WASM loader            | 未要求                            | 同意 UI 表示まで未要求                                                                                      | `http://127.0.0.1:4173/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js`、`execute_cancel` | 200         | `script`。worker target の `worker.min.js:1:108361`                                                                                                   |
| standalone WASM binary | 未要求                            | 同意 UI 表示まで未要求                                                                                      | 実行、cancel、完了を含む全段階で未要求。request URL なし                                    | status なし | request がないため initiator / stack も対象外                                                                                                         |
| 日本語 model           | 未要求                            | 同意 UI 表示まで未要求                                                                                      | `http://127.0.0.1:4173/tessdata/jpn.traineddata`、`execute_cancel`                          | 200         | `script`。worker target の `worker.min.js:1:92961`                                                                                                    |

### 8.5 未達事項と後続 Issue

Issue #40 の監査によって、現行実装と品質基準の差を特定した。

測定で確認した未達事項は、それぞれ実在する後続 Issue と対応付ける。

| 未達事項                           | 監査結果                                                                                                                                                            | 後続 Issue                                                                                                                      | 優先理由                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 文字サイズ、行間、テーマ           | 現行 UI は値の表示だけで、選択、端末保存、再起動時復元がない                                                                                                        | [#112 文字サイズ・行間・テーマの表示設定を実装する](https://github.com/SlashNephy/surasura-roppou/issues/112)                   | 第 3 節で必須とした利用者設定を提供するため                                                               |
| ローカルデータの全削除             | 利用者向け操作がなく、model 用 `keyval-store` を含む owned storage の削除と reload 後の未復活を検証できない                                                         | [#113 ローカルデータを一括削除できるようにする](https://github.com/SlashNephy/surasura-roppou/issues/113)                       | OCR source text と model を含むローカルデータを利用者が制御できるようにするため                           |
| 大規模法令の Long Task             | warm 初回表示最大 292 ms、表示切替最大 166 ms、目次最大 86 ms。cold 初回表示も全 3 試行で main JS `FunctionCall` 最大 132 ms と描画最大 328 ms を観測した           | [#114 大規模法令表示の Long Task を解消する](https://github.com/SlashNephy/surasura-roppou/issues/114)                          | warm / cold の両方で変換または描画に帰属する 50 ms 超があり、main thread block の必須基準を満たさないため |
| 初期 main JavaScript chunk         | 686,762 bytes minified / 204,424 bytes gzip で、Vite の既定 500 kB 超過 warning が残る                                                                              | [#117 初期 JavaScript chunk の責務とサイズを改善する](https://github.com/SlashNephy/surasura-roppou/issues/117)                 | Core Web Vitals の自動的な未達とはせず、chunk の責務とサイズ証跡を基に分割方針を設計するため              |
| OCR entry の precache              | dynamic import だが Service Worker install 時に 17,237 bytes の OCR entry を取得、保存                                                                              | [#115 OCR 実行コードをユーザー同意後に遅延読み込みする](https://github.com/SlashNephy/surasura-roppou/issues/115)               | 同意前取得を禁止する第 5 節の境界を満たさないため                                                         |
| 法令本文へのキーボード到達         | skip link などの bypass がなく、本文の前に目次 button 1,173 個が連続する                                                                                            | [#116 法令本文へ現実的なキーボード操作数で到達できるようにする](https://github.com/SlashNephy/surasura-roppou/issues/116)       | キーボード利用者が法令本文へ現実的な操作数で到達できないため                                              |
| 検索 dialog の終了と見出し構造     | Escape を 1 回押しても閉じず input にフォーカスが残る。閉じた状態でも検索 H2 が accessibility tree に残り、各ページの H1 より前に現れる                             | [#118 検索ダイアログの Escape・フォーカス・見出しを修正する](https://github.com/SlashNephy/surasura-roppou/issues/118)          | 検索 dialog の終了、フォーカス復帰、閉じた UI の accessibility tree を一つの受入領域として直すため        |
| scanner のキーボードフォーカス     | 1 x 1 file input が Tab stop だがフォーカスを視認できない。同意表示直後、Escape 後、「やめる」後は `BODY` になり、Escape でも inline consent panel は閉じない       | [#119 スキャナーの画像入力と同意 UI のキーボードフォーカスを修正する](https://github.com/SlashNephy/surasura-roppou/issues/119) | scanner 内の画像選択と同意 UI に対象を限定して、視認可能なフォーカスと終了後の継続先を保証するため        |
| SPA 遷移と download 後のフォーカス | home → scanner、study → cards、settings → data transfer の遷移後は `BODY` になる。JSON export は button が残っているにもかかわらず Enter / Space 後に `BODY` になる | [#120 SPA 遷移とダウンロード後のフォーカスを安全な位置へ移す](https://github.com/SlashNephy/surasura-roppou/issues/120)         | route 遷移と download 完了後のフォーカス配置を独立した受入領域として保証するため                          |
| 320 CSS px の横スクロール          | law / study / settings / data transfer で最大 15 px の page-level 横スクロール                                                                                      | [#121 320 CSS px でページ全体の横スクロールを解消する](https://github.com/SlashNephy/surasura-roppou/issues/121)                | Reflow の必須基準で禁止した二方向スクロールが発生するため                                                 |
| 44 x 44 CSS px の推奨              | 法令 viewer の 2,360 対象中 2,356 対象など、複数 route で高さ 28–42 px の単独操作を観測                                                                             | [#122 主要なタッチ操作を 44 x 44 CSS px の推奨値へ近づける](https://github.com/SlashNephy/surasura-roppou/issues/122)           | AA の 24 px 最低基準には適合するが、製品上の推奨値を満たさない理由と代替策がないため                      |
| OCR 画像、送信、analytics 境界     | 画像の永続化と外部送信、analytics request はなく、worker / object URL も離脱時に残らなかった                                                                        | 適合項目のため Issue なし                                                                                                       | 全削除だけは上記の専用 Issue で扱い、適合したプライバシー境界は維持する                                   |
| 外部データへの攻撃文字列入力監査   | e-Gov と OCR の実データ表示は確認したが、HTML injection を狙う実入力による browser 監査は実行していない                                                             | 未検証のため Issue は作成しない                                                                                                 | 未達と断定せず、外部入力の表示層を変更する作業で実入力監査を行う                                          |

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
- [ ] **法令ビューアまたは性能関連の変更**：民法（lawId `129AC0000000089`）の実レスポンスを取得し、第 4.2 節の手順で cold cache と warm cache の初回法令表示をそれぞれ 3 回測定した。
- [ ] **法令ビューアまたは性能関連の変更**：表示モード切替と目次操作を第 4.2 節の手順で別々に 3 回ずつ測定し、それぞれの中央値と判定を記録した。
- [ ] **法令ビューアまたは性能関連の変更**：全測定区間の Long Task を記録し、Chromium performance trace で正規化または描画への帰属を確認した。
- [ ] **性能または PWA 関連の変更**：初期 JavaScript の minified / gzip サイズと PWA precache の entry 数 / 合計サイズを記録し、Vite の既定 500 kB 超過 warning が残る場合は責務とサイズを証跡にした後続 Issue を記録した。
- [ ] **OCR/PWA 変更**：fresh headed Chrome profile で origin の storage と Service Worker を初期化し、HTTP cache を bypass して各段階の Network、precache manifest、Cache Storage を記録した。
- [ ] **OCR/PWA 変更**：現行アプリでは OCR 画像の外部 request と永続化がなく、OCR 画像と OCR テキストの analytics 送信もないことを Network と各保存領域で確認した。
- [ ] **保存スキーマ変更**：ローカルスキーマの変更が export、import、全削除へ与える影響を、公開動作で確認した。
- [ ] **すべての変更**：`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm test` をコミット直前に順番どおり実行し、すべて終了コード 0 であることを記録した。
- [ ] **すべての変更**：PR 前に `pnpm run review:antigravity` を実行し、skip または指摘がある場合も出力を記録した。
- [ ] **すべての変更**：適合の根拠として、実行したコマンドと出力、実レスポンス、スクリーンショットのうち該当する証跡を添付した。

## 10. 監査の更新手順

1. 監査日と時刻、監査対象 commit の完全な SHA を第 8.1 節へ記録し、監査結果を追記する commit と区別する。
2. OS、CPU、メモリ、Node、pnpm、ブラウザとそのバージョン、desktop と mobile の viewport を記録する。
3. production build のコマンド、初期 JavaScript の minified / gzip サイズ、PWA precache の entry 数 / 合計サイズ、Vite warning、ネットワーク条件、ブラウザキャッシュ、Cache Storage、Service Worker の登録と制御状態、共通の時刻源、各試行の開始 mark と終了 mark、開始 route、表示モード、scroll 状態を記録する。
4. e-Gov API の取得 URL、HTTP status、revision、payload size、正規化後の node count と実レスポンスの証跡を記録する。
5. cold cache は試行ごとに一意な新規 headed Chrome session で HTTP cache と origin storage を初期化し、新規 Service Worker の control と法令データ 0 件を確認する。warm cache は同じ warm session を使う。両方で `responseEnd`、`article[aria-label="民法"] article` の空でない text、二つの `requestAnimationFrame` callback を記録し、それぞれ 3 回測定する。
6. 表示モード切替は「読みやすい表示」から「原文表示」、目次操作はアクセシブルネームを記録した同一の固定対象を使い、各開始操作、状態属性、二つの `requestAnimationFrame` callback、3 回の値、中央値、判定を別々に記録する。
7. cold cache と warm cache の初回表示および各操作の全測定区間で 50 ms を超える Long Task を記録し、同じ区間の Chromium performance trace で正規化または描画への帰属を記録して、LCP、INP、CLS、console error も測定条件と対応付ける。
8. OCR 監査は fresh headed Chrome profile で origin の Cache Storage、IndexedDB、`localStorage`、`sessionStorage` を消去し、Service Worker を unregister して HTTP cache を bypass した状態から始める。
9. reload 後の新しい Service Worker の install、activate、control を待ち、段階操作前と各段階の Network URL と initiator、dynamic import、precache manifest、Cache Storage、IndexedDB、Web Storage、OCR 画像の外部 request の有無を記録する。
10. アクセシビリティと OCR の各操作について、実行順、観測結果、Network、Application、accessibility tree、スクリーンショットを記録し、44 x 44 CSS px の推奨値と 24 x 24 CSS px の最低基準または公式例外を分けて判定する。
11. 各項目を「適合」「未達」「未検証」「対象外」のいずれかで判定し、「未検証」と「対象外」には理由を添える。「未検証」は、必須の実レスポンス、環境、操作、証跡のいずれかを取得できなかった場合に使用し、取得できなかった対象と理由を記録する。
12. 「未達」には再現手順、利用者への影響、測定値を付け、作成済みの後続 Issue の実在 URL を記録する。
13. 証跡には実行したコマンドと出力、実レスポンス、スクリーンショットだけを使用し、確認したという記述だけで適合にしない。
14. 条件が前回と異なる場合は差分を記録し、比較できない値を改善または悪化の根拠にしない。
