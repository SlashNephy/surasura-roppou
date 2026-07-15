# ローカルデータのインポート・エクスポート設計

## 1. 目的

Issue #39 として、現在の保存データ export version 2 を別端末・別ブラウザへ完全に往復できる JSON import/export を提供する。

対象は次の 7 分類とする。

1. 保存法令本文（`savedLaws`）
2. ブックマーク（`bookmarks`）
3. コレクション（`collections`）
4. メモ（`annotations`）
5. 学習カード（`studyCards`）
6. 回答ログ（`reviewLogs`）
7. 学習セッション（`studySessions`）

`CardSchedule` は `ReviewLog` から再構築できる導出キャッシュなので export に含めない。import 後に対象カードの全履歴から再計算する。

## 2. 確定事項

- export/import の正規形式は既存の version 2 とする。
- version 1 は実際の利用者向けに出力されていないため、import 対象外とする。
- 未知の version は推測変換せず拒否する。
- import は既存データへマージする。ファイルにない既存データは残す。
- 同一 ID のレコードは import 側で上書きし、ID を再採番しない。
- ファイル全体を検証した後、単一 IndexedDB トランザクションで全件を反映する。
- 1 件でも不正、または書き込みに失敗した場合は何も変更しない。
- ファイル選択時には書き込まず、内容のプレビュー後に利用者が明示的に確定する。
- import ファイルは端末内でのみ読み、外部へ送信・保存しない。

## 3. 対象外

- version 1 以前の import とデータ変換
- export ファイルによる既存データの全置換・削除
- `CardSchedule` の export
- OCR セッション、ユーザー設定、検索インデックスの export/import
- アカウント同期、ときどき六法同期、クラウド保存
- Android 固有のファイルピッカーや共有シート

## 4. コンポーネント構成

### 4.1 `core/storage`

`src/core/storage/export-data.ts` の `SavedDataExport` version 2 を正規データ型として維持する。

新しい import モジュールは JSON を信頼済みの型として直接扱わず、`unknown` から次の順で検証する。

1. JSON として構文解析できる。
2. `version` が数値の `2` である。
3. JSON Schema に適合する。
4. 配列内に同一 ID の重複がない。
5. JSON Schema だけでは表現しにくいデータ間の不変条件を満たす。

公開契約は次の責務に分ける。

```ts
interface PreparedSavedDataImport {
  data: SavedDataExport;
  preview: SavedDataImportPreview;
}

interface SavedDataImportPreview {
  version: 2;
  exportedAt: ISODateString;
  counts: {
    savedLaws: number;
    bookmarks: number;
    collections: number;
    annotations: number;
    studyCards: number;
    reviewLogs: number;
    studySessions: number;
  };
}

interface SavedDataImportResult {
  importedAt: ISODateString;
  counts: SavedDataImportPreview["counts"];
}

function parseSavedDataImport(input: unknown): PreparedSavedDataImport;

interface StorageRepository {
  importSavedData(data: SavedDataExport): Promise<SavedDataImportResult>;
}
```

### 4.2 `core/native-integration`

`src/core/native-integration/data-transfer.ts` に、将来の Web/Android ブリッジから共用できる DOM 非依存のユースケースを置く。

- repository から version 2 の JSON テキスト、ファイル名、MIME type を生成する。
- JSON テキストを構文解析し、`core/storage` の検証結果とプレビューを返す。
- 確定済みのデータを repository の import 操作へ渡す。

`File`、`Blob URL`、`<a download>`、ファイル入力要素は Web UI の責務とし、この層へ持ち込まない。

### 4.3 `app`

`/settings/data-transfer` に専用ページを追加する。`createAppRouter` の既存 DI パターンで `StorageRepository` を渡し、テストでは memory/fake IndexedDB repository を注入できるようにする。

設定トップの「エクスポート / インポート」は専用ページへのリンクへ変更する。保存リストの既存 export ボタンはショートカットとして残し、専用ページと同じ export ユースケースを使う。

## 5. JSON Schema と version 方針

正本を `docs/schemas/saved-data-export-v2.schema.json` に置き、実行時の import 検証でも同じファイルを利用する。schema をドキュメント用に別コピーしない。

