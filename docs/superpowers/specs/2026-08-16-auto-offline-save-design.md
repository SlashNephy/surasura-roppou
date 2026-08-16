# 開いた法令を自動的にオフライン保存する（設計）

Issue: [#197](https://github.com/SlashNephy/surasura-roppou/issues/197)

## 背景と目的

現状、法令のオフライン保存はビューアの「オフライン保存」ボタンによる明示操作でしか行われない。
`docs/design-doc.md` の「最近開いた条文を自動保存する」という方針に沿って、開いた法令を自動的に端末へ保存し、オフラインでも読める状態を既定にする。

## 決定事項

| 論点                 | 決定                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| 既存の保存トグル     | 「ピン留め」に意味を変える。自動保存は常に走り、ピン留めは自動削除の対象外にする印 |
| 基準日・固定版の保存 | 版ごとに保存する。現行版は専用スロットで区別する                                   |
| 保存量の上限         | 件数上限 + LRU を入れる。法令数と、法令あたりの保持版数の二段で制限する            |
| オフライン時の既定版 | 「現行版スロット」の版を返す。過去版を一度見ただけで既定が引きずられない           |
| エクスポート範囲     | 現行版スロットのみ。過去版はローカルのキャッシュ扱い                               |

## PR 分割

レビュー負荷を抑えるため Stacked PR にする。

1. **PR 1: 版ごと保存へのスキーマ移行**（本 spec の対象）
   `savedLaws` を版ごとのレコードに変更し、現行版スロットの概念を導入する。振る舞いは現状維持（手動保存のみ）。
2. **PR 2: ピン留めセマンティクスと自動保存**
   保存トグルをピン留めに変更し、法令を開いたときの自動保存を導入する。
3. **PR 3: 件数上限と LRU エビクション**
   自動保存分に上限を設け、`updatedAt` 昇順で削除する。`navigator.storage.persist()` の要求も行う。

## 実現方式の検討

### 案 A: `savedLaws` を現行版スロットとして残し、過去版を新ストアに置く

keyPath を変えずに済むため migration が最も安全。ただし保存メタが 2 ストアに分かれ、全版の一覧やエビクションが恒久的に 2 ストアのマージになる。

### 案 B（採用）: `savedLaws` の keyPath を `[lawId, revisionId]` に変え、現行版フラグを持たせる

単一ストアで版と現行版スロットを表現でき、一覧・エビクション・エクスポートの実装が 1 箇所に閉じる。
keyPath 変更のため object store の作り直しが必要になるが、versionchange トランザクション内で旧レコードを読み出して詰め直せるため、情報の欠落なく移行できる。

### 案 C: 過去版は本文ノードだけ残す

メタ情報を持たないため過去版を一覧・削除できず、エビクションの対象にもできない。孤児ノードが溜まるだけなので却下。

## データモデル（DB v4）

```
savedLaws
  keyPath: ["lawId", "revisionId"]
  value:   { lawId, revisionId, isCurrent: 0 | 1, nodeCount, savedAt, updatedAt }
  indexes:
    by-law-id      : "lawId"                 版一覧の取得
    by-law-current : ["lawId", "isCurrent"]  lawId から現行版を 1 件引く
    by-saved-at    : "savedAt"               保存一覧の並び（現行版以外は読み飛ばす）
    by-updated-at  : "updatedAt"             LRU 用（PR 3）
```

`isCurrent` 単独の索引は作らない。`listSavedLaws()` は `savedAt` の降順で返す必要があるため、`by-saved-at` を辿って履歴版を読み飛ばす方が索引を増やさずに済む。単独索引が要るのは PR 3 のエビクションで実測が必要になった場合に限られる。

`isCurrent` は boolean ではなく `0 | 1` の数値にする。IndexedDB のキーに boolean は使えず、boolean にすると索引が作れないため。

`savedAt` は「その版を初めて保存した時刻」、`updatedAt` は「最後に書いた時刻」を版単位で保持する。

#### `savedAt` の意味の変更と、それに伴う振る舞いの変化

旧スキーマの `savedAt` は法令単位で、別の版に更新しても初回保存時刻のまま据え置かれた。
版単位に変えることで、同じ法令を新しい版で保存し直すと `savedAt` はその時刻になる。

PR 1 は「ユーザーから見える振る舞いを変えない」ことを完了条件としていたが、この点だけは例外として変化を受け入れる。
版ごと保存の意味論としては版単位の保存日時の方が自然であり、法令単位の初回保存時刻を維持するには保存のたびに追加のクエリが必要になるため。

観測できる変化は次の 3 点。PR 本文に明記する。

- ビューアの「保存日時」表示が、版の更新を取り込んだ時点で更新される
- 保存一覧（`savedAt` 降順）で、改正を取り込んだ法令が先頭に来る
- エクスポート JSON の `savedAt` の値

### 不変条件

1 つの `lawId` につき `isCurrent: 1` のレコードは高々 1 件。
新しい現行版を保存するときは、同一トランザクション内で旧現行版を `isCurrent: 0` に降格させ、履歴版として残す。
この不変条件はリポジトリ層に閉じ込め、外部から直接壊せる API は公開しない。

### 本文の格納

`LawNode.id` は `${lawId}:${revisionId}:${path}` で組み立てられるため、`laws` / `lawRevisions` / `lawNodes` は無変更で版を共存させられる。
変更点は `saveLawDocument` が旧版のノードと revision を削除しなくなることのみで、削除責務は PR 3 のエビクションへ移る。

### migration v4

versionchange トランザクション内で次を行う。

1. 旧 `savedLaws` を `getAll()` で読み出す
2. `deleteObjectStore("savedLaws")`
3. 新 keyPath と索引で `createObjectStore`
4. 各レコードに `isCurrent: 1` を付けて `put`

旧レコードは `lawId` / `revisionId` / `savedAt` / `updatedAt` を既に持つため、情報の欠落は生じない。
v3 と同様、`upgrade` コールバックからは async 関数を void で発火し、想定外の例外は `transaction.abort()` して `openDB` の reject に流す。

## API 境界

既存 4 メソッドのシグネチャと意味は変えず、版を扱うメソッドを追加する。

```ts
// 既存（意味を「現行版」に確定させる。呼び出し側は無改修）
saveLawDocument(document: LawDocumentInput, options?: SaveLawDocumentOptions): Promise<void>;
getLawDocument(lawId: string): Promise<SavedLawDocument | undefined>;
listSavedLaws(): Promise<SavedLawSummary[]>;
deleteLawDocument(lawId: string): Promise<void>;

// 追加
getLawDocumentRevision(lawId: string, revisionId: string): Promise<SavedLawDocument | undefined>;
listSavedRevisions(lawId: string): Promise<SavedLawRevisionSummary[]>;
deleteLawRevision(lawId: string, revisionId: string): Promise<void>;

interface SaveLawDocumentOptions {
  isCurrent?: boolean; // 既定 true。基準日・固定版で取得した本文を保存するときだけ false
}
```

`SavedLawRevisionSummary` は `SavedLawSummary` から `law` を落とし、`isCurrent` を足したもの。版一覧では法令メタが重複するため。

`SavedLawUseCase.save(document, options?)` は `options` を透過的に受け渡すのみとする。
PR 1 ではビューアの呼び出し方を変えないため、常に現行版として保存され、振る舞いは現状と同じになる。

## データフロー

### 保存（PR 1 時点 = 手動保存のみ）

```
ビューアの保存ボタン
  → SavedLawUseCase.save(document)          options 省略 = 現行版
  → StorageRepository.saveLawDocument
      ├ by-law-current で旧現行版を引く → あれば isCurrent: 0 に降格
      ├ laws / lawRevisions / lawNodes に put（旧版のノードは削除しない）
      └ savedLaws に [lawId, revisionId] で put（isCurrent: 1）
```

### 取得とオフラインフォールバック（PR 1 では経路不変）

```
loadLawViewerDocument(lawId, asOf?)
  → getLawDocument(lawId)   ← 常に現行版
  → e-Gov 取得を試みる
      ├ 成功 → オンライン版を表示
      └ 404 以外の失敗 → 現行版があればそれを表示（loadedFromStorage: true）
```

`getLawDocument(lawId)` が現行版を返すため `src/app/law-viewer-loader.ts` は無改修。
基準日を指定していてもフォールバック先が過去版に化けない。

### 削除

`deleteLawDocument(lawId)` は `by-law-id` 索引で全版を列挙し、各版の `savedLaws` レコード・`lawRevisions`・`lawNodes` を一括削除する。
保存一覧やビューアから見た振る舞い（法令ごと消える）は現状と同じ。

## エラー処理

**migration の失敗**: 想定外の例外は `transaction.abort()` して `openDB` の reject に流す。中途半端なスキーマのまま開くと以後の書き込みが静かに壊れるため。個別レコードの変換失敗は当該レコードをスキップして続行する（移行対象は再取得可能なキャッシュであり、ブックマークや学習カードは別ストアで影響を受けない）。

**不変条件が破れた場合の読み取り**: `isCurrent: 1` が同一 `lawId` に複数存在する状態は設計上起こらないが、起きた場合に `getLawDocument` が非決定的な結果を返すことは避ける。`updatedAt` が最大のものを返す。読み取り経路で修復書き込みは行わない（読み取りが書き込みトランザクションを要求すると、オフライン閲覧が保存領域の状態に巻き込まれるため）。

**現行版が存在しない法令**: PR 1 では発生しない（手動保存は常に現行版）。PR 3 の LRU が作りうるため、エビクションは現行版を最後に残すことを PR 3 の前提とする。読み取り側は `undefined` を返し、UI は「未保存」として扱う（既存の分岐がそのまま機能する）。

**トランザクション境界**: 降格・本文 put・メタ put はすべて 1 つの readwrite トランザクションで行い、`await tx.done` まで待つ。降格だけ成功して新版が入らない中間状態は生じない。

**保存失敗（QuotaExceededError など）**: PR 1 は手動保存のみのため現状のエラーバナー表示を維持する。自動保存の失敗を閲覧の妨げにしない扱いは PR 2 の責務。

## エクスポート / インポート

`exportSavedData` は `listSavedLaws()`（現行版のみ）を使うため無改修。

`import-saved-data.ts` は `savedLaws.get(lawId)` を使っている箇所を `by-law-current` 索引経由に差し替え、投入するレコードに `isCurrent: 1` を付ける。
エクスポート JSON の構造は変わらないため、旧形式のファイルはそのまま読める。

インポート対象と異なる版が現行版だった場合は、`saveLawDocument` と対称に**降格して履歴版として残す**。レコードもノードも削除しない。
インポートは他の法令を消さない以上「丸ごと復元」の意味論ではなく、ローカルの本文を破棄する理由がないため。
一方、インポート対象の版と同じ版が既にある場合は、その版のノードを一度削除してから入れ直す。
これを怠ると、ローカルにあってインポート側に無いノードが残留し、`nodeCount` と実件数がずれる。

品質基準の第 7 節・第 8.4 節に従い、storage schema を変更する本 PR では export と全削除の監査を行う。

## テスト方針

### migration（`migrations.test.ts` に追加）

- v3 形式の `savedLaws` レコードを持つ DB を手書きで再現し、現行バージョンで開いたあと新 keyPath で引けること・`isCurrent` が 1 であること
- 保存法令が 0 件の v3 DB でも問題なく開けること
- 索引（`by-current`、`by-law-current`、`by-updated-at`）が作られ、引けること

既存テストの方針に従い、seed 用のスキーマ定義は現行コードを流用せず手書きする。移行テストは「当時の形の DB」から始まらなければ意味がないため。

### リポジトリ（`repository.test.ts` に追加）

- 現行版を保存 → 別の版を現行版として保存すると、旧版が履歴として残り降格すること。`getLawDocument(lawId)` は新しい方を返すこと
- `isCurrent: false` で保存した版は現行版を置き換えないこと
- 同じ `[lawId, revisionId]` に再保存したとき `savedAt` が維持され `updatedAt` だけ進むこと
- `listSavedLaws()` が現行版のみを法令単位で返すこと
- `listSavedRevisions(lawId)` が全版を返すこと
- `deleteLawDocument(lawId)` が全版とノードを消し、`deleteLawRevision` が該当版だけ消すこと
- 版をまたいでノードが共存し、それぞれの版の本文が正しく引けること

### エクスポート / インポート

- 版が複数ある状態でエクスポートすると現行版のみが出力されること
- 旧形式のエクスポート JSON をインポートでき、現行版として入ること

型チェッカーが既に保証している事項（`isCurrent` の型など）は検証しない。不変条件は「降格が起きる」という振る舞いとして検証する。

## PR 1 の非スコープ

- **保存版の上限**: PR 1 単体では保存版が上限なく増える。PR 3 で LRU が入るまでの意図的な状態であり、リークではない。
- **自動保存**: PR 2 で導入する。PR 1 では手動保存のみで振る舞いは現状維持。
- **ピン留め UI**: PR 2 で導入する。
- **版一覧の UI**: `listSavedRevisions` はリポジトリ層とテストのみで、UI からは呼ばない。
