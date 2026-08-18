# 条文のハイライト機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 法令ビューアで条文のテキスト範囲を 4 色から選んで着色し、永続化して再表示できるようにする。

**Architecture:** CSS Custom Highlight API で DOM を分割せずに着色する。位置は `LawNode.plainText` を正規空間とする引用文アンカー（quote + prefix + suffix）で保存し、表示文字列との差はテキストアラインメントで吸収する。判断ロジックはすべて DOM 非依存の純関数に切り出し、ブラウザ API に触る層を薄く保つ。

**Tech Stack:** React 19 / TypeScript 6 / Vite 8 / Tailwind CSS 4 / idb (IndexedDB) / Vitest + Testing Library + jsdom / fake-indexeddb

**設計ドキュメント:** [docs/superpowers/specs/2026-08-17-article-highlight-design.md](../specs/2026-08-17-article-highlight-design.md)

**Issue:** [#188](https://github.com/SlashNephy/surasura-roppou/issues/188)

## Global Constraints

- リポジトリは**公開**である。コメント・コミットメッセージ・PR に非公開情報を含めない。
- ブランチは `feat/issue-188-article-highlight`（作成済み）。
- コード内コメントは日本語。ログ・エラーメッセージは英語。
- コミットメッセージは Conventional Commits。末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` を付ける。
- **コミットは `git commit --no-verify` を使う。** このリポジトリの pre-commit フックは `.git/info/exclude` の汚染により `package.json` / `pnpm-lock.yaml` / `.npmrc` を「.gitignore に一致する追跡ファイル」と誤検知して中断する。フックの案内に従って untrack してはならない。
- **テストは必ず `--dir src` を付けて実行する。** 付けないと `.claude/worktrees/` 配下の別ワークツリーのテストまで拾う。
  - 単体: `pnpm exec vitest run --dir src <ファイル名の一部>`
  - 全体: `pnpm exec vitest run --dir src`
- 検証ゲートは 4 つすべてを通す: `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `pnpm exec vitest run --dir src`
- lint の指摘を `eslint-disable` や設定変更で回避しない。解消できないときはユーザーに方針を確認する。
- テストは振る舞いを検証する。ソースコードを走査するテストや、定数をそのコピーと比較するだけのテストを書かない。
- `surasuraDatabaseVersion` は **3 のまま**。繰り上げてはならない。
- ハイライト色は 4 色: `cyan` / `orange` / `pink` / `yellow`。
- 色の値（ライト / ダーク）:
  - yellow `#fde68a` / `#725f14`
  - orange `#fb923c` / `#5e2b0c`
  - pink `#f9a8d4` / `#7d2b57`
  - cyan `#67e8f9` / `#125a68`

## ファイル構成

### 新規作成

| ファイル                                    | 責務                                                |
| ------------------------------------------- | --------------------------------------------------- |
| `src/core/domain/annotation.ts`             | 注釈レコードの正規化（旧形式の吸収）                |
| `src/core/viewer/text-alignment.ts`         | 近似した 2 文字列の文字単位対応。オフセット相互変換 |
| `src/core/viewer/text-anchor.ts`            | 引用文アンカーの生成と再解決、対象ノードの解決      |
| `src/core/viewer/highlight-merge.ts`        | `plainText` 空間の範囲集合の正規化（交差解決）      |
| `src/core/viewer/highlight-support.ts`      | 機能検出                                            |
| `src/core/viewer/caret-position.ts`         | 座標 → 文字位置のブラウザ差異吸収                   |
| `src/core/viewer/selection-range.ts`        | DOM `Range` → ノード内テキスト範囲の抽出とクランプ  |
| `src/core/viewer/highlight-registry.ts`     | `CSS.highlights` への登録アダプタ                   |
| `src/core/viewer/HighlightColorPopover.tsx` | 色選択ポップアップ（提示専用）                      |
| `src/app/use-highlight-painting.ts`         | レンダー後に Range を再構築して登録する hook        |
| `src/app/use-article-highlights.ts`         | ハイライトの読み込み・保存・削除                    |

### 変更

| ファイル                                        | 変更内容                                                     |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `src/core/domain/models.ts`                     | `HighlightColor` / `TextQuoteAnchor` 追加、`Annotation` 拡張 |
| `src/core/domain/index.ts`                      | re-export                                                    |
| `src/core/storage/repository.ts`                | `deleteAnnotation` 追加、`listAnnotations` に正規化を適用    |
| `src/test/fixtures/storage.ts`                  | in-memory 実装に `deleteAnnotation` 追加                     |
| `src/core/viewer/LawNodeList.tsx`               | 本文要素に `data-law-node-id` を付与                         |
| `src/core/viewer/index.ts`                      | re-export                                                    |
| `src/app/law-viewer-page.tsx`                   | 配線                                                         |
| `src/index.css`                                 | `--highlight-*` トークンと `::highlight()` 規則              |
| `docs/schemas/saved-data-export-v2.schema.json` | `$defs.annotation` の更新                                    |

---

## Task 1: 実機検証スパイク

設計で「実装前に実機検証が必要」とした 3 項目を確定させる。コードは残さず、結果を spec に追記する。

**Files:**

- Create: スクラッチディレクトリ配下の `highlight-spike.html`（リポジトリには置かない）
- Modify: `docs/superpowers/specs/2026-08-17-article-highlight-design.md`

**Interfaces:**

- Consumes: なし
- Produces: 後続タスクが使う CSS の書き方（`var()` 可否）と `caret-position.ts` の分岐方針

**実装済み。** 検証結果は `docs/superpowers/specs/2026-08-17-article-highlight-design.md`
の「実機検証結果（Task 1）」節に記録済み（検証日 2026-08-18、Chromium 151 / headless）。
要点: `::highlight()` 内の `var()` は解決される。`caretPositionFromPoint` /
`caretRangeFromPoint` は検証環境では両方とも存在する（Safari 実機は未検証のまま宿題として
残っている）。`forced-colors: active` では author 指定色が `Mark`/`MarkText` へ強制される
（色の区別は失われるがハイライトの存在は保たれる）。以下は実施したステップの記録。

- [x] **Step 1: 検証用 HTML をスクラッチディレクトリに作る**

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  :root {
    --highlight-yellow: #fde68a;
  }
  #out {
    font-family: monospace;
    white-space: pre-wrap;
  }
  ::highlight(spike-var) {
    background-color: var(--highlight-yellow);
  }
  ::highlight(spike-literal) {
    background-color: #67e8f9;
  }
  @media (forced-colors: active) {
    ::highlight(spike-var) {
      background-color: Mark;
      color: MarkText;
    }
  }
</style>
<p id="a">第三条 私権は、公共の福祉に適合しなければならない。</p>
<p id="b">第四条 権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。</p>
<div id="out"></div>
<script>
  const log = (m) => (document.getElementById("out").textContent += m + "\n");
  const mk = (id, s, e) => {
    const r = new Range();
    const t = document.getElementById(id).firstChild;
    r.setStart(t, s);
    r.setEnd(t, e);
    return r;
  };
  CSS.highlights.set("spike-var", new Highlight(mk("a", 0, 8)));
  CSS.highlights.set("spike-literal", new Highlight(mk("b", 0, 8)));
  log("CSS.highlights: " + ("highlights" in CSS));
  log("caretPositionFromPoint: " + ("caretPositionFromPoint" in document));
  log("caretRangeFromPoint: " + ("caretRangeFromPoint" in document));
  const rect = mk("a", 0, 8).getBoundingClientRect();
  const pos = document.caretPositionFromPoint?.(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
  );
  log("caret hit offset: " + (pos ? pos.offset : "n/a"));
</script>
```

- [x] **Step 2: ブラウザで開いて 3 項目を確認する**

`playwright-cli` で開き、次を確認してスクリーンショットを撮る。

1. 1 行目（`spike-var`）に黄色が付いているか → 付いていれば `::highlight()` 内で `var()` が使える
2. 2 行目（`spike-literal`）に水色が付いているか → 描画そのものの動作確認
3. `#out` の `caretPositionFromPoint` / `caretRangeFromPoint` の真偽値と、`caret hit offset` が数値になるか

強制カラーモードは `page.emulateMedia({ forcedColors: "active" })` で確認する。`playwright-cli` から指定できなければ「未検証」として記録し、`@media (forced-colors: active)` のブロックは設計どおり入れておく。

- [x] **Step 3: 結果を spec に追記する**

`docs/superpowers/specs/2026-08-17-article-highlight-design.md` の「実装前に実機検証が必要な項目」節を、確認結果に置き換える。各項目に「検証日 / 検証環境 / 結果 / 設計への反映」を書く。

- [x] **Step 4: コミット**

```bash
git add docs/superpowers/specs/2026-08-17-article-highlight-design.md
git commit --no-verify -m "docs: ハイライト機能のブラウザ API 検証結果を記録する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: ドメイン型の拡張とエクスポートスキーマ更新

**Files:**

- Modify: `src/core/domain/models.ts`
- Modify: `src/core/domain/index.ts`
- Create: `src/core/domain/annotation.ts`
- Create: `src/core/domain/annotation.test.ts`
- Modify: `docs/schemas/saved-data-export-v2.schema.json`
- Modify: `src/core/storage/import-data.test.ts`

**Interfaces:**

- Consumes: `LawReferenceTarget`, `ISODateString`（既存）
- Produces:
  - `type HighlightColor = "cyan" | "orange" | "pink" | "yellow"`
  - `const highlightColors: readonly HighlightColor[]`
  - `interface TextQuoteAnchor { target: LawReferenceTarget; quote: string; prefix: string; suffix: string }`
  - `interface Annotation { id; target; anchors: TextQuoteAnchor[]; color?: HighlightColor; note?: string; tags: string[]; createdAt; updatedAt }`
  - `normalizeAnnotation(record: unknown): Annotation | undefined`

**実装済み。** 以下の参照実装は出荷コード（`src/core/domain/models.ts`,
`src/core/domain/annotation.ts`, `src/core/domain/index.ts`,
`docs/schemas/saved-data-export-v2.schema.json`）と一致していることを確認済み。差分は無い。

- [x] **Step 1: 正規化関数の失敗するテストを書く**

`src/core/domain/annotation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { normalizeAnnotation } from "./annotation";

const target = { lawId: "322AC0000000125", article: "1", path: "Article:1" };