schema は各レコードの必須フィールド、列挙値、配列、ネストした target、保存法令の構造を定義する。未知フィールドは拒否する。

今後、任意フィールドの追加を含めて export の構造を変更する場合は version を上げる。古いアプリが同じ version の新構造を誤って受理・保存しないことを優先する。

`docs/data-import-export.md` に次を記載する。

- version 2 の対象データ
- schema ファイルへのリンク
- マージと同一 ID 上書きの規則
- `CardSchedule` を含めない理由
- version 1 を受理しない理由
- ファイルが端末外へ送信されないこと
- 将来 version を上げる条件

## 6. データ整合性

### 6.1 必須参照

- `ReviewLog.cardId` は同じファイル内の `StudyCard.id` を参照する。
- 保存法令内の `LawRevision.lawId` と全 `LawNode.lawId` は `Law.lawId` と一致する。
- 保存法令内の全 `LawNode.revisionId` は `LawRevision.revisionId` と一致する。
- 保存法令内の `LawNode.children` と `parentId` は同じ保存法令内のノードを相互に参照し、子の重複や循環を含まない木構造を成す。

### 6.2 不在を許容する参照

`StudySession` は回答の真実の源ではなく、画面上のセッションを表す補助メタデータである。現行実装はセッション保存失敗後も `ReviewLog` の記録を継続する。また、カード削除時には過去の `StudySession` を削除しない。

したがって次の不在は正当な履歴として許容する。

- `Collection.bookmarkIds` に対応する `Bookmark` がない。現行 UI は欠落したブックマークを除外し、空のコレクションとして表示する。
- `ReviewLog.sessionId` に対応する `StudySession` がない。
- `StudySession.cardIds` に対応する `StudyCard` がない。

ブックマーク・メモ・学習カードの target が保存法令に含まれないことも許容する。対象法令をオフライン保存せずに利用者データだけを作成できるためである。

### 6.3 重複

別分類のレコードが同じ文字列 ID を使うことは許容する。同じ配列内に同一 ID が複数あるファイルは、上書き順が曖昧になるため import 前に拒否する。

## 7. 原子的なマージ

`StorageRepository.importSavedData` は、次の object store を含む単一の `readwrite` トランザクションを開く。

- `laws`
- `lawRevisions`
- `lawNodes`
- `savedLaws`
- `bookmarks`
- `collections`
- `annotations`
- `studyCards`
- `reviewLogs`
- `cardSchedules`
- `studySessions`

反映順は次のとおりとする。

1. 同一 lawId の保存法令がある場合、現在の revision と node を除去する。
2. import 側の Law、LawRevision、LawNode、SavedLawRecord を保存する。
3. Bookmark、Collection、Annotation、StudyCard、StudySession を `put` する。
4. ReviewLog を `put` する。
5. import された StudyCard と ReviewLog が関係する cardId ごとに、マージ後の全 ReviewLog を読む。
6. 履歴があれば現在のスケジューラで CardSchedule を再計算して `put` する。
7. 履歴がなければ対象 cardId の古い CardSchedule を削除する。
8. 全リクエストの完了後に transaction を commit し、件数を返す。

target を持つレコードには既存の `withTargetIndexes` と同じ規則で IndexedDB 用 index フィールドを付与する。公開データへ index 用フィールドを混入させない。

予期しない例外、IndexedDB request の失敗、スケジュール再計算の失敗は transaction 全体を abort する。検証済みデータの永続化で一部成功を返す経路は作らない。

## 8. UI と状態遷移

専用ページは export と import を独立した領域として表示する。

### 8.1 Export

- 「JSONをエクスポート」を押すと現在時刻を `exportedAt` にして version 2 を生成する。
- ファイル名は既存規則 `surasura-roppou-export-YYYY-MM-DD.json` を維持する。
- 保存法令本文を 1 件でも読み出せない場合は export 全体を失敗させ、不完全なファイルを download しない。
- 生成中は export と import の確定操作を無効化する。
- 成功と失敗をページ内の `role="status"` / `role="alert"` で通知する。

### 8.2 Import 準備

