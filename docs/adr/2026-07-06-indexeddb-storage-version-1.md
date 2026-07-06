# IndexedDB schema version 1 を定義する

Date: 2026-07-06

## Status

Accepted

## Context

M2 では、保存済み法令、ブックマーク、メモ、復習カード、OCR セッションをローカル優先で扱う。
後続の PWA キャッシュ、オフライン閲覧、保存リスト、共有導線は、ブラウザ内の永続データ構造を前提にする。

生の IndexedDB API は transaction と request の扱いが冗長で、型安全な store/index 契約を保ちにくい。
一方で、localStorage では法令本文ノード、検索対象、学習履歴のような構造化データを安全に扱いにくい。

## Decision

IndexedDB wrapper には `idb` を使う。
schema version 1 は `surasura-roppou` database とし、次の object store を定義する。

- `laws`: e-Gov の `lawId` を key にした法令メタデータ。
- `lawRevisions`: `revisionId` を key にした改正単位メタデータ。
- `lawNodes`: `LawNode` を本文構造順で保存するノード store。
- `savedLaws`: オフライン保存済み法令の marker。
- `bookmarks`: 法令トップまたは条文単位のブックマーク。
- `collections`: ブックマーク集合。
- `annotations`: 条文単位のメモ。
- `studyCards`: 復習カード。
- `studySessions`: 復習履歴。
- `ocrSessions`: OCR セッション。ただし画像 Blob は既定では保存しない。

schema 変更は IndexedDB version を増やし、`openDB` の `upgrade` callback に追加 migration を実装する。
store 名、keyPath、index 名を変更する場合は、既存 version からの migration と ADR を追加する。

## Consequences

- 後続 issue は `core/storage` の repository contract を使って保存済み本文、ブックマーク、復習データを扱える。
- `idb` の typed `DBSchema` により、store 名と index 名の誤りを TypeScript で検出しやすい。
- 保存済み本文の削除は `savedLaws` と `lawNodes` を対象にし、ブックマークやメモなど user-owned data は削除しない。
- OCR 画像は design doc の方針どおり、明示的な保存設計が入るまでは DB に永続化しない。