describe("normalizeAnnotation", () => {
  it("anchors を持つレコードはそのまま通す", () => {
    const record = {
      id: "a1",
      target,
      anchors: [{ target, quote: "私権", prefix: "第一条 ", suffix: "は、" }],
      color: "yellow",
      tags: [],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };

    expect(normalizeAnnotation(record)).toEqual(record);
  });

  it("旧形式の targetText を 1 件の anchor へ変換する", () => {
    const record = {
      id: "a2",
      target,
      targetText: "私権",
      prefixText: "第一条 ",
      suffixText: "は、",
      note: "メモ",
      tags: ["t"],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };

    expect(normalizeAnnotation(record)).toEqual({
      id: "a2",
      target,
      anchors: [{ target, quote: "私権", prefix: "第一条 ", suffix: "は、" }],
      note: "メモ",
      tags: ["t"],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    });
  });

  it("prefixText / suffixText が欠けていても空文字で補う", () => {
    const record = {
      id: "a3",
      target,
      targetText: "私権",
      note: "",
      tags: [],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };

    expect(normalizeAnnotation(record)?.anchors).toEqual([
      { target, quote: "私権", prefix: "", suffix: "" },
    ]);
  });

  it("anchors も targetText も無ければ anchors を空配列にする", () => {
    const record = {
      id: "a4",
      target,
      note: "条文全体へのメモ",
      tags: [],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };

    expect(normalizeAnnotation(record)?.anchors).toEqual([]);
  });

  it("未知の色は落とす", () => {
    const record = {
      id: "a5",
      target,
      anchors: [],
      color: "chartreuse",
      tags: [],
      createdAt: "2026-08-17T00:00:00.000Z",
      updatedAt: "2026-08-17T00:00:00.000Z",
    };

    expect(normalizeAnnotation(record)?.color).toBeUndefined();
  });

  it("id や target を欠くレコードは undefined を返す", () => {
    expect(normalizeAnnotation({ target, tags: [] })).toBeUndefined();
    expect(normalizeAnnotation(undefined)).toBeUndefined();
  });
});
```

- [x] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src annotation.test`
Expected: FAIL（`./annotation` が解決できない）

- [x] **Step 3: 型を追加する**

`src/core/domain/models.ts` の `Annotation` を置き換える。

```ts
export type HighlightColor = "cyan" | "orange" | "pink" | "yellow";

// ポップアップに並ぶ順。輝度の高い順に並べ、両テーマで同じ順序を保つ。
export const highlightColors: readonly HighlightColor[] = ["yellow", "cyan", "pink", "orange"];

// 1つのテキスト範囲。W3C Web Annotation の TextQuoteSelector 相当。
// 位置を文字オフセットではなく引用文と前後文脈で表すので、条文が改正で伸縮しても再探索できる。
export interface TextQuoteAnchor {
  target: LawReferenceTarget;
  quote: string;
  prefix: string;
  suffix: string;
}

export interface Annotation {
  id: string;
  target: LawReferenceTarget;
  // 1回のユーザー選択の断片。v1 は必ず長さ 1。複数ノードにまたがる選択で伸びる。
  anchors: TextQuoteAnchor[];
  // 未定義なら色なしの純粋な注釈。ハイライトとしては描画しない。
  color?: HighlightColor;
  note?: string;
  tags: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
```

- [x] **Step 4: 正規化関数を実装する**

`src/core/domain/annotation.ts`:

```ts
import type { Annotation, HighlightColor, TextQuoteAnchor } from "./models";
import { highlightColors } from "./models";
import type { LawReferenceTarget } from "./references";

// v2 エクスポート由来のレコードは anchors を持たない。読み出し境界で吸収する。
interface LegacyAnnotationFields {
  targetText?: unknown;
  prefixText?: unknown;
  suffixText?: unknown;
}

const isHighlightColor = (value: unknown): value is HighlightColor =>
  typeof value === "string" && (highlightColors as readonly string[]).includes(value);

const isTarget = (value: unknown): value is LawReferenceTarget =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { lawId?: unknown }).lawId === "string";

const isAnchor = (value: unknown): value is TextQuoteAnchor =>
  typeof value === "object" &&
  value !== null &&
  isTarget((value as { target?: unknown }).target) &&
  typeof (value as { quote?: unknown }).quote === "string" &&
  typeof (value as { prefix?: unknown }).prefix === "string" &&
  typeof (value as { suffix?: unknown }).suffix === "string";

const toAnchors = (
  record: { anchors?: unknown } & LegacyAnnotationFields,
  target: LawReferenceTarget,
): TextQuoteAnchor[] => {
  if (Array.isArray(record.anchors)) {
    return record.anchors.filter(isAnchor);
  }

  if (typeof record.targetText !== "string" || record.targetText === "") {
    return [];
  }

  return [
    {
      target,
      quote: record.targetText,
      prefix: typeof record.prefixText === "string" ? record.prefixText : "",
      suffix: typeof record.suffixText === "string" ? record.suffixText : "",
    },
  ];
};

// 壊れたレコードは undefined を返して呼び出し側で捨てる。例外にすると
// 1件の破損で法令全体のハイライトが読めなくなるため、可用性を優先する。
export const normalizeAnnotation = (record: unknown): Annotation | undefined => {
  if (typeof record !== "object" || record === null) {
    return undefined;
  }

  const candidate = record as Record<string, unknown> & LegacyAnnotationFields;

  if (typeof candidate.id !== "string" || !isTarget(candidate.target)) {
    return undefined;
  }

  const color = isHighlightColor(candidate.color) ? candidate.color : undefined;

  return {
    id: candidate.id,
    target: candidate.target,
    anchors: toAnchors(candidate, candidate.target),
    ...(color === undefined ? {} : { color }),
    ...(typeof candidate.note === "string" ? { note: candidate.note } : {}),
    tags: Array.isArray(candidate.tags)
      ? candidate.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : "",
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
  };
};
```

- [x] **Step 5: re-export する**

`src/core/domain/index.ts` の型 export に `HighlightColor` と `TextQuoteAnchor` を追加し、値 export に次を足す。

```ts
export { highlightColors } from "./models";
export { normalizeAnnotation } from "./annotation";
```

- [x] **Step 6: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src annotation.test`
Expected: PASS（6 tests）

- [x] **Step 7: エクスポートスキーマを更新する**

`docs/schemas/saved-data-export-v2.schema.json` の `$defs.annotation` を次のようにする。`required` から `note` を外し、`anchors` と `color` を追加する。`anchors` は `required` に入れない（旧エクスポートが通らなくなるため）。`targetText` / `prefixText` / `suffixText` は残す。

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "target", "tags", "createdAt", "updatedAt"],
  "properties": {
    "id": { "type": "string" },
    "target": { "$ref": "#/$defs/target" },
    "anchors": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["target", "quote", "prefix", "suffix"],
        "properties": {
          "target": { "$ref": "#/$defs/target" },
          "quote": { "type": "string" },
          "prefix": { "type": "string" },
          "suffix": { "type": "string" }
        }
      }
    },
    "color": { "type": "string", "enum": ["cyan", "orange", "pink", "yellow"] },
    "targetText": { "type": "string" },
    "prefixText": { "type": "string" },
    "suffixText": { "type": "string" },
    "note": { "type": "string" },
    "tags": { "type": "array", "items": { "type": "string" } },
    "createdAt": { "type": "string" },
    "updatedAt": { "type": "string" }
  }
}
```

- [x] **Step 8: 後方互換のテストを追加する**

`src/core/storage/import-data.test.ts` に追加する。既存ファイルの import 文と、有効なエクスポートを組み立てるヘルパーの名前を先に読んで合わせること（下記の `minimalExport` と `parseSavedDataExport` は既存の名前に置き換える）。

```ts
it("note と anchors を持たない v2 形式の annotation を受け入れる", () => {
  const data = {
    ...minimalExport,
    annotations: [
      {
        id: "legacy-1",
        target: { lawId: "322AC0000000125", article: "1" },
        targetText: "私権",
        prefixText: "",
        suffixText: "",
        note: "旧メモ",
        tags: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
  };

  expect(parseSavedDataExport(JSON.stringify(data))).toMatchObject({ kind: "ok" });
});

it("color と anchors を持つ新形式の annotation を受け入れる", () => {
  const target = { lawId: "322AC0000000125", article: "1", path: "Article:1" };
  const data = {
    ...minimalExport,
    annotations: [
      {
        id: "highlight-1",
        target,
        anchors: [{ target, quote: "私権", prefix: "", suffix: "は、" }],
        color: "yellow",
        tags: [],
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
      },
    ],
  };

  expect(parseSavedDataExport(JSON.stringify(data))).toMatchObject({ kind: "ok" });
});
```

- [x] **Step 9: 検証ゲートを通す**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm exec vitest run --dir src
```

Expected: すべて成功。`Annotation.note` を必須前提にしていた箇所があれば型エラーになるので修正する。

- [x] **Step 10: コミット**

```bash
git add src/core/domain docs/schemas/saved-data-export-v2.schema.json src/core/storage/import-data.test.ts
git commit --no-verify -m "feat: Annotation にハイライト色と引用文アンカーを追加する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: テキストアラインメント

**Files:**

- Create: `src/core/viewer/text-alignment.ts`
- Create: `src/core/viewer/text-alignment.test.ts`

**Interfaces:**

- Consumes: なし
- Produces:
  - `commonPrefixLength(a: string, b: string): number`
  - `commonSuffixLength(a: string, b: string): number`
  - `interface AlignmentSegment { sourceStart: number; displayStart: number; length: number }`
  - `interface TextAlignment { segments: AlignmentSegment[]; sourceLength: number; displayLength: number }`
  - `alignTexts(source: string, display: string): TextAlignment`
  - `toSourceOffset(alignment: TextAlignment, displayOffset: number, bias: "end" | "start"): number | undefined`
  - `toDisplayRange(alignment: TextAlignment, sourceStart: number, sourceEnd: number): { start: number; end: number } | undefined`

**実装済み。** 実装中にユーザー裁定で 2 点、設計が変わった。以下は概要のみ。実際の
API・実装は `src/core/viewer/text-alignment.ts` を、テストは
`src/core/viewer/text-alignment.test.ts`（16 tests）を参照すること。