- file input は `.json` と `application/json` を受け付ける。
- 選択したファイルを `text()` で読み、JSON parse と schema/意味検証を行う。
- 検証済みデータはページのメモリ内 state にだけ保持する。
- version、exportedAt、7 分類の件数、同一 ID が上書きされる規則をプレビュー表示する。
- ファイル選択だけでは repository を変更しない。
- 別ファイルを選ぶと前のプレビューとエラーを置き換える。

### 8.3 Import 確定

- 「インポートを実行」を押したときだけ repository へ書き込む。
- 実行中は file input、export、import ボタンを無効化し、二重実行を防ぐ。
- 成功時は取り込んだ 7 分類の件数を表示し、準備済みデータを破棄する。
- 失敗時はプレビューを保持し、利用者が再試行できるようにする。

デスクトップでは既存の最大幅とカード表現へ合わせる。モバイルでは file input と主要ボタンを横幅いっぱいにし、文字列の折り返し、キーボード操作、アクセシブルネーム、フォーカス表示を維持する。

## 9. エラー分類

利用者向けメッセージは少なくとも次を区別する。

| 分類                       | 表示方針                                       |
| -------------------------- | ---------------------------------------------- |
| ファイル読み込み失敗       | ファイルを読み直せるよう促す                   |
| JSON 構文エラー            | JSON ファイルとして読み取れないことを伝える    |
| version 不一致             | 対応 version は 2 であることを伝える           |
| schema 不一致              | 最初の検証箇所を人が読める形で示す             |
| ID 重複・参照不整合        | 対象分類と ID を示す                           |
| IndexedDB 書き込み失敗     | 変更されていないことと再試行できることを伝える |
| export 生成・download 失敗 | 保存データを読み込める状態で再試行するよう促す |

内部例外や生の validator 出力をそのまま UI に表示しない。開発者が原因を追える情報は Error の cause または構造化したエラー詳細に保持する。

## 10. テスト戦略

### 10.1 Schema / parser

table testing に近い形で、正常な version 2、JSON 構文エラー、version 不一致、必須項目不足、未知フィールド、列挙値不正、配列内 ID 重複、必須参照不整合、不在を許容する Collection / StudySession 参照を検証する。

`createSavedDataExport` が生成した実オブジェクトを正本 schema で検証し、export と schema の乖離を検出する。ソースや設定ファイルの文字列探索ではなく、生成物の公開契約を検証する。

### 10.2 Repository / round trip

`fake-indexeddb` の実 repository を使い、次を検証する。

- 7 分類を保存した DB を export し、JSON 化・parse 後に空 DB へ import し、再 export すると `exportedAt` 以外が一致する。
- 同一 ID は上書きされ、ファイルにない既存レコードは残る。
- 同一法令の旧 revision/node は残らない。
- マージ後の ReviewLog 全履歴から CardSchedule が再計算される。
- 履歴のない import 対象カードには古い CardSchedule が残らない。
- transaction 後半で失敗した場合、前半の書き込みも残らない。

### 10.3 UI

Testing Library で次を利用者操作として検証する。

- 設定トップから専用ページへ移動できる。
- ファイル選択後に件数プレビューを表示するが、まだ repository を変更しない。
- 確定操作後に import し、成功件数を表示する。
- 不正ファイルのエラーを表示して import を呼ばない。
- import 失敗時にプレビューを保持する。
- 処理中の二重 export/import を防ぐ。
- 保存リストの既存 export が共通処理への変更後も JSON を download する。

## 11. 実画面検証と完了ゲート

コミット直前に次を実行する。

```bash
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
```

PR 前に `pnpm run review:antigravity` を実行する。

Web UI 変更のため、システムの `playwright-cli open --headed` で確立したセッションを再利用し、デスクトップ幅とモバイル幅で次を操作する。

1. 設定トップからデータ移行画面を開く。
2. version 2 の実ファイルを選択する。
3. プレビューの version、日時、7 分類の件数を確認する。
4. import を確定する。
5. 保存リストと学習カード画面へ移動し、取り込んだデータを確認する。
6. export を実行し、download が開始することを確認する。

プレビューと成功状態をスクリーンショットに残し、`gh image upload` で PR 本文へ添付する。外部 API・HTTP・GraphQL を変更しないため、実レスポンス確認ゲートは対象外とする。
