# IndexedDB schema version 2 に検索ストアを追加する

Date: 2026-07-09

## Status

Accepted

## Context

M3 の検索機能（[#32](https://github.com/SlashNephy/surasura-roppou/issues/32)）で、名前・番号・略称による法令カタログ検索と、保存済み本文の全文検索を実装する。
design-doc 9.4 は検索インデックスを保存済み法令対象と定め、全法令横断は将来の BFF に委ねる。
[ADR 2026-07-06](2026-07-06-indexeddb-storage-version-1.md) の規約に従い、ストア追加は IndexedDB version を上げて記録する。

## Decision

`surasura-roppou` database を version 2 に上げ、object store を 2 つ新設する。

- `lawCatalog`: e-Gov から取得した法令メタデータのキャッシュ。名前・番号・略称のローカル照合と、オフライン時の検索対象にする。keyPath は `lawId`。
- `searchPostings`: 保存済み本文の Bigram 転置インデックス。keyPath は複合キー `[lawId, bigram]` とし、`by-bigram` / `by-law-id` インデックスを持つ。

postings を法令ごとに独立キーで持つのは、1 法令の保存・削除を他法令と混在させずに追記・一括削除でき、検索時だけ `by-bigram` で横断マージできるためである。
両ストアは派生データ（キャッシュと索引）なので、version 2 の migration は空ストア作成のみとする。
version 1 時点で保存済みの法令には postings が無いため、保存済みなのに未索引の法令を検知して初回に一度だけ再索引（backfill）する。

## Consequences

- 保存済み本文の全文検索と snippet 生成を、外部通信なしでオフラインでも実行できる。
- 検索索引は原本ではなく派生データなので、破損時は保存済み本文からの再索引で復元できる。エクスポート対象にも含めない。
- 索引の実体（Bigram の生成）は `core/search` に閉じ込め、`core/storage` は保存後に呼ぶ最小フックだけを持つ。層の依存は `core/search → core/storage` の一方向を保つ。
- 保存済み本文が増えると postings レコードも増えるが、検索はクエリの bigram 分の postings しか読まないため、保存済み法令の規模では実用的な速度を保てる。
