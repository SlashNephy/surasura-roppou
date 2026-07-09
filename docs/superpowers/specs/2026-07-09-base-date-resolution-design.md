# 基準日による版解決の設計

Status: Approved (設計検討セッション 2026-07-09)
Last updated: 2026-07-09

関連ドキュメント:

- Issue [#70 基準日による版解決を実装する](https://github.com/SlashNephy/surasura-roppou/issues/70)（親: #3、Blocking: #71, #20）。
- [改正・基準日の参照設計](./2026-07-07-revision-and-asof-design.md) の 4〜5 章・8 章。
- [Design Doc](../../design-doc.md) の 5.1 章（学習年度の基準日で条文を確認したい）、8.4 章（法的正確性）。
- [UI ワイヤーフレーム設計](./2026-07-06-ui-wireframe-design.md) の本文ツールバー・フッター記述。

## 1. 決定事項の要約

- 学習年度の**基準日はグローバル設定**とし、`localStorage` に永続化する。未設定時は「今日／現行法」として扱う。
- 版解決は **e-Gov API v2 の `asof` に委譲**する。`law_data/{lawId}?asof=YYYY-MM-DD` がサーバー側で「施行日 ≤ asof の最新版」を返すことを検証済みのため、クライアント側で施行日比較は実装しない。
- 本 Issue のスコープは「基準日設定 ＋ asof 版解決の配線（ビューワー）＋ 解決版の表示」に絞る。指紋・二重アンカー・見比べ画面（参照設計 2〜4 章）は保存物向けであり、依存 Issue #71/#20 に委ねる。

## 2. スコープ

### 2.1 対象

- グローバル設定「学習年度の基準日」の読み書き・永続化。
- 設定画面での基準日入力 UI（日付ピッカー）。
- ビューワーのデータ取得経路へ基準日を `asof` として配線し、版を切り替える。
- ビューワーのツールバーとフッター注記に「解決に使った基準日」と「解決版の施行日」を表示する。

### 2.2 非対象（本 Issue では実装しない）

- 条文指紋・二重アンカー・改正見比べ画面（#71/#20）。
- 検索のオンライン取得経路への `asof` 適用（現状の検索はオフライン保存本文・カタログ対象で、オンライン取得経路が未接続のため）。
- 復習（study）の根拠条文表示（復習機能が未実装のため）。
- オフライン保存物の「更新あり」再同期 UI（参照設計 6 章・UI 設計 8 章。基準日変更で保存物は自動差し替えしない方針のみ踏襲する）。

## 3. e-Gov API v2 検証結果（作業項目1）

2026-07-09 に本番 API へ実リクエストを送り、以下を確認した（法令: 民法 `129AC0000000089`）。

- `GET /law_revisions/{lawId}`: 全改正版を `amendment_enforcement_date`（施行日）つき・施行日降順で返す。
- `GET /law_data/{lawId}?asof=YYYY-MM-DD`: **サーバー側で「施行日 ≤ asof の最新版」を解決**して返す。
  - `asof=2020-06-01` → 2020-04-01 施行版。
  - `asof`（今日）→ 現行施行版。`asof` 未指定 → 現行施行版（同一結果）。
  - `asof`（未来）→ 未施行の最新予定版（`current_revision_status=UnEnforced`）。
- **制約**: `asof` は **2017-04-01 以降**のみ受理。それ未満は HTTP 400（`code=400044`, message「法令の時点（asof）には2017-04-01以降を指定してください。」）。

帰結: 参照設計 8 章の縮退方式（取得のたびに前回スナップショットと指紋比較）は**採用しない**。版解決はサーバーに委ね、実装は「基準日の配線」と「解決版の表示」に集中する。この検証結果と 2017-04-01 制約を ADR に記録する（9 章）。

## 4. コンポーネント設計

### 4.1 設定モジュール `src/core/settings/base-date.ts`（新規・純ロジック）

基準日の永続化と購読だけを担う小さな単位。React に依存しない。

```ts
// e-Gov API v2 が受理する asof の下限
export const earliestBaseDate = "2017-04-01";

// localStorage キー
const baseDateStorageKey = "surasura:base-date";

// 保存値を読む。YYYY-MM-DD 形式かつ earliestBaseDate 以上でなければ undefined。
export const getBaseDate: () => string | undefined;

// 保存する（undefined でクリア）。値変更をリスナーへ通知する。
export const setBaseDate: (value: string | undefined) => void;

// 変更購読。storage イベント（タブ間）とローカル通知の両方を配送する。
export const subscribe: (listener: () => void) => () => void;

// 取得時に送る asof を決める。基準日が有効なら基準日、未設定なら undefined（現行法）。
export const resolveAsOf: (baseDate: string | undefined) => string | undefined;
```

- 検証: `/^\d{4}-\d{2}-\d{2}$/` かつ実在日かつ `>= earliestBaseDate`。不正値は保存しない／読取時は `undefined` を返す（未設定扱いにフェイルセーフ）。
- 通知: モジュール内のリスナー集合へ同期通知しつつ、`window` の `storage` イベントも購読してタブ間で同期する。

### 4.2 React フック `src/app/use-base-date.ts`（新規）

```ts
export const useBaseDate: () => {
  baseDate: string | undefined;
  setBaseDate: (value: string | undefined) => void;
};
```

- `useSyncExternalStore(subscribe, getBaseDate)` で 4.1 のストアを購読する（React 19 の外部ストア購読の定石）。
- 既存 `src/app/use-saved-laws.ts` と同じ app 層フックとして配置する。

### 4.3 ビューワーデータ経路（変更）

- `loadLawViewerDocument(lawId, repository?, storageRepository?, asOf?)` に `asOf` 引数を追加し、`repository.getLaw(lawId, { asOf })` へ渡す（`LawDataQuery.asOf` は既存）。
- `LawViewerPage` で `useBaseDate()` を読み、`resolveAsOf(baseDate)` を計算して `LawViewerPageLoader` へ渡す。
- `LawViewerPageLoader` の取得 `useEffect` 依存に `asOf` を追加し、基準日変更時に**再フェッチ**する（ページ全体は remount しない）。
- 版が変わると `LawViewerReadyState` の `key`（`revisionId` を含む）が変化し、目次・アンカーが新版で再構築される。

### 4.4 設定画面 `src/app/pages.tsx` の SettingsPage（実体化）

- 現状の静的プレースホルダーから、「学習年度の基準日」行を**日付入力（`<input type="date">`）** に変更する。
  - `min={earliestBaseDate}`。未来日は許可（未施行の予定版を学習する用途があるため）。
  - 空にするとクリア（未設定＝現行法）。
  - 範囲外・不正値はブラウザ検証＋自前メッセージ「基準日は 2017-04-01 以降を指定してください」。
- 他の設定行（表示・データ）は本 Issue では静的表示のまま据え置く。

### 4.5 表示（作業項目4）

- **本文ツールバー**: 「基準日」インジケータを常設する（読取専用＋「設定で変更」への導線）。
  - 表示例: `基準日 2020-06-01 ・ 施行日 2020-04-01版`。
  - 未設定時: `基準日 未設定（現行法）`。
  - 値は `state.revision.effectiveDate` を用いる。
- **ビューワーのフッター注記**: ビューワー内下部に「基準日／施行日／取得日時」の注記行を置く。
  - 全画面共通フッター（`AppShell` の出典・免責）は**変更しない**。法令固有の基準日はビューワー内に閉じて表示する。
  - オフライン保存版へフォールバックしているとき（`loadedFromStorage`）は「保存版を表示中（基準日は未反映）」を明示する（7 章）。

## 5. データフロー

1. 設定画面で日付を選ぶ → `setBaseDate` → `localStorage` 保存＋通知。
2. `useBaseDate` が更新 → ビューワーが `resolveAsOf(baseDate)` を再計算。
3. `loadLawViewerDocument(lawId, repo, storage, asOf)` → `getLaw(lawId, { asOf })`。
4. e-Gov が版解決 → `revision.effectiveDate` を含む文書を返す。
5. 本文＋ツールバー／フッターに基準日と施行日を表示。
6. 未設定時は `asOf=undefined` → 現行法。

## 6. エラー・エッジ処理

- 入力段で `>= 2017-04-01` を保証し、読取時も再検証（不正値は未設定扱い）。
- `asof` 指定で `getLaw` が `EgovApiError`（当該法令にその基準日以前の版が無い等）:
  - 保存済み本文があれば従来どおりそれを表示（既存フォールバック）。
  - 無ければエラー表示に、基準日起因のメッセージ「指定した基準日にはこの法令の版が見つかりません。基準日を変更してください。」を出す（`asOf` が指定されていたときのみ文言を切り替える）。
- 未来基準日は未施行版を返し、`effectiveDate` が空になり得る → ツールバーは「施行日 —」とし、基準日のみ表示する（軽微・致命的でない）。
- オフライン保存物は基準日変更で自動差し替えしない（参照設計 6 章）。再同期 UI は本 Issue 非対象。

## 7. キャッシュ・オフラインとの関係

基準日（`asof`）は 3 つのキャッシュ層と次のように関係する。

### 7.1 PWA / Service Worker（HTTP キャッシュ）

- 現行の Workbox 設定はアプリシェルと静的アセットのみをキャッシュし、e-Gov API 応答（`law_data` 等）はキャッシュしない（[PWA キャッシュ戦略 ADR](../../adr/2026-07-06-pwa-cache-strategy.md)）。
- したがって `asof` は毎回サーバーへ渡り、Service Worker キャッシュが古い版を返すことはない。**両者は干渉しない。**

### 7.2 オフライン保存法令（IndexedDB `savedLaws`）

- 保存は**法令ごとに 1 版のみ**（`savedLaws` は `lawId` キーで `revisionId` を 1 つ保持）。基準日を変えても保存物は自動差し替えしない（参照設計 6 章）。
- **オンライン時**: `getLaw(lawId, { asOf })` で解決版を取得・表示する。保存物は `isSaved` / `savedAt` の判定にのみ使う。
  - 結果として**表示中の版と保存済みの版が異なり得る**。この不整合の解消（「更新あり」再同期）は #71/#20 の責務で、本 Issue では扱わない。「オフライン保存済み」バッジは「この法令のオフライン複製がある」という従来の意味のままとする。
- **オフライン時（取得失敗）**: 保存版（固定 `revisionId`）へフォールバックする。基準日を変えても表示版は変わらない。
  - このときツールバー／フッターの施行日は**実際に表示している保存版の `effectiveDate`** を用い（基準日ではなく）、`loadedFromStorage` のときは「保存版を表示中（基準日は未反映）」の注記で基準日と表示版のズレを明示する。

### 7.3 保存操作と基準日の一貫性

- オフライン保存は「保存操作時に表示していた版」を保存する。`asof` 配線後は表示版＝解決版なので、**基準日で解決した版がそのまま保存される**（参照設計 6 章と自動的に一致）。保存経路（`handleSaveToggle` → `savedLawUseCase.save`）のコード変更は不要。

### 7.4 検索カタログ（`lawCatalog`）

- バージョン非依存のメタデータ（名称・番号・略称）のみで、本文の版とは無関係。`asof` の影響を受けない。

## 8. テスト計画

- `base-date.ts`: get/set、範囲検証（`< 2017-04-01`・不正形式の拒否）、`resolveAsOf`、`subscribe` 通知の単体テスト。
- `use-base-date`: React Testing Library でストア連動を検証。
- `loadLawViewerDocument`: モック `LawRepository` に対し `asOf` が `getLaw` へ伝播することをアサート。
- ビューワー: 基準日変更で再フェッチし施行日表示が更新されること、未設定で現行法が出ることを検証。
- 設定画面: 日付入力と範囲外メッセージの RTL テスト。
- Playwright で基準日変更→版切替の実挙動を確認し、スクリーンショットを PR に添付する（CLAUDE.md）。

## 9. 完了条件との対応

- 「基準日を変更すると、ビューワーで表示される版が切り替わる」→ 4.3・5 章（`asof` 再フェッチ）。
- 「基準日未設定でも現行法が表示される」→ 4.1 `resolveAsOf`（未設定→`asof` 無し→現行施行版）。

## 10. ADR

`docs/adr/2026-07-09-egov-asof-server-side-resolution.md` を新設し、次を記録する。

- e-Gov API v2 `asof` がサーバー側で版解決すること（縮退方式を採らない根拠）。
- `asof` の下限 2017-04-01 という制約（基準日入力の下限の根拠）。

参照設計は「提供が無い場合のみ ADR」を求めるが、2017-04-01 制約は将来の実装判断に影響する重要事項のため肯定的検証結果も残す。