- `toSourceOffset` は `segments` が空（source と display に共通文字が皆無、または
  文字数の積が `maxLcsCells` を超えて中間の LCS 計算を省略した）のとき `undefined` を
  返す。呼び出し側は戻り値の `undefined` だけを見ればよく、
  `alignment.segments.length === 0` を自分で判別する必要はない。
  また、最後の一致区間より後ろの隙間は「仮想区間 `(sourceLength, displayLength)`」と
  みなし、`bias: "end"` のときは中間の隙間と同じ規約で `sourceLength` へ寄せる
  （`toDisplayRange` が末尾の置換を `displayLength` まで広げるのと表裏で、往復しても
  置換語が落ちない）。
- `toDisplayRange` は置換区間をまたぐ範囲を「置換区間全体を display 側で覆うように」
  広げる。実装は始端用の `toDisplayStart`／終端用の `toDisplayEnd` を内部ヘルパーとして
  分離しており、始端は手前の区間の display 末尾まで、終端は次の区間の display 先頭
  （末尾の置換なら display 末尾）まで広げる。

- [x] **Step 1: 失敗するテストを書く**

`src/core/viewer/text-alignment.test.ts` に `alignTexts` / `toSourceOffset` /
`toDisplayRange` のテーブルテストを書いた。

- [x] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src text-alignment`
Result: FAIL（`./text-alignment` が解決できない）

- [x] **Step 3: 実装する**

`src/core/viewer/text-alignment.ts` に `commonPrefixLength` / `commonSuffixLength` /
`alignTexts` / `toSourceOffset` / `toDisplayRange` を実装した。共通の接頭辞・接尾辞を
剥がし、中間部分を LCS（`maxLcsCells` で計算量に上限）でアラインメントする方式は設計
どおり。

- [x] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src text-alignment`
Result: PASS（16 tests）

- [x] **Step 5: コミット**

```bash
git add src/core/viewer/text-alignment.ts src/core/viewer/text-alignment.test.ts
git commit --no-verify -m "feat: 表示文字列と plainText を対応づけるアラインメントを追加する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: 引用文アンカー

**Files:**

- Create: `src/core/viewer/text-anchor.ts`
- Create: `src/core/viewer/text-anchor.test.ts`

**Interfaces:**

- Consumes: `commonPrefixLength` / `commonSuffixLength`（Task 3）、`TextQuoteAnchor` / `LawNode` / `LawReferenceTarget`（Task 2 と既存）
- Produces:
  - `createTextQuoteAnchor(plainText: string, start: number, end: number): { quote: string; prefix: string; suffix: string }`
  - `resolveTextQuoteAnchor(plainText: string, anchor: TextQuoteAnchor): { start: number; end: number } | undefined`
  - `findAnchorNode<T extends Pick<LawNode, "id" | "path" | "type">>(nodes: T[], target: LawReferenceTarget): T | undefined`

**実装済み。** 実装中にユーザー裁定で 1 点、設計が変わった。以下は概要のみ。実際の
API・実装は `src/core/viewer/text-anchor.ts` を、テストは
`src/core/viewer/text-anchor.test.ts`（13 tests）を参照すること。

- `resolveTextQuoteAnchor` は、引用文の出現が複数箇所あり、かつどの候補も前後の文脈が
  一切一致しない（score 0）ときは `undefined` を返す。改正で周囲の文が入れ替わり
  引用文だけが別の場所に生き残った状態を指し、根拠なく別の出現位置へハイライトを
  復元しないための安全側の判断。一方、出現が 1 箇所だけなら score 0 でも解決する
  （ノード全体が引用文のとき `createTextQuoteAnchor` は prefix/suffix を空文字列に
  するため、正解でも score 0 になるケースがある）。出現が複数かつ正の score で同点
  なら先頭が勝つ。
- 副次的な差分として、`createTextQuoteAnchor` は `start`/`end` を
  `0 <= start <= end <= plainText.length` にクランプしてから `slice` する（負の
  `start` を渡すと `slice` が末尾相対として解釈し `quote` が非対称に壊れるため）。
  `findAnchorNode` は `LawNode` 全体ではなく `id` / `path` / `type` だけを要求する
  ジェネリックにして、テストダブルを軽くしている。

- [x] **Step 1: 失敗するテストを書く**

`src/core/viewer/text-anchor.test.ts` に `createTextQuoteAnchor` / `resolveTextQuoteAnchor`
/ `findAnchorNode` のテストを書いた。

- [x] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src text-anchor`
Result: FAIL（`./text-anchor` が解決できない）

- [x] **Step 3: 実装する**

`src/core/viewer/text-anchor.ts` に上記の裁定を反映して実装した。`createTextQuoteAnchor`
/ `resolveTextQuoteAnchor` / `findAnchorNode` を export する。

- [x] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src text-anchor`
Result: PASS（13 tests）

- [x] **Step 5: コミット**

```bash
git add src/core/viewer/text-anchor.ts src/core/viewer/text-anchor.test.ts
git commit --no-verify -m "feat: 引用文アンカーの生成と再解決を追加する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: 交差の解決

**Files:**

- Create: `src/core/viewer/highlight-merge.ts`
- Create: `src/core/viewer/highlight-merge.test.ts`

**Interfaces:**

- Consumes: `HighlightColor`（Task 2）
- Produces:
  - `interface HighlightRange { annotationId: string; start: number; end: number; color: HighlightColor }`
  - `interface CreatedHighlightRange { start: number; end: number; color: HighlightColor; sourceAnnotationId?: string }`
  - `interface ApplyHighlightResult { created: CreatedHighlightRange[]; updated: HighlightRange[]; deleted: string[] }`
  - `applyHighlight(existing: HighlightRange[], next: { start: number; end: number; color: HighlightColor }): ApplyHighlightResult`

**実装済み。** 実装中にユーザー裁定で 1 点、設計が変わった。以下は概要のみ。実際の
API・実装は `src/core/viewer/highlight-merge.ts` を、テストは
`src/core/viewer/highlight-merge.test.ts`（11 tests）を参照すること。

- `applyHighlight` は `next.start >= next.end`（幅 0 の塗り、クリックのみの選択など）を
  no-op として扱い、`{ created: [], updated: [], deleted: [] }` を返す。幅 0 の注釈は
  不可視かつヒットテスト不能なうえ、trim ループの境界条件（`<=`）に引っかからず永久に
  残ってしまうため。
- 実装の前提として、`existing` は互いに重ならないこと、単一の本文ノード内の範囲
  （`node.plainText` 空間の座標）のみであることを呼び出し側が保証する必要がある
  （コード先頭のコメント参照）。

- [x] **Step 1: 失敗するテーブルテストを書く**

`src/core/viewer/highlight-merge.test.ts` に `applyHighlight` のテーブルテストを書いた。
概要は以下の通り。区間演算はバグが出やすいため、当初のブリーフに無かった境界ケース
（既存と完全に同じ範囲を塗る、同色の吸収が配列の並び順に関わらず連鎖する、幅 0 の塗りは
no-op）をテストに追加してある。

- [x] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src highlight-merge`
Result: FAIL

- [x] **Step 3: 実装する**

`src/core/viewer/highlight-merge.ts` に `applyHighlight` を実装した。同色の吸収
（`absorbSameColor`）は範囲が広がって別の同色に届く限り変化が止まるまで繰り返し、異色との
重なりは削り・分割・全消しのいずれかで解決する。上記の注記どおり、幅 0 の塗りは冒頭で
ガードして no-op にしている。

- [x] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src highlight-merge`
Result: PASS（11 tests）

- [x] **Step 5: コミット**

```bash
git add src/core/viewer/highlight-merge.ts src/core/viewer/highlight-merge.test.ts
git commit --no-verify -m "feat: ハイライトの交差を解決する正規化を追加する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: 機能検出と座標→文字位置

**Files:**

- Create: `src/core/viewer/highlight-support.ts`
- Create: `src/core/viewer/highlight-support.test.ts`
- Create: `src/core/viewer/caret-position.ts`
- Create: `src/core/viewer/caret-position.test.ts`

**Interfaces:**

- Consumes: なし
- Produces:
  - `isHighlightSupported(view?: { CSS?: unknown; Highlight?: unknown; document?: unknown }): boolean`
  - `caretPositionAt(document: Document, x: number, y: number): { node: Node; offset: number } | undefined`

- [x] **Step 1: 失敗するテストを書く**

`src/core/viewer/highlight-support.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { isHighlightSupported } from "./highlight-support";

const supportedView = {
  CSS: { highlights: {} },
  Highlight: function Highlight() {},
  document: { caretPositionFromPoint: () => undefined },
};

describe("isHighlightSupported", () => {
  it("描画とヒットテストが両方揃っていれば true", () => {
    expect(isHighlightSupported(supportedView)).toBe(true);
  });

  it("caretRangeFromPoint だけでも true", () => {
    expect(
      isHighlightSupported({
        ...supportedView,
        document: { caretRangeFromPoint: () => undefined },
      }),
    ).toBe(true);
  });

  it("CSS.highlights が無ければ false", () => {
    expect(isHighlightSupported({ ...supportedView, CSS: {} })).toBe(false);
  });

  it("Highlight コンストラクタが無ければ false", () => {
    expect(isHighlightSupported({ ...supportedView, Highlight: undefined })).toBe(false);
  });

  it("ヒットテスト手段が無ければ false", () => {
    expect(isHighlightSupported({ ...supportedView, document: {} })).toBe(false);
  });
});
```

`src/core/viewer/caret-position.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { caretPositionAt } from "./caret-position";

describe("caretPositionAt", () => {
  const node = { nodeName: "#text" } as unknown as Node;

  it("caretPositionFromPoint があればそれを使う", () => {
    const document = {
      caretPositionFromPoint: () => ({ offsetNode: node, offset: 3 }),
    } as unknown as Document;

    expect(caretPositionAt(document, 10, 20)).toEqual({ node, offset: 3 });
  });

  it("caretPositionFromPoint が無ければ caretRangeFromPoint を使う", () => {
    const document = {
      caretRangeFromPoint: () => ({ startContainer: node, startOffset: 5 }),
    } as unknown as Document;

    expect(caretPositionAt(document, 10, 20)).toEqual({ node, offset: 5 });
  });

  it("どちらも無ければ undefined", () => {
    expect(caretPositionAt({} as unknown as Document, 10, 20)).toBeUndefined();
  });

  it("要素外を指して null が返れば undefined", () => {
    const document = { caretPositionFromPoint: () => null } as unknown as Document;

    expect(caretPositionAt(document, 10, 20)).toBeUndefined();
  });
});
```

- [x] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src "highlight-support|caret-position"`
Expected: FAIL

