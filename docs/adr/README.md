# Architecture Decision Records

このディレクトリには、すらすら六法の設計判断を Architecture Decision Record として保存する。

## 目的

ADR は、後から読み返したときに「なぜその設計にしたのか」を説明するための記録である。プロダクト仕様の全体像は [../design-doc.md](../design-doc.md) を正とし、ADR は戻しにくい判断や将来の実装に影響する判断を補足する。

## 記録する判断

- canonical law ID の選択。
- e-Gov API への接続方式。
- IndexedDB schema の大きな変更。
- PWA キャッシュ戦略。
- OCR engine の選定。
- ときどき六法との URL / export / sync 契約。
- AI 機能を導入する場合の安全設計。

## 記録しない判断

- 小さな UI 文言変更。
- 一時的な実装メモ。
- Issue や PR の説明で十分に追える局所的な変更。
- lint / format 設定の単なる追従。

## ファイル名

```text
YYYY-MM-DD-short-title.md
```

例:

```text
2026-07-05-canonical-law-id.md
```

## テンプレート

```markdown
# Title

Date: YYYY-MM-DD

## Status

Proposed | Accepted | Superseded

## Context

判断が必要になった背景を書く。

## Decision

採用した方針を書く。

## Consequences

良い影響、制約、後続作業への影響を書く。
```

## Current Records

- [2026-07-05: e-Gov Law ID を canonical URL に使う](2026-07-05-egov-law-id-canonical-url.md)
- [2026-07-06: IndexedDB schema version 1 を定義する](2026-07-06-indexeddb-storage-version-1.md)
