# 略称辞書（Alias Dictionary）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 学習者向け略称・正式名称から法令候補（lawId と正式名称）を引ける静的辞書と純粋関数の Resolver を `core/jump` に新設する。

**Architecture:** 法令中心のエントリ `{ lawId, officialTitle, aliases[] }` の静的配列を持ち、`createAliasResolver` が「正規化キー → 候補配列」の逆引き Map を生成時 1 回だけ構築する。`resolve(input)` は既存 `normalizeForSearch` による完全一致で候補を返す。ストレージ・e-Gov・React には依存しない純粋ドメインロジック。

**Tech Stack:** TypeScript (strict), Vitest, 既存 `@/core/search` の `normalizeForSearch`。

設計根拠: [docs/superpowers/specs/2026-07-10-alias-dictionary-design.md](../specs/2026-07-10-alias-dictionary-design.md)

## Global Constraints

- TypeScript strict。`any` 禁止。型は明示的にエクスポートする（`export type`）。
- モジュール内の相互参照は相対 `./x`、モジュール横断は `@/` エイリアス（既存 `src/core/**` の慣例）。
- コメントは日本語。非自明な直値（lawId・正規化の意図）には理由を添える。
- `nil` 配列を作らない。略称が無いエントリは `aliases: []`（空配列）とする。
- 検証ゲート（プロジェクト標準 check）: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check` を全て通す。長い辞書行が prettier に触れるため、コミット前に必ず `pnpm format` を実行してから `pnpm format:check` を確認する。
- lawId は spec の表（e-Gov 実 API 検証済み）の値を一字一句そのまま使う。
- テストは公開 IF（`resolve` / `initialAliasDictionary`）の振る舞いのみ検証する。ソース文字列走査・定数の複製比較は書かない。

## File Structure

| ファイル                                     | 責務                                                          |
| -------------------------------------------- | ------------------------------------------------------------- |
| `src/core/jump/alias-dictionary.ts`          | `AliasDictionaryEntry` 型と静的 `initialAliasDictionary`      |
| `src/core/jump/alias-dictionary.test.ts`     | 初期データの整合（lawId/officialTitle 一意・alias 健全性）    |
| `src/core/jump/alias-resolver.ts`            | `createAliasResolver` / 候補型 / 逆引き照合ロジック           |
| `src/core/jump/alias-resolver.test.ts`       | 照合・正規化・正式名称・未知語・ユーザー辞書・曖昧性の振る舞い |
| `src/core/jump/index.ts`                      | 公開 API のバレル                                             |

---

### Task 1: 辞書データと整合テスト（`alias-dictionary.ts`）

**Files:**
- Create: `src/core/jump/alias-dictionary.ts`
- Test: `src/core/jump/alias-dictionary.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface AliasDictionaryEntry { lawId: string; officialTitle: string; aliases: string[] }`
  - `const initialAliasDictionary: AliasDictionaryEntry[]`（13 エントリ）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/jump/alias-dictionary.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { initialAliasDictionary } from "./alias-dictionary";

describe("initialAliasDictionary", () => {
  it("lawId が一意である", () => {
    const ids = initialAliasDictionary.map((entry) => entry.lawId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("officialTitle が一意である", () => {
    const titles = initialAliasDictionary.map((entry) => entry.officialTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("各 alias は空でなく前後空白を含まず、正式名称やエントリ内で重複しない", () => {
    for (const entry of initialAliasDictionary) {
      const seen = new Set<string>();
      for (const alias of entry.aliases) {
        expect(alias).not.toBe("");
        expect(alias).toBe(alias.trim());
        expect(alias).not.toBe(entry.officialTitle);
        expect(seen.has(alias)).toBe(false);
        seen.add(alias);
      }
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/core/jump/alias-dictionary.test.ts`
Expected: FAIL（`Cannot find module "./alias-dictionary"` によりインポート解決に失敗）

- [ ] **Step 3: 最小実装（辞書データ）**

`src/core/jump/alias-dictionary.ts`:

```ts
// 辞書エントリは法令中心。1 法令が複数の略称を持つ。
export interface AliasDictionaryEntry {
  lawId: string; // e-Gov lawId
  officialTitle: string; // 正式名称。resolve では kind "official" のキーになる
  aliases: string[]; // 学習者向け略称。正式名称は含めない
}

// 初期辞書。e-Gov の abbrev（公式略称）を全て取り込み、e-Gov に無い学習者略称（単字・短縮形）を加えた静的データ。
// 各 lawId と abbrev 由来の略称は e-Gov /api/2/laws の実レスポンスで検証済み（2026-07-10）。
export const initialAliasDictionary: AliasDictionaryEntry[] = [
  { lawId: "321CONSTITUTION", officialTitle: "日本国憲法", aliases: ["憲", "憲法"] },
  { lawId: "129AC0000000089", officialTitle: "民法", aliases: ["民"] },
  { lawId: "132AC0000000048", officialTitle: "商法", aliases: ["商"] },
  { lawId: "140AC0000000045", officialTitle: "刑法", aliases: ["刑"] },
  { lawId: "408AC0000000109", officialTitle: "民事訴訟法", aliases: ["民訴法", "民訴"] },
  { lawId: "323AC0000000131", officialTitle: "刑事訴訟法", aliases: ["刑訴法", "刑訴"] },
  { lawId: "405AC0000000088", officialTitle: "行政手続法", aliases: ["行手法", "行手"] },
  {
    lawId: "426AC0000000068",
    officialTitle: "行政不服審査法",
    // 行審法・行服法はいずれも e-Gov abbrev の公式略称。行審は学習者略称。
    aliases: ["行審法", "行服法", "行審"],
  },
  { lawId: "337AC0000000139", officialTitle: "行政事件訴訟法", aliases: ["行訴法", "行訴"] },
  { lawId: "322AC0000000125", officialTitle: "国家賠償法", aliases: ["国賠法", "国賠"] },
  { lawId: "322AC0000000067", officialTitle: "地方自治法", aliases: ["地自法", "地自", "自治法"] },
  {
    lawId: "415AC0000000057",
    officialTitle: "個人情報の保護に関する法律",
    aliases: ["個情法", "個人情報保護法"],
  },
  // 会社法は正式名称がそのまま通称。略称は持たず、正式名称キーで解決する。
  { lawId: "417AC0000000086", officialTitle: "会社法", aliases: [] },
];
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test -- src/core/jump/alias-dictionary.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: 整形して check、コミット**

```bash
pnpm format
pnpm typecheck && pnpm lint && pnpm test -- src/core/jump && pnpm format:check
git add src/core/jump/alias-dictionary.ts src/core/jump/alias-dictionary.test.ts
git commit -m "$(cat <<'EOF'
feat(jump): 略称辞書の初期データと型を定義する

Design Doc 11.2 の初期辞書に e-Gov abbrev を取り込み、学習者略称を追加。
lawId は e-Gov 実 API で検証済み。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Resolver とバレル（`alias-resolver.ts` / `index.ts`）

**Files:**
- Create: `src/core/jump/alias-resolver.ts`
- Create: `src/core/jump/index.ts`
- Test: `src/core/jump/alias-resolver.test.ts`

**Interfaces:**
- Consumes:
  - `initialAliasDictionary`, `AliasDictionaryEntry`（Task 1）
  - `normalizeForSearch(text: string): { normalized: string; sourceIndex: number[] }`（`@/core/search`）
- Produces:
  - `type AliasMatchKind = "official" | "alias"`
  - `interface AliasCandidate { lawId: string; officialTitle: string; matchedText: string; matchKind: AliasMatchKind }`
  - `interface AliasResolverOptions { userEntries?: AliasDictionaryEntry[] }`
  - `interface AliasResolver { resolve(input: string): AliasCandidate[] }`
  - `const createAliasResolver: (options?: AliasResolverOptions) => AliasResolver`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/jump/alias-resolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { initialAliasDictionary, type AliasDictionaryEntry } from "./alias-dictionary";
import { createAliasResolver } from "./alias-resolver";