- [x] **Step 3: 実装する**

`src/core/viewer/highlight-support.ts`:

```ts
interface HighlightCapableView {
  CSS?: unknown;
  Highlight?: unknown;
  document?: unknown;
}

// 描画とヒットテストの両方が揃って初めて機能を出す。
// 片方でも欠けると「色は付くが消せない」状態になり、機能を隠すより悪い。
export const isHighlightSupported = (
  view: HighlightCapableView = globalThis as HighlightCapableView,
): boolean => {
  const css = view.CSS;
  const document = view.document;

  if (typeof css !== "object" || css === null || !("highlights" in css)) {
    return false;
  }

  if (typeof view.Highlight !== "function") {
    return false;
  }

  if (typeof document !== "object" || document === null) {
    return false;
  }

  return "caretPositionFromPoint" in document || "caretRangeFromPoint" in document;
};
```

`src/core/viewer/caret-position.ts`:

```ts
interface CaretPosition {
  node: Node;
  offset: number;
}

interface CaretCapableDocument {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
}

// 座標から文字位置を得る。caretPositionFromPoint が標準だが、
// Safari は長らく caretRangeFromPoint のみだったため両対応にする。
export const caretPositionAt = (
  document: Document,
  x: number,
  y: number,
): CaretPosition | undefined => {
  const capable = document as CaretCapableDocument;

  if (typeof capable.caretPositionFromPoint === "function") {
    const position = capable.caretPositionFromPoint(x, y);

    return position === null || position === undefined
      ? undefined
      : { node: position.offsetNode, offset: position.offset };
  }

  if (typeof capable.caretRangeFromPoint === "function") {
    const range = capable.caretRangeFromPoint(x, y);

    return range === null || range === undefined
      ? undefined
      : { node: range.startContainer, offset: range.startOffset };
  }

  return undefined;
};
```

- [x] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src "highlight-support|caret-position"`
Expected: PASS（9 tests）

- [x] **Step 5: コミット**

```bash
git add src/core/viewer/highlight-support.ts src/core/viewer/highlight-support.test.ts src/core/viewer/caret-position.ts src/core/viewer/caret-position.test.ts
git commit --no-verify -m "feat: ハイライトの機能検出と座標解決を追加する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: repository への削除操作と読み出し正規化

**Files:**

- Modify: `src/core/storage/repository.ts`
- Modify: `src/test/fixtures/storage.ts`
- Modify: `src/core/storage/repository.test.ts`

**Interfaces:**

- Consumes: `normalizeAnnotation`（Task 2）
- Produces: `StorageRepository.deleteAnnotation(annotationId: string): Promise<void>`

- [x] **Step 1: 失敗するテストを書く**

`src/core/storage/repository.test.ts` に追加する。既存の `createDatabaseName` / `fixedNow` / `openedRepositories` / `openedDatabaseNames` を使うこと。

```ts
it("注釈を保存して削除できる", async () => {
  const databaseName = createDatabaseName();
  const repository = createStorageRepository({ databaseName, now: fixedNow });
  openedRepositories.push(repository);
  openedDatabaseNames.push(databaseName);

  const target = { lawId: "322AC0000000125", article: "1", path: "Article:1" };

  await repository.putAnnotation({
    id: "h1",
    target,
    anchors: [{ target, quote: "私権", prefix: "", suffix: "は、" }],
    color: "yellow",
    tags: [],
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  });

  await expect(repository.listAnnotations({ lawId: target.lawId })).resolves.toHaveLength(1);

  await repository.deleteAnnotation("h1");

  await expect(repository.listAnnotations({ lawId: target.lawId })).resolves.toEqual([]);
});

it("存在しない注釈の削除はエラーにしない", async () => {
  const databaseName = createDatabaseName();
  const repository = createStorageRepository({ databaseName, now: fixedNow });
  openedRepositories.push(repository);
  openedDatabaseNames.push(databaseName);

  await expect(repository.deleteAnnotation("missing")).resolves.toBeUndefined();
});
```

- [x] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src repository.test`
Expected: FAIL（`deleteAnnotation is not a function`）

- [x] **Step 3: interface に追加する**

`src/core/storage/repository.ts` の `StorageRepository` で `listAnnotations` の直後に追加する。

```ts
  deleteAnnotation(annotationId: string): Promise<void>;
```

- [x] **Step 4: 実装する**

`listAnnotations` を正規化つきに置き換え、`deleteAnnotation` を足す。`normalizeAnnotation` と型 `Annotation` を `@/core/domain` から import する。

```ts
    async listAnnotations(query = {}) {
      return withDatabase(async (db) => {
        const records =
          query.lawId === undefined
            ? await db.getAll("annotations")
            : await db.getAllFromIndex("annotations", "by-law-id", query.lawId);

        // 旧形式（anchors を持たない v2 由来）を吸収する。壊れた行は捨てて続行する。
        return records
          .map((record) => normalizeAnnotation(stripTargetIndexes(record)))
          .filter((annotation): annotation is Annotation => annotation !== undefined);
      });
    },

    async deleteAnnotation(annotationId) {
      await withDatabase(async (db) => {
        await db.delete("annotations", annotationId);
      });
    },
```

- [x] **Step 5: fixture の in-memory 実装に追加する**

`src/test/fixtures/storage.ts` の `listAnnotations` の隣に追加する。

```ts
      deleteAnnotation(annotationId) {
        annotations = annotations.filter((annotation) => annotation.id !== annotationId);

        return Promise.resolve();
      },
```

- [x] **Step 6: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src repository.test`
Expected: PASS

- [x] **Step 7: 検証ゲートを通してコミット**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm exec vitest run --dir src
git add src/core/storage/repository.ts src/core/storage/repository.test.ts src/test/fixtures/storage.ts
git commit --no-verify -m "feat: 注釈の削除と読み出し正規化を追加する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: 本文要素へのマーキングと選択範囲の抽出

**Files:**

- Modify: `src/core/viewer/LawNodeList.tsx`
- Modify: `src/core/viewer/LawNodeList.test.tsx`
- Create: `src/core/viewer/selection-range.ts`
- Create: `src/core/viewer/selection-range.test.ts`

**Interfaces:**

- Consumes: なし
- Produces:
  - `const lawNodeIdAttribute = "data-law-node-id"`
  - `interface NodeTextRange { lawNodeId: string; start: number; end: number; text: string }`
  - `resolveNodeTextRange(range: Range): NodeTextRange | undefined`
  - `findLawNodeElement(root: ParentNode, lawNodeId: string): HTMLElement | undefined`

**実装済み。** 事前スキャンで「本文要素の子は単一 Text ノードである」という前提が
実データと矛盾すると判明した（条文参照は `<a>` に、ルビ対象語は `<ruby><rt>` に
分割されるため、本文要素の子は複数ノードに割れるのが普通）。ユーザー裁定により、
「要素配下の Text ノードを文書順に走査し、その連結を表示文字列として扱う（`<rt>`
は表示文字列から除外する）」方式に置き換えて実装されている。以下は概要のみ。
実際の API・実装は `src/core/viewer/selection-range.ts` を、テストは
`src/core/viewer/selection-range.test.ts` を参照すること。

- [x] **Step 1: LawNodeList に法令ノード ID を付与する**

`src/core/viewer/LawNodeList.tsx` の本文を描画している 4 箇所に `data-law-node-id={node.id}` を付与済み。

- [x] **Step 2: selection-range を実装する**

`src/core/viewer/selection-range.ts` が次を export する:

- `lawNodeIdAttribute`, `NodeTextRange`
- `collectDisplayTextNodes(owner: Element): Text[]` … 本文要素配下の表示対象 Text ノードを文書順に集める（`<rt>` 配下は除外）
- `displayTextOf(owner: Element): string` … 上記の連結
- `findLawNodeElement(root: ParentNode, lawNodeId: string): HTMLElement | undefined`
- `resolveNodeTextRange(range: Range): NodeTextRange | undefined` … 選択を表示文字列上の範囲へ写す（複数の本文要素にまたがる選択、端点が外側に出る選択の丸め、ルビの読みへ落ちた端点の正規化などを扱う。詳細はソースのコメントを参照）
- `createNodeTextRange(owner: Element, start: number, end: number): Range | undefined` … 表示文字列上の範囲から DOM Range を作る（Task 10 で使う）

- [x] **Step 3: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src "selection-range|LawNodeList"`
Result: PASS

- [x] **Step 4: コミット**

```bash
git add src/core/viewer/LawNodeList.tsx src/core/viewer/LawNodeList.test.tsx src/core/viewer/selection-range.ts src/core/viewer/selection-range.test.ts
git commit --no-verify -m "feat: 本文要素に法令ノード ID を付与し選択範囲を抽出する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: ハイライト登録アダプタと配色

**Files:**

- Create: `src/core/viewer/highlight-registry.ts`
- Create: `src/core/viewer/highlight-registry.test.ts`
- Modify: `src/index.css`

**Interfaces:**

- Consumes: `HighlightColor` / `highlightColors`（Task 2）
- Produces:
  - `const highlightNameByColor: Record<HighlightColor, string>`
  - `interface PaintedRange { annotationId: string; color: HighlightColor; range: Range }`
  - `interface HighlightRegistryLike { set(name: string, highlight: unknown): void; delete(name: string): boolean }`
  - `paintHighlights(registry: HighlightRegistryLike, createHighlight: (ranges: Range[]) => unknown, painted: PaintedRange[]): void`
  - `clearHighlights(registry: HighlightRegistryLike): void`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/viewer/highlight-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  clearHighlights,
  type HighlightRegistryLike,
  highlightNameByColor,
  paintHighlights,
  type PaintedRange,
} from "./highlight-registry";

const createFakeRegistry = () => {
  const entries = new Map<string, Range[]>();
  const deleted: string[] = [];
  const registry: HighlightRegistryLike = {
    set(name, highlight) {
      entries.set(name, highlight as Range[]);
    },
    delete(name) {
      deleted.push(name);

      return entries.delete(name);
    },
  };

  return { registry, entries, deleted };
};

const createHighlight = (ranges: Range[]) => ranges;

