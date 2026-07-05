# e-Gov Law ID を canonical URL に使う

Date: 2026-07-05

## Status

Accepted

## Context

すらすら六法の法令ビューア URL は、Web、Android App Links、ブックマーク、共有リンク、保存データの参照で共通に使う契約になる。
候補には e-Gov の `lawId`、法令番号、独自 ID がある。

法令番号や略称は人間にとって入力しやすいが、表記ゆれや改正履歴との対応で canonical identifier として扱いにくい。
一方、e-Gov API の取得層は `lawId` と `law_revision_id` を返し、M1 の viewer route も `/laws/:lawId` を前提に実装している。

## Decision

法令トップと条文単位 URL の canonical identifier は e-Gov の `lawId` とする。
法令番号、正式名称、略称は検索や参照解決の入力として扱い、canonical URL には直接使わない。

改正時点を固定する URL が必要になった場合は、e-Gov の `law_revision_id` を `/laws/:lawId/:revisionId` で扱う。

## Consequences

- e-Gov API の `law_data/:lawId` に直接接続できるため、viewer route と取得層の境界が単純になる。
- ときどき六法連携や共有リンクでは `lawId` を安定キーとして渡せる。
- ユーザーが入力する `民法`、`民`、`明治二十九年法律第八十九号` などは、検索・略称辞書・参照解決で `lawId` に解決してから遷移する。
- e-Gov 側の ID 契約に依存するため、将来 e-Gov API の ID 仕様が変わる場合は migration か alias table が必要になる。