describe("createAliasResolver", () => {
  const resolver = createAliasResolver();

  it.each([
    { name: "略称 国賠", input: "国賠", lawId: "322AC0000000125", officialTitle: "国家賠償法" },
    { name: "公式略称 行服法", input: "行服法", lawId: "426AC0000000068", officialTitle: "行政不服審査法" },
    { name: "単字 民", input: "民", lawId: "129AC0000000089", officialTitle: "民法" },
    { name: "単字 憲", input: "憲", lawId: "321CONSTITUTION", officialTitle: "日本国憲法" },
    { name: "個情法", input: "個情法", lawId: "415AC0000000057", officialTitle: "個人情報の保護に関する法律" },
  ])("略称 $name を kind alias で解決する", ({ input, lawId, officialTitle }) => {
    expect(resolver.resolve(input)).toEqual([
      { lawId, officialTitle, matchedText: input, matchKind: "alias" },
    ]);
  });

  it("正式名称は kind official で解決する", () => {
    expect(resolver.resolve("国家賠償法")).toEqual([
      {
        lawId: "322AC0000000125",
        officialTitle: "国家賠償法",
        matchedText: "国家賠償法",
        matchKind: "official",
      },
    ]);
  });

  it("略称を持たない会社法も正式名称で解決する", () => {
    expect(resolver.resolve("会社法")).toEqual([
      {
        lawId: "417AC0000000086",
        officialTitle: "会社法",
        matchedText: "会社法",
        matchKind: "official",
      },
    ]);
  });

  it("前後空白を無視して解決する", () => {
    expect(resolver.resolve(" 国賠 ")).toEqual([
      {
        lawId: "322AC0000000125",
        officialTitle: "国家賠償法",
        matchedText: "国賠",
        matchKind: "alias",
      },
    ]);
  });

  it.each([
    { name: "未知語", input: "存在しない法" },
    { name: "空文字", input: "" },
    { name: "空白のみ", input: "  " },
  ])("$name は空配列を返す", ({ input }) => {
    expect(resolver.resolve(input)).toEqual([]);
  });

  it("全エントリの officialTitle が自エントリに解決する", () => {
    for (const entry of initialAliasDictionary) {
      expect(resolver.resolve(entry.officialTitle)).toContainEqual(
        expect.objectContaining({ lawId: entry.lawId, matchKind: "official" }),
      );
    }
  });

  it("resolve の戻り値を変更しても内部インデックスに影響しない", () => {
    const first = resolver.resolve("国賠");
    first.pop();
    expect(resolver.resolve("国賠")).toHaveLength(1);
  });

  describe("userEntries", () => {
    it("ユーザー辞書の新規法令を解決する", () => {
      const userEntry: AliasDictionaryEntry = {
        lawId: "USER0000000001",
        officialTitle: "架空法",
        aliases: ["架空"],
      };
      const withUser = createAliasResolver({ userEntries: [userEntry] });
      expect(withUser.resolve("架空")).toEqual([
        {
          lawId: "USER0000000001",
          officialTitle: "架空法",
          matchedText: "架空",
          matchKind: "alias",
        },
      ]);
    });

    it("組込略称と衝突するユーザー略称は両候補を登録順で返す", () => {
      const collide: AliasDictionaryEntry = {
        lawId: "USER0000000002",
        officialTitle: "紛らわしい法",
        aliases: ["民"],
      };
      const withUser = createAliasResolver({ userEntries: [collide] });
      expect(withUser.resolve("民")).toEqual([
        { lawId: "129AC0000000089", officialTitle: "民法", matchedText: "民", matchKind: "alias" },
        {
          lawId: "USER0000000002",
          officialTitle: "紛らわしい法",
          matchedText: "民",
          matchKind: "alias",
        },
      ]);
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/core/jump/alias-resolver.test.ts`
Expected: FAIL（`Cannot find module "./alias-resolver"`）

- [ ] **Step 3: Resolver を実装**

`src/core/jump/alias-resolver.ts`:

```ts
import { normalizeForSearch } from "@/core/search";

import { initialAliasDictionary, type AliasDictionaryEntry } from "./alias-dictionary";

// 候補が正式名称と略称のどちらで一致したか。
export type AliasMatchKind = "official" | "alias";

export interface AliasCandidate {
  lawId: string;
  officialTitle: string;
  matchedText: string; // 辞書に登録された、一致した表記（正規化前の原文）
  matchKind: AliasMatchKind;
}

export interface AliasResolverOptions {
  // 組込辞書に加算するユーザー辞書。将来のユーザー編集・BFF 配信の受け口。
  userEntries?: AliasDictionaryEntry[];
}

export interface AliasResolver {
  // クリーンな法令名トークンを候補配列に解決する。未知語・空文字は空配列。
  resolve(input: string): AliasCandidate[];
}

// 照合キーは検索と同じ正規化（NFKC・小文字化・空白除去）で作る。
// 部分一致は採らない。完全一致にすることで「民」が「民法」の正式名称へ誤ヒットしない。
const normalizeKey = (text: string): string => normalizeForSearch(text).normalized;

export const createAliasResolver = (options: AliasResolverOptions = {}): AliasResolver => {
  const index = new Map<string, AliasCandidate[]>();

  const register = (key: string, candidate: AliasCandidate): void => {
    // 空キー（空文字・空白のみの表記）は引けないので登録しない。
    if (key === "") {
      return;
    }

    const bucket = index.get(key);

    if (bucket === undefined) {
      index.set(key, [candidate]);
      return;
    }

    // 同一 (lawId, matchKind, matchedText) の重複は無視する（ユーザー辞書が組込と被る場合）。
    const duplicated = bucket.some(
      (existing) =>
        existing.lawId === candidate.lawId &&
        existing.matchKind === candidate.matchKind &&
        existing.matchedText === candidate.matchedText,
    );

    if (!duplicated) {
      bucket.push(candidate);
    }
  };

  // 組込辞書 → userEntries の順で登録し、候補の順序を決定的にする。
  const entries = [...initialAliasDictionary, ...(options.userEntries ?? [])];

  for (const entry of entries) {
    register(normalizeKey(entry.officialTitle), {
      lawId: entry.lawId,
      officialTitle: entry.officialTitle,
      matchedText: entry.officialTitle,
      matchKind: "official",
    });

    for (const alias of entry.aliases) {
      register(normalizeKey(alias), {
        lawId: entry.lawId,
        officialTitle: entry.officialTitle,
        matchedText: alias,
        matchKind: "alias",
      });
    }
  }

  return {
    resolve(input) {
      const candidates = index.get(normalizeKey(input));

      // インデックス内の配列を直接返すと呼び出し側の変更が辞書へ漏れるため複製して返す。
      return candidates === undefined ? [] : [...candidates];
    },
  };
};
```

- [ ] **Step 4: バレルを作成**

`src/core/jump/index.ts`:

```ts
export type { AliasDictionaryEntry } from "./alias-dictionary";
export { initialAliasDictionary } from "./alias-dictionary";
export { createAliasResolver } from "./alias-resolver";
export type {
  AliasCandidate,
  AliasMatchKind,
  AliasResolver,
  AliasResolverOptions,
} from "./alias-resolver";
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm test -- src/core/jump/alias-resolver.test.ts`
Expected: PASS（略称 5 + 正式名称 2 + 空白 1 + 空配列 3 + 全 official 1 + 不変性 1 + userEntries 2 = 15 tests）

- [ ] **Step 6: 整形して check、コミット**

```bash
pnpm format
pnpm typecheck && pnpm lint && pnpm test -- src/core/jump && pnpm format:check
git add src/core/jump/alias-resolver.ts src/core/jump/index.ts src/core/jump/alias-resolver.test.ts
git commit -m "$(cat <<'EOF'
feat(jump): 略称・正式名称から候補を引く Resolver を実装する

正規化完全一致の逆引きインデックスで候補を返す。userEntries で
ユーザー辞書を加算マージできる。core/jump のバレルも公開する。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- 略称辞書 schema 定義 → Task 1（`AliasDictionaryEntry`）。
- 初期対象決定・略称登録（国賠/国賠法、行手/行審/行訴法、地自法/民/憲 ほか）→ Task 1（`initialAliasDictionary`、spec 6 の表を網羅）。
- official title と lawId の紐づけ → Task 1（各エントリが両者を保持）。
- 主要な略称から候補を解決 → Task 2（`createAliasResolver` / `resolve`）。
- ユーザー辞書を後で足せる → Task 2（`AliasResolverOptions.userEntries`）。
- 辞書の単体テスト → Task 1・Task 2 のテスト。
- e-Gov abbrev の取り込み → Task 1 のデータと備考コメント。
- スコープ外（条文番号パース #24 / UI 配線 #31 / BFF）→ 本プランでは触れない。spec 8 と整合。

**Placeholder scan:** TODO/TBD なし。全コードステップに実コードあり。

**Type consistency:** `AliasDictionaryEntry` / `AliasCandidate` / `AliasMatchKind`（`"official" | "alias"`）/ `createAliasResolver` / `resolve` の名称・型は Task 1・Task 2・テスト・バレルで一致。`normalizeForSearch` の戻り値プロパティ名 `normalized` は既存実装と一致。