const rangeFor = (text: string): Range => {
  const host = document.createElement("p");
  host.textContent = text;
  document.body.append(host);
  const range = document.createRange();
  range.selectNodeContents(host);

  return range;
};

describe("paintHighlights", () => {
  it("色ごとに 1 つの Highlight を登録する", () => {
    const { registry, entries } = createFakeRegistry();
    const painted: PaintedRange[] = [
      { annotationId: "a", color: "yellow", range: rangeFor("あ") },
      { annotationId: "b", color: "yellow", range: rangeFor("い") },
      { annotationId: "c", color: "pink", range: rangeFor("う") },
    ];

    paintHighlights(registry, createHighlight, painted);

    expect(entries.get(highlightNameByColor.yellow)).toHaveLength(2);
    expect(entries.get(highlightNameByColor.pink)).toHaveLength(1);
  });

  it("範囲が無い色は登録を消す", () => {
    const { registry, deleted } = createFakeRegistry();

    paintHighlights(registry, createHighlight, [
      { annotationId: "a", color: "yellow", range: rangeFor("あ") },
    ]);

    expect(deleted).toContain(highlightNameByColor.pink);
    expect(deleted).toContain(highlightNameByColor.cyan);
    expect(deleted).toContain(highlightNameByColor.orange);
    expect(deleted).not.toContain(highlightNameByColor.yellow);
  });
});

describe("clearHighlights", () => {
  it("4 色すべての登録を消す", () => {
    const { registry, deleted } = createFakeRegistry();

    clearHighlights(registry);

    expect(deleted).toHaveLength(4);
    expect(new Set(deleted)).toEqual(new Set(Object.values(highlightNameByColor)));
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src highlight-registry`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/core/viewer/highlight-registry.ts`:

```ts
import type { HighlightColor } from "@/core/domain";
import { highlightColors } from "@/core/domain";

// ::highlight() の登録名。CSS 側の疑似要素セレクタと一致させる。
export const highlightNameByColor: Record<HighlightColor, string> = {
  yellow: "surasura-highlight-yellow",
  cyan: "surasura-highlight-cyan",
  pink: "surasura-highlight-pink",
  orange: "surasura-highlight-orange",
};

export interface PaintedRange {
  annotationId: string;
  color: HighlightColor;
  range: Range;
}

export interface HighlightRegistryLike {
  set(name: string, highlight: unknown): void;
  delete(name: string): boolean;
}

// 色ごとに Highlight を 1 個だけ登録し、そこへ複数の Range を入れる。
// 注釈ごとに登録名を作ると registry が肥大し、CSS も書けなくなる。
export const paintHighlights = (
  registry: HighlightRegistryLike,
  createHighlight: (ranges: Range[]) => unknown,
  painted: PaintedRange[],
): void => {
  for (const color of highlightColors) {
    const ranges = painted.filter((entry) => entry.color === color).map((entry) => entry.range);

    if (ranges.length === 0) {
      registry.delete(highlightNameByColor[color]);
      continue;
    }

    registry.set(highlightNameByColor[color], createHighlight(ranges));
  }
};

export const clearHighlights = (registry: HighlightRegistryLike): void => {
  for (const name of Object.values(highlightNameByColor)) {
    registry.delete(name);
  }
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src highlight-registry`
Expected: PASS（3 tests）

- [ ] **Step 5: CSS を追加する**

`src/index.css` の `:root` ブロック末尾（`--sidebar-ring` の後）に追加する。

```css
--highlight-yellow: #fde68a;
--highlight-cyan: #67e8f9;
--highlight-pink: #f9a8d4;
--highlight-orange: #fb923c;
```

`.dark` ブロック末尾に追加する。

```css
--highlight-yellow: #725f14;
--highlight-cyan: #125a68;
--highlight-pink: #7d2b57;
--highlight-orange: #5e2b0c;
```

ファイル末尾（`button, input, textarea, select` 規則の後）に追加する。**Task 1 で `::highlight()` 内の `var()` が使えないと判明した場合は、`var(--highlight-*)` をライト値のリテラルに置き換え、`.dark ::highlight(...)` ブロックをダーク値のリテラルで別途書く。**

```css
/* 本文の文字色は変えない。地の色だけを変え、フォント設定やテーマと衝突させない。 */
::highlight(surasura-highlight-yellow) {
  background-color: var(--highlight-yellow);
}

::highlight(surasura-highlight-cyan) {
  background-color: var(--highlight-cyan);
}

::highlight(surasura-highlight-pink) {
  background-color: var(--highlight-pink);
}

::highlight(surasura-highlight-orange) {
  background-color: var(--highlight-orange);
}

/* 強制カラーモードでは 4 色をシステム色に集約する。色の区別は失われるが存在は残る。 */
@media (forced-colors: active) {
  ::highlight(surasura-highlight-yellow),
  ::highlight(surasura-highlight-cyan),
  ::highlight(surasura-highlight-pink),
  ::highlight(surasura-highlight-orange) {
    background-color: Mark;
    color: MarkText;
  }
}
```

- [ ] **Step 6: コミット**

```bash
pnpm run format:check || pnpm run format
git add src/core/viewer/highlight-registry.ts src/core/viewer/highlight-registry.test.ts src/index.css
git commit --no-verify -m "feat: ハイライトの登録アダプタと配色を追加する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: 描画 hook

**Files:**

- Create: `src/app/use-highlight-painting.ts`
- Create: `src/app/use-highlight-painting.test.ts`
- Modify: `src/core/viewer/index.ts`

**Interfaces:**

- Consumes: `alignTexts` / `toDisplayRange`（Task 3）、`resolveTextQuoteAnchor` / `findAnchorNode`（Task 4）、`findLawNodeElement`（Task 8）、`paintHighlights` / `clearHighlights` / `PaintedRange` / `HighlightRegistryLike`（Task 9）
- Produces:
  - `buildPaintedRanges(root: ParentNode, nodes: LawNode[], annotations: Annotation[]): PaintedRange[]`
  - `useHighlightPainting(options): PaintedRange[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/app/use-highlight-painting.test.ts`:

```ts
import type { Annotation, LawNode } from "@/core/domain";
import { afterEach, describe, expect, it } from "vitest";

import { buildPaintedRanges } from "./use-highlight-painting";

afterEach(() => {
  document.body.innerHTML = "";
});

const target = { lawId: "L", path: "Article:1/Paragraph:1" };
const lawNodeId = "L:R:Article:1/Paragraph:1";

const nodes = [
  {
    id: lawNodeId,
    path: "Article:1/Paragraph:1",
    plainText: "私権は、公共の福祉に適合しなければならない。",
  },
] as unknown as LawNode[];

const annotation = (id: string, quote: string): Annotation =>
  ({
    id,
    target,
    anchors: [{ target, quote, prefix: "", suffix: "" }],
    color: "yellow",
    tags: [],
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  }) as Annotation;

const mount = (text: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = `<span data-law-node-id="${lawNodeId}">${text}</span>`;
  document.body.append(host);

  return host;
};

describe("buildPaintedRanges", () => {
  it("表示文字列が plainText と同じとき正しい位置に Range を作る", () => {
    const host = mount("私権は、公共の福祉に適合しなければならない。");
    const painted = buildPaintedRanges(host, nodes, [annotation("h1", "公共の福祉")]);

    expect(painted).toHaveLength(1);
    expect(painted[0].range.toString()).toBe("公共の福祉");
    expect(painted[0].annotationId).toBe("h1");
  });

  it("readable 変換で文字数が変わっても正しい位置に Range を作る", () => {
    const readableNodes = [
      { ...nodes[0], plainText: "第三条の規定により、公共の福祉に適合する。" },
    ] as unknown as LawNode[];
    const host = mount("第3条の規定により、公共の福祉に適合する。");
    const painted = buildPaintedRanges(host, readableNodes, [annotation("h1", "公共の福祉")]);

    expect(painted[0].range.toString()).toBe("公共の福祉");
  });

  it("色を持たない注釈は描画しない", () => {
    const host = mount("私権は、公共の福祉に適合しなければならない。");
    const noteOnly = { ...annotation("h1", "公共の福祉"), color: undefined } as Annotation;

    expect(buildPaintedRanges(host, nodes, [noteOnly])).toEqual([]);
  });

  it("引用文が見つからない注釈は描画しない", () => {
    const host = mount("まったく別の条文になった。");

    expect(buildPaintedRanges(host, nodes, [annotation("h1", "公共の福祉")])).toEqual([]);
  });

  it("対応する DOM 要素が無ければ描画しない", () => {
    const host = document.createElement("div");
    document.body.append(host);

    expect(buildPaintedRanges(host, nodes, [annotation("h1", "公共の福祉")])).toEqual([]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src use-highlight-painting`
Expected: FAIL

- [ ] **Step 3: viewer の re-export を足す**

`src/core/viewer/index.ts` に追加する（`HighlightColorPopover` は Task 11 で足す）。

```ts
export { alignTexts, toDisplayRange, toSourceOffset } from "./text-alignment";
export type { TextAlignment } from "./text-alignment";
export { createTextQuoteAnchor, findAnchorNode, resolveTextQuoteAnchor } from "./text-anchor";
export { applyHighlight } from "./highlight-merge";
export type { CreatedHighlightRange, HighlightRange } from "./highlight-merge";
export { isHighlightSupported } from "./highlight-support";
export { caretPositionAt } from "./caret-position";
export {
  collectDisplayTextNodes,
  createNodeTextRange,
  displayTextOf,
  findLawNodeElement,
  lawNodeIdAttribute,
  resolveNodeTextRange,
} from "./selection-range";
export type { NodeTextRange } from "./selection-range";
export { clearHighlights, highlightNameByColor, paintHighlights } from "./highlight-registry";
export type { HighlightRegistryLike, PaintedRange } from "./highlight-registry";
```

- [ ] **Step 4: 実装する**

`src/app/use-highlight-painting.ts`:

```ts
import { type RefObject, useEffect, useMemo } from "react";

import type { Annotation, LawNode } from "@/core/domain";
import {
  alignTexts,
  clearHighlights,
  createNodeTextRange,
  displayTextOf,
  findAnchorNode,
  findLawNodeElement,
  type HighlightRegistryLike,
  type PaintedRange,
  paintHighlights,
  resolveTextQuoteAnchor,
  toDisplayRange,
} from "@/core/viewer";

interface HighlightPaintingOptions {
  containerRef: RefObject<HTMLElement | null>;
  nodes: LawNode[];
  annotations: Annotation[];
  enabled: boolean;
  // テストからフェイクを差し込むための注入点。既定はブラウザの実装。
  registry?: HighlightRegistryLike;
  createHighlight?: (ranges: Range[]) => unknown;
}

// 保存された引用文アンカーを、いま描画されている DOM 上の Range に変換する。
// 表示文字列と plainText の差はアラインメントで吸収する。
//
// 本文要素の子は単一の Text ノードとは限らない（条文参照は <a>、ルビ対象語は
// <ruby><rt> に分割される）ため、`element.firstChild` を Text ノード扱いしては
// いけない。表示文字列の取得は `displayTextOf(element)`、表示文字列上の範囲から
// DOM Range を作るのは `createNodeTextRange(element, start, end)` を使う
// （どちらも `src/core/viewer/selection-range.ts` が複数ノードを文書順に走査して
// 吸収してくれる。詳細は同ファイルのコメントを参照）。
export const buildPaintedRanges = (
  root: ParentNode,
  nodes: LawNode[],
  annotations: Annotation[],
): PaintedRange[] => {
  const painted: PaintedRange[] = [];

  for (const annotation of annotations) {
    const color = annotation.color;

    if (color === undefined) {
      continue;
    }

    for (const anchor of annotation.anchors) {
      const node = findAnchorNode(nodes, anchor.target);

      if (node === undefined) {
        continue;
      }

      const element = findLawNodeElement(root, node.id);

      if (element === undefined) {
        continue;
      }

      const sourceRange = resolveTextQuoteAnchor(node.plainText, anchor);

      if (sourceRange === undefined) {
        continue;
      }

      const displayText = displayTextOf(element);
      const displayRange = toDisplayRange(
        alignTexts(node.plainText, displayText),
        sourceRange.start,
        sourceRange.end,
      );

      if (displayRange === undefined) {
        continue;
      }

      // alignment.segments.length === 0 のときは start=0 / end=displayText.length に
      // 潰れる可能性がある（本文全体が塗られる事故）。Task 12 側で保存を止めるので
      // ここでは createNodeTextRange の失敗（undefined）だけ弾けばよい。
      const range = createNodeTextRange(element, displayRange.start, displayRange.end);

      if (range === undefined) {
        continue;
      }

      painted.push({ annotationId: annotation.id, color, range });
    }
  }

  return painted;
};

const browserRegistry = (): HighlightRegistryLike | undefined => {
  const css = (globalThis as { CSS?: { highlights?: unknown } }).CSS;

  return css?.highlights as HighlightRegistryLike | undefined;
};

const browserHighlight = (ranges: Range[]): unknown =>
  new (globalThis as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight(
    ...ranges,
  );

export const useHighlightPainting = ({
  annotations,
  containerRef,
  createHighlight,
  enabled,
  nodes,
  registry,
}: HighlightPaintingOptions): PaintedRange[] => {
  // React が再レンダーで Text ノードを差し替えると、古い Range は例外も出さずに
  // 描画されなくなる。差分更新はせず、依存が変わるたび全部作り直す。
  const painted = useMemo(() => {
    const root = containerRef.current;

    if (!enabled || root === null) {
      return [];
    }

    return buildPaintedRanges(root, nodes, annotations);
  }, [annotations, containerRef, enabled, nodes]);

  useEffect(() => {
    const activeRegistry = registry ?? browserRegistry();

    if (activeRegistry === undefined) {
      return;
    }

    if (!enabled) {
      clearHighlights(activeRegistry);

      return;
    }

    paintHighlights(activeRegistry, createHighlight ?? browserHighlight, painted);

    return () => {
      clearHighlights(activeRegistry);
    };
  }, [createHighlight, enabled, painted, registry]);

  return painted;
};
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src use-highlight-painting`
Expected: PASS（5 tests）

- [ ] **Step 6: コミット**

```bash
git add src/app/use-highlight-painting.ts src/app/use-highlight-painting.test.ts src/core/viewer/index.ts
git commit --no-verify -m "feat: 保存済みハイライトを DOM 上に描画する hook を追加する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 11: 色選択ポップアップ

**Files:**

- Create: `src/core/viewer/HighlightColorPopover.tsx`
- Create: `src/core/viewer/HighlightColorPopover.test.tsx`
- Modify: `src/core/viewer/index.ts`

**Interfaces:**

- Consumes: `HighlightColor` / `highlightColors`（Task 2）、`cn`（既存 `@/shared/utils/cn`）
- Produces: `HighlightColorPopover({ anchorRect, selectedColor?, onSelect, onDelete?, onDismiss })`
  - `anchorRect: { top: number; bottom: number; left: number; width: number }`
  - `onSelect: (color: HighlightColor) => void`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/viewer/HighlightColorPopover.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HighlightColorPopover } from "./HighlightColorPopover";

const anchorRect = { top: 100, bottom: 120, left: 50, width: 80 };

describe("HighlightColorPopover", () => {
  it("4 色すべてを名前付きのボタンとして出す", () => {
    render(
      <HighlightColorPopover anchorRect={anchorRect} onDismiss={vi.fn()} onSelect={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "黄でハイライト" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "水色でハイライト" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ピンクでハイライト" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "オレンジでハイライト" })).toBeInTheDocument();
  });

  it("色を押すと onSelect にその色が渡る", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <HighlightColorPopover anchorRect={anchorRect} onDismiss={vi.fn()} onSelect={onSelect} />,
    );

    await user.click(screen.getByRole("button", { name: "ピンクでハイライト" }));

    expect(onSelect).toHaveBeenCalledWith("pink");
  });

  it("現在の色は押された状態として示す", () => {
    render(
      <HighlightColorPopover
        anchorRect={anchorRect}
        onDismiss={vi.fn()}
        onSelect={vi.fn()}
        selectedColor="cyan"
      />,
    );

    expect(screen.getByRole("button", { name: "水色でハイライト" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "黄でハイライト" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("onDelete があるときだけ削除ボタンを出す", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <HighlightColorPopover anchorRect={anchorRect} onDismiss={vi.fn()} onSelect={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "ハイライトを削除" })).not.toBeInTheDocument();

    rerender(
      <HighlightColorPopover
        anchorRect={anchorRect}
        onDelete={onDelete}
        onDismiss={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ハイライトを削除" }));

    expect(onDelete).toHaveBeenCalled();
  });

  it("Escape で onDismiss を呼ぶ", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <HighlightColorPopover anchorRect={anchorRect} onDismiss={onDismiss} onSelect={vi.fn()} />,
    );

    await user.keyboard("{Escape}");

    expect(onDismiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src HighlightColorPopover`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/core/viewer/HighlightColorPopover.tsx`:

```tsx
import { useEffect, useRef } from "react";

import type { HighlightColor } from "@/core/domain";
import { highlightColors } from "@/core/domain";
import { cn } from "@/shared/utils/cn";

// 色見本は色だけで意味を伝えない。読み上げ用の名前を必ず持たせる。
const labelByColor: Record<HighlightColor, string> = {
  yellow: "黄",
  cyan: "水色",
  pink: "ピンク",
  orange: "オレンジ",
};

const swatchClassByColor: Record<HighlightColor, string> = {
  yellow: "bg-[var(--highlight-yellow)]",
  cyan: "bg-[var(--highlight-cyan)]",
  pink: "bg-[var(--highlight-pink)]",
  orange: "bg-[var(--highlight-orange)]",
};

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

interface HighlightColorPopoverProps {
  anchorRect: AnchorRect;
  selectedColor?: HighlightColor;
  onSelect: (color: HighlightColor) => void;
  onDelete?: () => void;
  onDismiss: () => void;
}

const popoverHeight = 48;
const popoverGap = 8;

export const HighlightColorPopover = ({
  anchorRect,
  onDelete,
  onDismiss,
  onSelect,
  selectedColor,
}: HighlightColorPopoverProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  useEffect(() => {
    containerRef.current?.querySelector("button")?.focus();
  }, []);

  // 選択範囲の直上に出す。画面上端に近ければ直下へ回り込ませる。
  const showsBelow = anchorRect.top < popoverHeight + popoverGap;
  const top = showsBelow ? anchorRect.bottom + popoverGap : anchorRect.top - popoverHeight;

  return (
    <div
      ref={containerRef}
      aria-label="ハイライトの色"
      className="fixed z-50 flex items-center gap-1 rounded-md border border-border bg-popover p-1 shadow-md"
      role="group"
      style={{ top, left: anchorRect.left + anchorRect.width / 2, transform: "translateX(-50%)" }}
    >
      {highlightColors.map((color) => (
        <button
          key={color}
          aria-label={`${labelByColor[color]}でハイライト`}
          aria-pressed={selectedColor === color}
          className={cn(
            // スウォッチは popover 地色とのコントラストが 3:1 に満たないため枠線で輪郭を出す。
            "size-7 rounded-full border border-input",
            swatchClassByColor[color],
            selectedColor === color && "ring-2 ring-ring ring-offset-1 ring-offset-popover",
          )}
          onClick={() => {
            onSelect(color);
          }}
          type="button"
        />
      ))}
      {onDelete === undefined ? null : (
        <button
          aria-label="ハイライトを削除"
          className="ml-1 rounded-sm px-2 py-1 text-sm text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={onDelete}
          type="button"
        >
          削除
        </button>
      )}
    </div>
  );
};
```

- [ ] **Step 4: re-export する**

`src/core/viewer/index.ts` に追加する。

```ts
export { HighlightColorPopover } from "./HighlightColorPopover";
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src HighlightColorPopover`
Expected: PASS（5 tests）

- [ ] **Step 6: コミット**

```bash
git add src/core/viewer/HighlightColorPopover.tsx src/core/viewer/HighlightColorPopover.test.tsx src/core/viewer/index.ts
git commit --no-verify -m "feat: ハイライトの色選択ポップアップを追加する

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 12: ハイライトの読み書き

**Files:**

- Create: `src/app/use-article-highlights.ts`
- Create: `src/app/use-article-highlights.test.ts`

**Interfaces:**

- Consumes: `applyHighlight` / `createTextQuoteAnchor` / `resolveTextQuoteAnchor` / `HighlightRange`（Task 4, 5）、`generateStorageId` と `StorageRepository`（既存 `@/core/storage`）
- Produces:
  - `buildHighlightMutations(input): { puts: Annotation[]; deletes: string[] }`
  - `useArticleHighlights({ lawId, nodes, repository, enabled }): { annotations; highlight; remove }`

**注意（Task 13 の呼び出し側向け）**: `buildHighlightMutations` の `range` は
`node.plainText` 空間（source 空間）の座標を期待する。DOM 選択（`resolveNodeTextRange`
が返す表示文字列＝display 空間の座標）から渡すときは、呼び出し側が
`alignTexts(node.plainText, displayText)` → `toSourceOffset` で変換すること。
`toSourceOffset` は戻り値の型が `number | undefined` で、`alignTexts` が返す
`segments` が空になる条件（`maxLcsCells` 超過、共通文字が無い）では `undefined` を返す。
呼び出し側は `start` / `end` いずれかが `undefined` を受け取ったら位置が対応づかなかった
とみなし、アンカーを保存しないこと（本文全体を `quote` にしたアンカーを黙って保存する事故を防ぐ）。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/use-article-highlights.test.ts`:

```ts
import type { Annotation, LawNode } from "@/core/domain";
import { describe, expect, it } from "vitest";

import { buildHighlightMutations } from "./use-article-highlights";

const target = { lawId: "L", revisionId: "R", article: "1", path: "Article:1/Paragraph:1" };

const node = {
  id: "L:R:Article:1/Paragraph:1",
  path: "Article:1/Paragraph:1",
  plainText: "私権は、公共の福祉に適合しなければならない。",
} as unknown as LawNode;

const existing = (id: string, quote: string, color: Annotation["color"]): Annotation =>
  ({
    id,
    target,
    anchors: [{ target, quote, prefix: "", suffix: "" }],
    color,
    tags: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }) as Annotation;

const createNextId = () => {
  let count = 0;

  return () => {
    count += 1;

    return `new-${String(count)}`;
  };
};

const baseInput = { node, target, now: "2026-08-17T00:00:00.000Z" };

describe("buildHighlightMutations", () => {
  it("既存が無ければ新しい注釈を 1 件作る", () => {
    const result = buildHighlightMutations({
      ...baseInput,
      nextId: createNextId(),
      annotations: [],
      range: { start: 4, end: 9 },
      color: "yellow",
    });

    expect(result.deletes).toEqual([]);
    expect(result.puts).toHaveLength(1);
    expect(result.puts[0].color).toBe("yellow");
    expect(result.puts[0].anchors[0].quote).toBe("公共の福祉");
  });

  it("同色と重なるときはマージして createdAt を保つ", () => {
    const result = buildHighlightMutations({
      ...baseInput,
      nextId: createNextId(),
      annotations: [existing("old", "公共", "yellow")],
      range: { start: 6, end: 9 },
      color: "yellow",
    });

    expect(result.deletes).toEqual([]);
    expect(result.puts).toHaveLength(1);
    expect(result.puts[0].id).toBe("old");
    expect(result.puts[0].createdAt).toBe("2026-08-01T00:00:00.000Z");
    expect(result.puts[0].updatedAt).toBe("2026-08-17T00:00:00.000Z");
    expect(result.puts[0].anchors[0].quote).toBe("公共の福祉");
  });

  it("異色に完全に覆われた既存は削除される", () => {
    const result = buildHighlightMutations({
      ...baseInput,
      nextId: createNextId(),
      annotations: [existing("old", "公共", "yellow")],
      range: { start: 0, end: 12 },
      color: "pink",
    });

    expect(result.deletes).toEqual(["old"]);
  });

  it("他ノードの注釈は交差判定の対象にしない", () => {
    const otherTarget = { ...target, path: "Article:2/Paragraph:1" };
    const other = {
      ...existing("other", "公共", "yellow"),
      target: otherTarget,
      anchors: [{ target: otherTarget, quote: "公共", prefix: "", suffix: "" }],
    } as Annotation;

    const result = buildHighlightMutations({
      ...baseInput,
      nextId: createNextId(),
      annotations: [other],
      range: { start: 4, end: 9 },
      color: "pink",
    });

    expect(result.deletes).toEqual([]);
    expect(result.puts).toHaveLength(1);
    expect(result.puts[0].id).not.toBe("other");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src use-article-highlights`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/app/use-article-highlights.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

import type { Annotation, HighlightColor, LawNode, LawReferenceTarget } from "@/core/domain";
import type { StorageRepository } from "@/core/storage";
import { generateStorageId } from "@/core/storage";
import {
  applyHighlight,
  createTextQuoteAnchor,
  type HighlightRange,
  resolveTextQuoteAnchor,
} from "@/core/viewer";

interface HighlightMutationInput {
  annotations: Annotation[];
  node: LawNode;
  target: LawReferenceTarget;
  range: { start: number; end: number };
  color: HighlightColor;
  now: string;
  nextId: () => string;
}

interface HighlightMutations {
  puts: Annotation[];
  deletes: string[];
}

// 対象ノードに属し、いまも本文中に解決できる注釈だけを交差判定の対象にする。
const collectNodeRanges = (
  annotations: Annotation[],
  node: LawNode,
): { ranges: HighlightRange[]; byId: Map<string, Annotation> } => {
  const ranges: HighlightRange[] = [];
  const byId = new Map<string, Annotation>();

  for (const annotation of annotations) {
    const color = annotation.color;
    const anchor = annotation.anchors[0];

    if (color === undefined || anchor === undefined || anchor.target.path !== node.path) {
      continue;
    }

    const resolved = resolveTextQuoteAnchor(node.plainText, anchor);

    if (resolved === undefined) {
      continue;
    }

    ranges.push({ annotationId: annotation.id, color, ...resolved });
    byId.set(annotation.id, annotation);
  }

  return { ranges, byId };
};

export const buildHighlightMutations = ({
  annotations,
  color,
  node,
  nextId,
  now,
  range,
  target,
}: HighlightMutationInput): HighlightMutations => {
  const { byId, ranges } = collectNodeRanges(annotations, node);
  const result = applyHighlight(ranges, { ...range, color });
  const anchorTarget: LawReferenceTarget = { ...target, path: node.path };
  const puts: Annotation[] = [];

  for (const updated of result.updated) {
    const source = byId.get(updated.annotationId);

    if (source === undefined) {
      continue;
    }

    puts.push({
      ...source,
      color: updated.color,
      anchors: [
        {
          target: anchorTarget,
          ...createTextQuoteAnchor(node.plainText, updated.start, updated.end),
        },
      ],
      updatedAt: now,
    });
  }

  for (const created of result.created) {
    const source =
      created.sourceAnnotationId === undefined ? undefined : byId.get(created.sourceAnnotationId);

    puts.push({
      id: nextId(),
      target: anchorTarget,
      anchors: [
        {
          target: anchorTarget,
          ...createTextQuoteAnchor(node.plainText, created.start, created.end),
        },
      ],
      color: created.color,
      // 分割で生じた断片は元のメモとタグを引き継ぐ。片方だけ消せる方が自然なため複製する。
      ...(source?.note === undefined ? {} : { note: source.note }),
      tags: source?.tags ?? [],
      createdAt: source?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return { puts, deletes: result.deleted };
};

interface ArticleHighlightsOptions {
  lawId: string;
  nodes: LawNode[];
  repository: StorageRepository;
  enabled: boolean;
}

interface HighlightInput {
  lawNodeId: string;
  range: { start: number; end: number };
  color: HighlightColor;
  target: LawReferenceTarget;
}

export const useArticleHighlights = ({
  enabled,
  lawId,
  nodes,
  repository,
}: ArticleHighlightsOptions) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  useEffect(() => {
    if (!enabled) {
      setAnnotations([]);

      return;
    }

    let cancelled = false;

    void repository
      .listAnnotations({ lawId })
      .then((records) => {
        if (!cancelled) {
          setAnnotations(records.filter((record) => record.color !== undefined));
        }
      })
      .catch(() => {
        // 読み込みに失敗しても本文は読めるようにする。ハイライトだけ諦める。
        if (!cancelled) {
          setAnnotations([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, lawId, repository]);

  const highlight = useCallback(
    async (input: HighlightInput) => {
      const node = nodes.find((candidate) => candidate.id === input.lawNodeId);

      if (node === undefined) {
        return;
      }

      const mutations = buildHighlightMutations({
        annotations,
        node,
        target: input.target,
        range: input.range,
        color: input.color,
        now: new Date().toISOString(),
        nextId: generateStorageId,
      });

      await Promise.all([
        ...mutations.puts.map((annotation) => repository.putAnnotation(annotation)),
        ...mutations.deletes.map((id) => repository.deleteAnnotation(id)),
      ]);

      setAnnotations((current) => {
        const replaced = new Set([
          ...mutations.deletes,
          ...mutations.puts.map((annotation) => annotation.id),
        ]);

        return [...current.filter((annotation) => !replaced.has(annotation.id)), ...mutations.puts];
      });
    },
    [annotations, nodes, repository],
  );

  const remove = useCallback(
    async (annotationId: string) => {
      await repository.deleteAnnotation(annotationId);
      setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));
    },
    [repository],
  );

  return { annotations, highlight, remove };
};
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src use-article-highlights`
Expected: PASS（4 tests）

- [ ] **Step 5: コミット**

```bash
git add src/app/use-article-highlights.ts src/app/use-article-highlights.test.ts
git commit --no-verify -m "feat: ハイライトの保存と削除を組み立てる

Refs #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 13: ビューアへの配線

**Files:**

- Modify: `src/app/law-viewer-page.tsx`
- Modify: `src/app/law-viewer-page.test.tsx`

**Interfaces:**

- Consumes: Task 6, 8, 10, 11, 12 のすべて
- Produces: なし（アプリの最終配線）

- [ ] **Step 1: 失敗するテストを書く**

`src/app/law-viewer-page.test.tsx` に追加する。既存の render ヘルパー（`createMemoryStorageRepository` を注入し `DisplayPreferencesProvider` で包む関数）と、本文が表示されるまで待つ既存の書き方に合わせること。

補助関数はテストファイル内に置く。`createNodeTextRange` を `@/core/viewer` から import すること。

```tsx
// jsdom に無い CSS Custom Highlight API を最小限だけ生やす。
// 実描画は検証できないので、UI が有効になり保存が走ることだけを見る。
const installHighlightApiStub = () => {
  vi.stubGlobal("CSS", { ...globalThis.CSS, highlights: new Map<string, unknown>() });
  vi.stubGlobal(
    "Highlight",
    class {
      ranges: Range[];

      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    },
  );
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: () => null,
  });
};

// 本文要素の子は単一の Text ノードとは限らない（条文参照の <a>、ルビの
// <ruby><rt> で複数ノードに割れる）ため、firstChild を Text ノード扱いしてはいけない。
// `createNodeTextRange`（`@/core/viewer`、実体は selection-range.ts）は複数ノードを
// 文書順に走査して表示文字列上の [start, end) を DOM Range に変換してくれるので、
// テストの選択もそれを使って組み立てる。
const selectTextIn = (element: HTMLElement, start: number, end: number) => {
  const range = createNodeTextRange(element, start, end);

  if (range === undefined) {
    throw new Error("range is required");
  }

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
};
```

`afterEach` に `vi.unstubAllGlobals()` を足す。テスト本体。

```tsx
it("CSS Custom Highlight API 非対応ならハイライトを保存しない", async () => {
  const repository = createMemoryStorageRepository({/* 既存テストと同じ引数 */});
  renderLawViewer({ repository });

  const body = await screen.findByText(/私権は/);
  selectTextIn(body, 0, 2);

  await waitFor(() => {
    expect(screen.queryByRole("group", { name: "ハイライトの色" })).not.toBeInTheDocument();
  });

  expect(repository.getAnnotations()).toEqual([]);
});

it("対応ブラウザでは選択して色を選ぶと注釈が保存される", async () => {
  installHighlightApiStub();

  const repository = createMemoryStorageRepository({/* 既存テストと同じ引数 */});
  const user = userEvent.setup();
  renderLawViewer({ repository });

  const body = await screen.findByText(/私権は/);
  selectTextIn(body, 0, 2);

  await user.click(await screen.findByRole("button", { name: "黄でハイライト" }));

  await waitFor(() => {
    expect(repository.getAnnotations()).toHaveLength(1);
  });

  expect(repository.getAnnotations()[0]).toMatchObject({ color: "yellow" });
  expect(repository.getAnnotations()[0].anchors[0].quote).toBe("私権");
});
```

`screen.findByText(/私権は/)` が本文 span（`data-law-node-id` を持つ要素）を返すことを確認する。返らない場合は `container.querySelector("[data-law-node-id]")` で取り直す。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm exec vitest run --dir src law-viewer-page`
Expected: FAIL（2 件目でポップアップが見つからない）

- [ ] **Step 3: 本文コンテナに ref を付ける**

`law-viewer-page.tsx` の `<LawDocumentView ... />` を包む要素に `ref={documentRef}` を付ける。包む要素が無ければ `<div ref={documentRef}>` で包む。

```tsx
const documentRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 4: hook を配線する**

コンポーネント本体に追加する。`state.law` / `state.nodes` / `state.revision` / `storageRepository` は既存の名前に合わせること。

```tsx
const isHighlightEnabled = useMemo(() => isHighlightSupported(), []);
const { annotations, highlight, remove } = useArticleHighlights({
  lawId: state.law.lawId,
  nodes: state.nodes,
  repository: storageRepository,
  enabled: isHighlightEnabled,
});
const paintedRanges = useHighlightPainting({
  containerRef: documentRef,
  nodes: state.nodes,
  annotations,
  enabled: isHighlightEnabled,
});
const [popover, setPopover] = useState<HighlightPopoverState | undefined>(undefined);
```

型と補助関数は同ファイル内に置く。

```tsx
interface HighlightPopoverState {
  anchorRect: { top: number; bottom: number; left: number; width: number };
  lawNodeId: string;
  range: { start: number; end: number };
  annotationId?: string;
  color?: HighlightColor;
}

// 本文ノードから親をたどって、それが属する条の番号を求める。
// targetKey の索引に条番号が要るため、ハイライト保存時に載せる。
const findArticleNumberForNode = (nodes: LawNode[], lawNodeId: string): string | undefined => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let current = nodeById.get(lawNodeId);

  while (current !== undefined) {
    if (current.type === "Article") {
      return current.number;
    }

    current = current.parentId === undefined ? undefined : nodeById.get(current.parentId);
  }

  return undefined;
};
```

- [ ] **Step 5: 選択の購読を書く**

**注意**: 以下の `resolved.start` / `resolved.end`（`resolveNodeTextRange` の戻り値）は
表示文字列＝display 空間の座標である。Step 7 の `onSelect` から `highlight()` を呼ぶ
直前で、対象ノードの `node.plainText` を使い `alignTexts` → `toSourceOffset` で
plainText 空間へ変換してから渡すこと（Task 12 の「注意」参照）。変換前の
display 空間の座標をそのまま `buildHighlightMutations` の `range` に渡さないこと。

```tsx
useEffect(() => {
  if (!isHighlightEnabled) {
    return;
  }

  const handleSelectionChange = () => {
    const selection = window.getSelection();

    if (selection === null || selection.rangeCount === 0) {
      setPopover(undefined);

      return;
    }

    const range = selection.getRangeAt(0);
    const resolved = resolveNodeTextRange(range);

    if (resolved === undefined) {
      setPopover(undefined);

      return;
    }

    const rect = range.getBoundingClientRect();
    setPopover({
      anchorRect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
      lawNodeId: resolved.lawNodeId,
      range: { start: resolved.start, end: resolved.end },
    });
  };

  document.addEventListener("selectionchange", handleSelectionChange);

  return () => {
    document.removeEventListener("selectionchange", handleSelectionChange);
  };
}, [isHighlightEnabled]);
```

- [ ] **Step 6: 既存ハイライトのヒットテストを書く**

```tsx
useEffect(() => {
  if (!isHighlightEnabled) {
    return;
  }

  const handlePointerUp = (event: PointerEvent) => {
    const selection = window.getSelection();

    // テキスト選択中は選択側のポップアップを優先する。
    if (selection !== null && !selection.isCollapsed) {
      return;
    }

    const position = caretPositionAt(document, event.clientX, event.clientY);

    if (position === undefined) {
      return;
    }

    const hit = paintedRanges.find((painted) =>
      painted.range.isPointInRange(position.node, position.offset),
    );

    if (hit === undefined) {
      setPopover(undefined);

      return;
    }

    const resolved = resolveNodeTextRange(hit.range);

    if (resolved === undefined) {
      return;
    }

    const rect = hit.range.getBoundingClientRect();
    setPopover({
      anchorRect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
      lawNodeId: resolved.lawNodeId,
      range: { start: resolved.start, end: resolved.end },
      annotationId: hit.annotationId,
      color: hit.color,
    });
  };

  document.addEventListener("pointerup", handlePointerUp);

  return () => {
    document.removeEventListener("pointerup", handlePointerUp);
  };
}, [isHighlightEnabled, paintedRanges]);
```

- [ ] **Step 7: ポップアップを描画する**

JSX の末尾（`</div>` を閉じる直前など、本文と同じツリー内）に置く。

```tsx
{
  popover === undefined ? null : (
    <HighlightColorPopover
      anchorRect={popover.anchorRect}
      onDelete={
        popover.annotationId === undefined
          ? undefined
          : () => {
              const annotationId = popover.annotationId;

              if (annotationId !== undefined) {
                void remove(annotationId);
              }

              setPopover(undefined);
            }
      }
      onDismiss={() => {
        setPopover(undefined);
      }}
      onSelect={(color) => {
        void highlight({
          lawNodeId: popover.lawNodeId,
          range: popover.range,
          color,
          target: {
            lawId: state.law.lawId,
            revisionId: state.revision.revisionId,
            article: findArticleNumberForNode(state.nodes, popover.lawNodeId),
          },
        });
        setPopover(undefined);
        window.getSelection()?.removeAllRanges();
      }}
      selectedColor={popover.color}
    />
  );
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `pnpm exec vitest run --dir src law-viewer-page`
Expected: PASS

- [ ] **Step 9: 検証ゲートを通してコミット**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm exec vitest run --dir src
git add src/app/law-viewer-page.tsx src/app/law-viewer-page.test.tsx
git commit --no-verify -m "feat: 法令ビューアに条文ハイライトを組み込む

Close #188

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 14: 実画面検証と PR

**Files:**

- Create: スクラッチディレクトリ配下のスクリーンショットと録画

**Interfaces:**

- Consumes: Task 1-13
- Produces: PR

- [ ] **Step 1: preview build を起動する**

dev サーバーは HMR と依存再最適化でフルリロードを起こし、操作の途中で状態が飛ぶ。必ず preview build を使う。`run_in_background` で起動し、`Monitor` で待つ（`sleep` を使わない）。

```bash
pnpm run build && pnpm run preview
```

- [ ] **Step 2: 3 本の検証を撮る**

`playwright-cli` で次を撮る。`--filename` は不安定なので出力先はディレクトリ指定にし、生成後にリネームする。

1. 選択 → 黄を選ぶ → 再読込 → 色が残る（動画）
2. 表示モードを readable ↔ original で切り替えてもハイライトがずれない（動画）
3. ダークモードでの 4 色の見え方（4 色を並べたスクリーンショット 1 枚）

- [ ] **Step 3: 録画をアニメーション WebP に変換する**

GitHub は WebM を受け付けないため変換する。

```bash
ffmpeg -i input.webm -vcodec libwebp_anim -loop 0 output.webp
```

- [ ] **Step 4: 検証ゲートを最終確認する**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm exec vitest run --dir src
```

- [ ] **Step 5: PR を作る**

```bash
git push -u origin feat/issue-188-article-highlight
gh pr create --title "feat: 条文のハイライト機能を追加する" --body-file <本文ファイル> --assignee SlashNephy
```

本文には次を含める。

- 概要と `Close #188`
- 設計ドキュメントへのリンク
- 検証ゲート 4 種の実行結果（コマンドと出力）
- `github-image-upload` スキル（`gh image upload`）で上げた録画・スクリーンショット
  - 動画は `[{ファイル名}.webp](https://github.com/user-attachments/assets/...)` の形式にし、前後に空行を入れる
- Task 1 の実機検証結果（`var()` 可否、Safari の caret API、強制カラーモード）
- 未検証事項があれば明記する

- [ ] **Step 6: マージ可否を確認する**

```bash
gh pr view --json mergeable,mergeStateStatus
```

コンフリクトしていれば `origin/main` を取り込んで解消する。
