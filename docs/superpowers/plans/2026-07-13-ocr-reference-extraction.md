# OCR結果からの条文参照抽出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OCR で得たテキストから条文参照候補を抽出し、候補一覧から本文ジャンプ・学習カード化・セッション保存へ繋ぐ。

**Architecture:** 位置表現を正規表現で位置特定し、直前の法令名を辞書最長一致サフィックスで復元してから既存 `parseReference` + `resolveReferenceCandidates` に委譲する純関数 `detectLawReferences` を `core/jump` に新設する。app 層は検出結果を候補一覧 UI（`OcrReferenceResults`）で表示し、遷移ハンドラを props 注入して ScannerPage を router 非依存に保つ。カード化は本文へ遷移し、記事ルートの `study=new` を law-viewer が読み取って既存 `StudyCardCreateDialog` を自動起動する。

**Tech Stack:** React 19 / TypeScript 6 / TanStack Router / Vitest + Testing Library / 既存 `core/jump`（parser・resolver・alias 辞書）・`core/search`（normalize）・`core/storage`（`putOcrSession`）。

## Global Constraints

- 日本語コメント。ログ・エラーメッセージは英語。
- 表示テキストはコンテナからはみ出さない（`break-words` 等）。
- アクセシビリティ: リスト/ステータスのランドマークとアクションの accessible name を保つ。
- `@/` alias は `src/`。アイコンは `lucide-react`。
- core は route 非依存に保つ（遷移写像は app 層）。
- OCR 画像は保存しない。OCR セッションは IndexedDB ローカルのみで送信しない。
- 検証ゲート: コミット前に `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test` を通す。
- テストは公開インターフェース・ユーザーから見える DOM を検証する（ソース文字列探索テストは書かない）。純関数は table testing。

---

### Task 1: 参照抽出コア `detectLawReferences`

**Files:**
- Create: `src/core/jump/reference-detector.ts`
- Test: `src/core/jump/reference-detector.test.ts`
- Modify: `src/core/jump/index.ts`（re-export 追加）

**Interfaces:**
- Consumes: `parseReference`（`./reference-parser`）、`resolveReferenceCandidates`（`./candidate-resolver`）、`createAliasResolver` / `AliasResolver`（`./alias-resolver`）、`initialAliasDictionary`（`./alias-dictionary`）、`normalizeForSearch`（`@/core/search`）、`DetectedLawReference` / `LawReferenceDetectionSource`（`@/core/domain`）。
- Produces:
  ```ts
  export interface DetectLawReferencesOptions {
    resolver?: AliasResolver;
    source?: LawReferenceDetectionSource; // 既定 { type: "ocr" }
    ocrConfidence?: number; // 0..100
  }
  export const detectLawReferences: (
    text: string,
    options?: DetectLawReferencesOptions,
  ) => DetectedLawReference[];
  ```

- [ ] **Step 1: Write the failing test**

`src/core/jump/reference-detector.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { detectLawReferences } from "./reference-detector";

// 検出結果のうち検証したい要素だけを取り出す縮約ヘルパー。
// 条項号は検出（参照）レベルの値を、lawId は解決候補の値を見る。
const summarize = (text: string) =>
  detectLawReferences(text).map((reference) => ({
    rawText: reference.rawText,
    lawId: reference.candidates[0]?.lawId,
    article: reference.article,
    paragraph: reference.paragraph,
    item: reference.item,
    resolved: reference.candidates.length > 0,
  }));

describe("detectLawReferences", () => {
  it.each([
    {
      name: "正式名称 + 第N条",
      input: "民法第709条を参照",
      expected: [
        { rawText: "民法第709条", lawId: "129AC0000000089", article: "709", resolved: true },
      ],
    },
    {
      name: "先頭ノイズが法令名に食われない（最長一致サフィックス）",
      input: "問題文は民法709条について",
      expected: [{ rawText: "民法709条", lawId: "129AC0000000089", article: "709", resolved: true }],
    },
    {
      name: "1行に複数参照。2つ目は法令名なしで未解決",
      input: "民法709条、710条",
      expected: [
        { rawText: "民法709条", lawId: "129AC0000000089", article: "709", resolved: true },
        // 法令名が無いため relative 参照。article は parseReference の値 "710" が載る。
        { rawText: "710条", lawId: undefined, article: "710", resolved: false },
      ],
    },
    {
      name: "略称 + 条省略",
      input: "国賠1条により",
      expected: [{ rawText: "国賠1条", lawId: "322AC0000000125", article: "1", resolved: true }],
    },
    {
      name: "条項号 + 本文",
      input: "民法709条1項2号本文",
      expected: [
        {
          rawText: "民法709条1項2号本文",
          lawId: "129AC0000000089",
          article: "709",
          paragraph: "1",
          item: "2",
          resolved: true,
        },
      ],
    },
    {
      name: "枝番（漢数字）",
      input: "民法第七百九条の二",
      expected: [
        { rawText: "民法第七百九条の二", lawId: "129AC0000000089", article: "709-2", resolved: true },
      ],
    },
    {
      // 辞書外の法令名は復元せず、位置表現だけを relative 参照として検出する（既知の縮退）。
      name: "辞書外の法令名は位置のみ未解決で検出",
      input: "宇宙法5条",
      expected: [{ rawText: "5条", lawId: undefined, article: "5", resolved: false }],
    },
    {
      name: "相対参照は未解決",
      input: "前条の規定により",
      // parseReference は前条を article "previous" として返す。
      expected: [{ rawText: "前条", lawId: undefined, article: "previous", resolved: false }],
    },
    {
      name: "同一参照は重複排除",
      input: "民法709条と民法709条",
      expected: [
        { rawText: "民法709条", lawId: "129AC0000000089", article: "709", resolved: true },
      ],
    },
    {
      name: "参照なしは空",
      input: "これはただの文章です",
      expected: [],
    },
  ])("$name", ({ input, expected }) => {
    expect(summarize(input)).toEqual(expected);
  });

  it("複数行を跨いで検出する", () => {
    const result = summarize("民法709条\n憲法21条1項");
    expect(result).toEqual([
      { rawText: "民法709条", lawId: "129AC0000000089", article: "709", paragraph: undefined, item: undefined, resolved: true },
      { rawText: "憲法21条1項", lawId: "321CONSTITUTION", article: "21", paragraph: "1", item: undefined, resolved: true },
    ]);
  });

  it("ocrConfidence で confidence を減衰する", () => {
    const [full] = detectLawReferences("民法709条", {});
    const [scaled] = detectLawReferences("民法709条", { ocrConfidence: 50 });
    expect(scaled.confidence).toBeCloseTo(full.confidence * 0.5, 5);
  });

  it("決定的 ID を採番する（同入力で同 ID）", () => {
    const first = detectLawReferences("民法709条");
    const second = detectLawReferences("民法709条");
    expect(first[0]?.id).toBe(second[0]?.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/core/jump/reference-detector.test.ts`
Expected: FAIL（`detectLawReferences` が未定義 / モジュール解決不可）

- [ ] **Step 3: Write the implementation**

`src/core/jump/reference-detector.ts`:

```ts
import type { DetectedLawReference, LawReferenceDetectionSource } from "@/core/domain";
import { normalizeForSearch } from "@/core/search";

import { initialAliasDictionary } from "./alias-dictionary";
import { createAliasResolver, type AliasResolver } from "./alias-resolver";
import { resolveReferenceCandidates } from "./candidate-resolver";
import { parseReference } from "./reference-parser";

export interface DetectLawReferencesOptions {
  // 分類・解決に使う resolver。既定は組込辞書のみ。
  resolver?: AliasResolver;
  // 検出元。既定は OCR。将来のクリップボード・手入力の受け口。
  source?: LawReferenceDetectionSource;
  // ページ全体の OCR confidence（0..100）。confidence 減衰に使う。
  ocrConfidence?: number;
}

const defaultResolver = createAliasResolver();
const defaultSource: LawReferenceDetectionSource = { type: "ocr" };

// 位置表現に使う数字（アラビア・全角・漢数字）。パーサーの数値解釈に合わせる。
const kanjiDigits = "一二三四五六七八九十百千";
const numberClass = `[0-9０-９${kanjiDigits}]+`;

// 行内で条文の位置表現を位置特定するパターン。先頭に必須トークン
// （条/項/号/別表/相対マーカー）を要求して空マッチを防ぎ、続く項・号・本文/ただし書は
// 任意で連結して 1 参照のスパンにする。抽出後の実際の解析は parseReference に委譲する。
const positionPattern =
  `(?:別表第?${numberClass}|第?${numberClass}条(?:の${numberClass})*|前条|次条|第?${numberClass}項|前項|次項|第?${numberClass}号)` +
  `(?:第?${numberClass}項|前項|次項)?` +
  `(?:第?${numberClass}号)?` +
  `(?:本文|ただし書|但書)?`;

// 法令名部を後方から拾う窓幅。辞書の正規化キー最長長を使う。
const maxLawNameLength = Math.max(
  ...initialAliasDictionary.flatMap((entry) =>
    [entry.officialTitle, ...entry.aliases].map(
      (surface) => normalizeForSearch(surface).normalized.length,
    ),
  ),
);

// anchorStart 直前から、辞書に一致する最長サフィックスの開始位置を返す。
// start を小さい方から試すことで最長一致が最初にヒットする。一致が無ければ
// anchorStart（法令名なし = 相対参照候補）を返す。
const findLawNameStart = (
  line: string,
  anchorStart: number,
  resolver: AliasResolver,
): number => {
  const from = Math.max(0, anchorStart - maxLawNameLength);

  for (let start = from; start < anchorStart; start += 1) {
    if (resolver.resolve(line.slice(start, anchorStart)).length > 0) {
      return start;
    }
  }

  return anchorStart;
};

// 重複判定キー。候補ありは lawId 列 + 条項号、候補なしは正規化テキストで畳む。
const detectionKey = (candidates: DetectedLawReference["candidates"], normalizedText: string): string => {
  if (candidates.length === 0) {
    return `u:${normalizedText}`;
  }

  const first = candidates[0];
  const lawIds = candidates.map((candidate) => candidate.lawId).join(",");

  return `r:${lawIds}:${first.article ?? ""}:${first.paragraph ?? ""}:${first.item ?? ""}`;
};

export const detectLawReferences = (
  text: string,
  options: DetectLawReferencesOptions = {},
): DetectedLawReference[] => {
  const resolver = options.resolver ?? defaultResolver;
  const source = options.source ?? defaultSource;
  const confidenceScale =
    options.ocrConfidence === undefined
      ? 1
      : Math.min(1, Math.max(0, options.ocrConfidence / 100));

  const detected: DetectedLawReference[] = [];
  const seen = new Set<string>();

  text.split("\n").forEach((line, lineIndex) => {
    // グローバル正規表現をこのスコープで使い切り、lastIndex を持ち回さない。
    const pattern = new RegExp(positionPattern, "g");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line)) !== null) {
      // 空マッチ保険。理論上起きないが、起きれば無限ループになるため前進させる。
      if (match[0] === "") {
        pattern.lastIndex += 1;
        continue;
      }

      const anchorStart = match.index;
      const nameStart = findLawNameStart(line, anchorStart, resolver);
      const rawText = line.slice(nameStart, anchorStart + match[0].length);

      const parsed = parseReference(rawText, { resolver });

      if (parsed === undefined) {
        continue;
      }

      const resolution = resolveReferenceCandidates(parsed, { resolver });
      // Readonly 候補を可変コピーへ畳んでドメイン型に載せる。
      const candidates =
        resolution.status === "resolved"
          ? resolution.candidates.map((candidate) => ({ ...candidate }))
          : [];
      const normalizedText = normalizeForSearch(rawText).normalized;
      const key = detectionKey(candidates, normalizedText);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      detected.push({
        // 行番号・行内位置・正規化テキストから決まる決定的 ID。
        id: `ocr-${lineIndex}-${anchorStart}-${normalizedText}`,
        rawText,
        normalizedText,
        ...(parsed.lawNameCandidate === undefined
          ? {}
          : { lawNameCandidate: parsed.lawNameCandidate }),
        ...(parsed.lawAlias === undefined ? {} : { lawAlias: parsed.lawAlias }),
        ...(parsed.article === undefined ? {} : { article: parsed.article }),
        ...(parsed.paragraph === undefined ? {} : { paragraph: parsed.paragraph }),
        ...(parsed.item === undefined ? {} : { item: parsed.item }),
        confidence: parsed.score * confidenceScale,
        source,
        candidates,
      });
    }
  });

  return detected;
};
```

- [ ] **Step 4: Add the re-export**

`src/core/jump/index.ts` に追記（既存の resolver export の並びに合わせる）:

```ts
export { detectLawReferences } from "./reference-detector";
export type { DetectLawReferencesOptions } from "./reference-detector";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/core/jump/reference-detector.test.ts`
Expected: PASS（全ケース）

- [ ] **Step 6: Verify gate & commit**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check
git add src/core/jump/reference-detector.ts src/core/jump/reference-detector.test.ts src/core/jump/index.ts
git commit -m "$(cat <<'EOF'
feat(jump): OCRテキストから複数条文参照を抽出する

位置表現を正規表現で位置特定し、法令名を辞書最長一致サフィックスで
復元してから既存パーサー・候補解決へ委譲する純関数を追加する。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 候補一覧 UI `OcrReferenceResults`

**Files:**
- Create: `src/app/OcrReferenceResults.tsx`
- Test: `src/app/OcrReferenceResults.test.tsx`

**Interfaces:**
- Consumes: `DetectedLawReference` / `LawReferenceCandidate`（`@/core/domain`）、`Button`（`@/shared/ui/button`）。
- Produces:
  ```ts
  interface OcrReferenceResultsProps {
    references: DetectedLawReference[];
    sourceText: string;
    onOpenCandidate: (candidate: LawReferenceCandidate) => void;
    onAddToReview: (candidate: LawReferenceCandidate) => void;
  }
  export const OcrReferenceResults: (props: OcrReferenceResultsProps) => JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

`src/app/OcrReferenceResults.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DetectedLawReference } from "@/core/domain";

import { OcrReferenceResults } from "./OcrReferenceResults";

const resolvedReference: DetectedLawReference = {
  id: "ref-1",
  rawText: "民法709条",
  normalizedText: "民法709条",
  lawNameCandidate: "民法",
  article: "709",
  confidence: 0.9,
  source: { type: "ocr" },
  candidates: [
    {
      lawId: "129AC0000000089",
      lawTitle: "民法",
      article: "709",
      score: 0.9,
      reason: ["正式名称『民法』に一致", "第709条"],
    },
  ],
};

const unresolvedReference: DetectedLawReference = {
  id: "ref-2",
  rawText: "前条",
  normalizedText: "前条",
  confidence: 0.4,
  source: { type: "ocr" },
  candidates: [],
};

describe("OcrReferenceResults", () => {
  it("解決済み候補を表示し、開くで候補を渡す", async () => {
    const onOpenCandidate = vi.fn();
    render(
      <OcrReferenceResults
        references={[resolvedReference]}
        sourceText="民法709条"
        onOpenCandidate={onOpenCandidate}
        onAddToReview={vi.fn()}
      />,
    );

    expect(screen.getByText("民法 第709条")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "民法 第709条を開く" }));
    expect(onOpenCandidate).toHaveBeenCalledWith(resolvedReference.candidates[0]);
  });

  it("復習に追加で候補を渡す", async () => {
    const onAddToReview = vi.fn();
    render(
      <OcrReferenceResults
        references={[resolvedReference]}
        sourceText="民法709条"
        onOpenCandidate={vi.fn()}
        onAddToReview={onAddToReview}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "民法 第709条を復習に追加" }));
    expect(onAddToReview).toHaveBeenCalledWith(resolvedReference.candidates[0]);
  });

  it("無視で参照を一覧から隠す", async () => {
    render(
      <OcrReferenceResults
        references={[resolvedReference]}
        sourceText="民法709条"
        onOpenCandidate={vi.fn()}
        onAddToReview={vi.fn()}
      />,
    );

    expect(screen.getByText("民法709条")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "民法709条を無視" }));
    expect(screen.queryByText("民法 第709条")).not.toBeInTheDocument();
  });

  it("未解決参照は理由を示しアクションを出さない", () => {
    render(
      <OcrReferenceResults
        references={[unresolvedReference]}
        sourceText="前条"
        onOpenCandidate={vi.fn()}
        onAddToReview={vi.fn()}
      />,
    );

    expect(screen.getByText(/法令を特定できません/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /を開く/ })).not.toBeInTheDocument();
  });

  it("検出0件では案内と生テキストを表示する", () => {
    render(
      <OcrReferenceResults
        references={[]}
        sourceText="これはただの文章です"
        onOpenCandidate={vi.fn()}
        onAddToReview={vi.fn()}
      />,
    );

    expect(screen.getByText(/条文参照が見つかりませんでした/)).toBeInTheDocument();
    expect(screen.getByText("これはただの文章です")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/OcrReferenceResults.test.tsx`
Expected: FAIL（`OcrReferenceResults` が未定義）

- [ ] **Step 3: Write the implementation**

`src/app/OcrReferenceResults.tsx`:

```tsx
import { useState } from "react";

import type { DetectedLawReference, LawReferenceCandidate } from "@/core/domain";
import { Button } from "@/shared/ui/button";

interface OcrReferenceResultsProps {
  references: DetectedLawReference[];
  // 検出0件時の fallback 表示に使う OCR 全文。
  sourceText: string;
  onOpenCandidate: (candidate: LawReferenceCandidate) => void;
  onAddToReview: (candidate: LawReferenceCandidate) => void;
}

// 候補の見出し文字列（法令名 + 条項号）。表示と accessible name に共有する。
const candidateLabel = (candidate: LawReferenceCandidate): string => {
  const parts = [candidate.lawTitle];

  if (candidate.article !== undefined) {
    parts.push(`第${candidate.article}条`);
  }

  if (candidate.paragraph !== undefined) {
    parts.push(`第${candidate.paragraph}項`);
  }

  if (candidate.item !== undefined) {
    parts.push(`第${candidate.item}号`);
  }

  return parts.join(" ");
};

// 未解決の理由。detector 経路の未解決はすべて文脈不足（needs-context）。
// 法令名の手掛かりがあるか（例: 民法前条）で文言を分ける。
const unresolvedMessage = (reference: DetectedLawReference): string =>
  reference.lawNameCandidate === undefined && reference.lawAlias === undefined
    ? "周辺の文脈がないと法令を特定できません。"
    : "周辺の条文がないと参照先を特定できません。";

export const OcrReferenceResults = ({
  references,
  sourceText,
  onOpenCandidate,
  onAddToReview,
}: OcrReferenceResultsProps) => {
  // 「無視」した参照 id をローカルに保持する。保存済みセッションは変更しない。
  const [ignoredIds, setIgnoredIds] = useState<ReadonlySet<string>>(new Set());
  const visible = references.filter((reference) => !ignoredIds.has(reference.id));

  if (visible.length === 0) {
    return (
      <div className="grid gap-3 text-left">
        <p className="text-sm text-muted-foreground" role="status">
          条文参照が見つかりませんでした。読み取ったテキストを確認し、必要なら手入力してください。
        </p>
        <pre className="max-h-48 overflow-y-auto rounded-md border bg-muted p-3 text-sm break-words whitespace-pre-wrap">
          {sourceText.trim() !== "" ? sourceText : "テキストが検出されませんでした。"}
        </pre>
      </div>
    );
  }

  const ignore = (id: string) => {
    setIgnoredIds((previous) => new Set(previous).add(id));
  };

  return (
    <ul className="grid gap-3 text-left">
      {visible.map((reference) => (
        <li key={reference.id} className="grid gap-2 rounded-md border p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium break-words text-foreground">{reference.rawText}</span>
            <Button
              aria-label={`${reference.rawText}を無視`}
              className="shrink-0"
              onClick={() => {
                ignore(reference.id);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              無視
            </Button>
          </div>
          {reference.candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{unresolvedMessage(reference)}</p>
          ) : (
            <ul className="grid gap-2">
              {reference.candidates.map((candidate, index) => {
                const label = candidateLabel(candidate);

                return (
                  <li
                    key={`${candidate.lawId}-${index}`}
                    className="grid gap-1 rounded-md bg-muted/50 p-2"
                  >
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    {candidate.reason.length > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {candidate.reason.join(" / ")}
                      </span>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        aria-label={`${label}を開く`}
                        onClick={() => {
                          onOpenCandidate(candidate);
                        }}
                        size="sm"
                        type="button"
                      >
                        開く
                      </Button>
                      {candidate.article === undefined ? null : (
                        <Button
                          aria-label={`${label}を復習に追加`}
                          onClick={() => {
                            onAddToReview(candidate);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          復習に追加
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/OcrReferenceResults.test.tsx`
Expected: PASS（全ケース）

- [ ] **Step 5: Verify gate & commit**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check
git add src/app/OcrReferenceResults.tsx src/app/OcrReferenceResults.test.tsx
git commit -m "$(cat <<'EOF'
feat(app): OCR条文参照候補の一覧UIを追加

候補ごとに開く/復習に追加/無視を出し、未解決は理由を示す。
検出0件は生テキストへフォールバックする。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 復習遷移写像 `navigateToReviewCandidate`

**Files:**
- Modify: `src/app/search-navigation.ts`
- Test: `src/app/search-navigation.test.ts`

**Interfaces:**
- Consumes: `useNavigate`（型のみ、`@tanstack/react-router`）、`QuickSearchCandidate`（`@/core/jump`。既存 import を再利用）。
- Produces:
  ```ts
  export const navigateToReviewCandidate: (
    navigate: ReturnType<typeof useNavigate>,
    candidate: Pick<QuickSearchCandidate, "lawId" | "article">,
  ) => void;
  ```
  条番号がある候補のみ記事ルートへ `search: { study: "new" }` 付きで遷移する。条番号が無ければ何もしない（カードは条文アンカー必須）。

- [ ] **Step 1: Write the failing test**

`src/app/search-navigation.test.ts` の末尾に追記（既存 import 行に `navigateToReviewCandidate` を足す）:

```ts
import {
  navigateToCandidate,
  navigateToReviewCandidate,
  toNavigationTarget,
} from "./search-navigation";
```

```ts
describe("navigateToReviewCandidate", () => {
  it("条番号があれば study=new 付きで記事ルートへ navigate する", () => {
    const navigate = vi.fn();
    navigateToReviewCandidate(navigate, { lawId: "129AC0000000089", article: "709" });

    expect(navigate).toHaveBeenCalledWith({
      to: "/laws/$lawId/articles/$article",
      params: { lawId: "129AC0000000089", article: "709" },
      search: { study: "new" },
    });
  });

  it("条番号がなければ navigate しない", () => {
    const navigate = vi.fn();
    navigateToReviewCandidate(navigate, { lawId: "129AC0000000089" });

    expect(navigate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/search-navigation.test.ts`
Expected: FAIL（`navigateToReviewCandidate` が未定義）

- [ ] **Step 3: Write the implementation**

`src/app/search-navigation.ts` の末尾に追記:

```ts
// 復習カード化は本文へ遷移し、記事ルートの study=new を law-viewer が読み取って
// 学習カード作成ダイアログを自動起動する。カードは条文アンカー必須のため、
// 条番号を持つ候補のみ遷移する。
export const navigateToReviewCandidate = (
  navigate: ReturnType<typeof useNavigate>,
  candidate: Pick<QuickSearchCandidate, "lawId" | "article">,
): void => {
  if (candidate.article === undefined) {
    return;
  }

  void navigate({
    to: "/laws/$lawId/articles/$article",
    params: { lawId: candidate.lawId, article: candidate.article },
    search: { study: "new" },
  });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/search-navigation.test.ts`
Expected: PASS

- [ ] **Step 5: Verify gate & commit**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check
git add src/app/search-navigation.ts src/app/search-navigation.test.ts
git commit -m "$(cat <<'EOF'
feat(app): 候補を復習カード化する遷移写像を追加

記事ルートへ study=new 付きで遷移する navigateToReviewCandidate を追加する。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ScannerPage への配線と OcrPanel の done 整理

**Files:**
- Modify: `src/app/scanner-page.tsx`
- Modify: `src/app/ocr-panel.tsx`（done ブランチから生テキスト `<pre>` を除去）
- Modify: `src/app/ocr-panel.test.tsx`（done テストを更新）
- Modify: `src/app/router.tsx`（scanner ルートで遷移ハンドラと repository を注入）
- Test: `src/app/scanner-page.test.tsx`（候補表示・開く・復習の配線を検証）

**Interfaces:**
- Consumes: `detectLawReferences`（`@/core/jump`）、`OcrReferenceResults`（`./OcrReferenceResults`）、`navigateToCandidate` / `navigateToReviewCandidate`（`./search-navigation`）、`StorageRepository`（`@/core/storage`）、`LawReferenceCandidate`（`@/core/domain`）、`useNavigate`（`@tanstack/react-router`、router.tsx 側）。
- Produces: ScannerPage の新しい props（後続 Task 5・router から使う）:
  ```ts
  {
    cameraStreamProvider?: CameraStreamProvider;
    ocr?: UseOcr;
    storageRepository?: StorageRepository;
    onOpenCandidate?: (candidate: LawReferenceCandidate) => void;
    onAddToReview?: (candidate: LawReferenceCandidate) => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

`src/app/scanner-page.test.tsx` に追記（先頭の import に `OcrResult` 型と `LawReferenceCandidate` を足す。`UseOcr` は既存 import）:

```tsx
import type { OcrResult } from "@/core/ocr";
import type { LawReferenceCandidate } from "@/core/domain";
```

```tsx
// done フェーズの決定的な OCR スタブ。空アロー本体は no-empty-function で落ちるため
// 既存 makeOcrStub と同じく Promise.resolve() / コメント本体で埋める。
const makeDoneOcr = (text: string, confidence = 90): UseOcr => {
  const result: OcrResult = { text, confidence, words: [] };

  return {
    phase: "done",
    progress: 1,
    result,
    requestRecognize: () => Promise.resolve(),
    grantConsentAndRecognize: () => Promise.resolve(),
    cancel: () => {
      // mock implementation
    },
    reset: () => {
      // mock implementation
    },
  };
};

// プレビュー状態にするため画像を1枚選ばせるヘルパー。
const selectImage = () => {
  const input = screen.getByLabelText("画像を選ぶ", { selector: "input" });
  const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
};

describe("ScannerPage 条文参照候補", () => {
  it("OCR done で検出した候補を表示する", () => {
    render(<ScannerPage ocr={makeDoneOcr("民法709条を参照")} />);
    selectImage();
    expect(screen.getByText("民法 第709条")).toBeInTheDocument();
  });

  it("開くで onOpenCandidate を候補付きで呼ぶ", async () => {
    const onOpenCandidate = vi.fn<(candidate: LawReferenceCandidate) => void>();
    render(<ScannerPage ocr={makeDoneOcr("民法709条")} onOpenCandidate={onOpenCandidate} />);
    selectImage();

    await userEvent.click(screen.getByRole("button", { name: "民法 第709条を開く" }));
    expect(onOpenCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ lawId: "129AC0000000089", article: "709" }),
    );
  });

  it("検出0件では案内を表示する", () => {
    render(<ScannerPage ocr={makeDoneOcr("これはただの文章です")} />);
    selectImage();
    expect(screen.getByText(/条文参照が見つかりませんでした/)).toBeInTheDocument();
  });
});
```

先頭に `userEvent` の import が無ければ追加する:

```tsx
import userEvent from "@testing-library/user-event";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/scanner-page.test.tsx`
Expected: FAIL（候補 "民法 第709条" が表示されない）

- [ ] **Step 3: OcrPanel の done ブランチから生テキストを除去する**

`src/app/ocr-panel.tsx` の `phase === "done"` ブランチ（現在の `<pre>` + 「もう一度読み取る」）を、テキスト表示を候補一覧側へ委ねる形に置き換える:

```tsx
  if (phase === "done" && result !== undefined) {
    return (
      // 認識テキストと候補一覧の表示は ScannerPage 側の OcrReferenceResults が担う。
      // ここでは再認識の操作だけを残す。
      <Button
        className="w-full"
        onClick={() => {
          ocr.reset();
          void ocr.requestRecognize(blob);
        }}
        type="button"
        variant="outline"
      >
        もう一度読み取る
      </Button>
    );
  }
```

- [ ] **Step 4: ocr-panel.test.tsx の done テストを更新する**

`src/app/ocr-panel.test.tsx`:
- 「done フェーズで認識テキストを表示する」テスト（生テキスト assertion）を、再認識ボタンの存在確認に置き換える:

```tsx
it("done フェーズで再認識ボタンを表示する", () => {
  const result: OcrResult = { text: "第一条 テスト", confidence: 90, words: [] };
  render(<OcrPanel blob={dummyBlob} ocr={makeOcrStub({ phase: "done", result })} />);
  expect(screen.getByRole("button", { name: "もう一度読み取る" })).toBeInTheDocument();
});
```

- 「done フェーズで空白のみのテキストはプレースホルダーを表示する」テストは削除する（生テキスト表示は OcrReferenceResults の責務へ移ったため。プレースホルダーは Task 2 の「検出0件」テストで検証済み）。

- [ ] **Step 5: ScannerPage に検出と候補一覧を配線する**

`src/app/scanner-page.tsx`:

import に追加:

```tsx
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
// ↑ 既存 import に useMemo を追加（他は既存）

import { detectLawReferences } from "@/core/jump";
import type { LawReferenceCandidate } from "@/core/domain";
import type { StorageRepository } from "@/core/storage";

import { OcrReferenceResults } from "./OcrReferenceResults";
```

props を拡張:

```tsx
export const ScannerPage = ({
  cameraStreamProvider = defaultCameraStreamProvider,
  ocr: ocrProp,
  storageRepository,
  onOpenCandidate,
  onAddToReview,
}: {
  cameraStreamProvider?: CameraStreamProvider;
  // テストから決定的な OCR スタブを注入できるようにする。省略時は useOcr() を使う。
  ocr?: UseOcr;
  // OCR セッション保存に使う。router から注入。省略時は保存しない（Task 5）。
  storageRepository?: StorageRepository;
  // 候補の遷移写像。core を route 非依存に保つため app/router から注入する。
  onOpenCandidate?: (candidate: LawReferenceCandidate) => void;
  onAddToReview?: (candidate: LawReferenceCandidate) => void;
}) => {
```

コンポーネント本体の hooks 群（`const ocr = ...` の下あたり）に検出を追加:

```tsx
  // OCR 完了テキストから条文参照候補を抽出する。result の同一性で再計算する。
  const detectedReferences = useMemo(
    () =>
      ocr.result === undefined
        ? []
        : detectLawReferences(ocr.result.text, { ocrConfidence: ocr.result.confidence }),
    [ocr.result],
  );
```

画像プレビュー分岐（`if (image !== undefined) { ... }`）の中、`<OcrPanel ... />` の直後に候補一覧を追加する:

```tsx
        <OcrPanel blob={image.blob} ocr={ocr} onDiscard={handleDiscard} />
        {ocr.phase === "done" && ocr.result !== undefined ? (
          <OcrReferenceResults
            references={detectedReferences}
            sourceText={ocr.result.text}
            onOpenCandidate={onOpenCandidate ?? (() => {})}
            onAddToReview={onAddToReview ?? (() => {})}
          />
        ) : null}
```

- [ ] **Step 6: router.tsx で scanner ルートにハンドラと repository を注入する**

`src/app/router.tsx`:

import に追加（既存 `createRoute` 等の行に `useNavigate` を足す。navigate 写像を import）:

```tsx
import { createRootRoute, createRoute, createRouter, useNavigate } from "@tanstack/react-router";

import { navigateToCandidate, navigateToReviewCandidate } from "./search-navigation";
```

`scannerRoute` の定義を、ハンドラを注入する wrapper に置き換える:

```tsx
  // ScannerPage を route 非依存に保つため、遷移写像と repository を closure で注入する。
  const ScannerRoute = () => {
    const navigate = useNavigate();

    return (
      <ScannerPage
        storageRepository={storageRepository}
        onOpenCandidate={(candidate) => {
          navigateToCandidate(navigate, candidate);
        }}
        onAddToReview={(candidate) => {
          navigateToReviewCandidate(navigate, candidate);
        }}
      />
    );
  };

  const scannerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "scanner",
    component: ScannerRoute,
  });
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/scanner-page.test.tsx src/app/ocr-panel.test.tsx src/app/router.test.tsx`
Expected: PASS

- [ ] **Step 8: Verify gate & commit**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check
git add src/app/scanner-page.tsx src/app/scanner-page.test.tsx src/app/ocr-panel.tsx src/app/ocr-panel.test.tsx src/app/router.tsx
git commit -m "$(cat <<'EOF'
feat(app): スキャナーに条文参照候補一覧を配線する

OCR done で検出した候補を表示し、開く/復習に追加を router 注入の
遷移写像へ繋ぐ。生テキスト表示は OcrReferenceResults へ集約する。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: OCR セッションの保存

**Files:**
- Modify: `src/app/scanner-page.tsx`
- Test: `src/app/scanner-page.test.tsx`

**Interfaces:**
- Consumes: `storageRepository.putOcrSession`（`StorageRepository`）、`generateStorageId`（`@/core/storage`）、`OcrSession`（`@/core/domain`）、`detectedReferences`（Task 4 で算出済み）。
- Produces: OCR done 到達時に一度だけ `putOcrSession` を呼ぶ副作用と、失敗時のインライン警告表示。

**Note:** 保存失敗は toast ではなくインライン警告で示す（AppShell に Toaster 未マウントのため。候補表示は継続する、という仕様の意図は満たす）。

- [ ] **Step 1: Write the failing test**

`src/app/scanner-page.test.tsx` の「条文参照候補」describe に追記:

```tsx
it("OCR done でセッションを保存する", async () => {
  const putOcrSession = vi.fn(() => Promise.resolve());
  const storageRepository = { putOcrSession } as unknown as import("@/core/storage").StorageRepository;
  render(<ScannerPage ocr={makeDoneOcr("民法709条")} storageRepository={storageRepository} />);
  selectImage();

  await waitFor(() => {
    expect(putOcrSession).toHaveBeenCalledTimes(1);
  });
  const session = putOcrSession.mock.calls[0][0];
  expect(session.sourceText).toBe("民法709条");
  expect(session.detectedReferences).toHaveLength(1);
});

it("セッション保存に失敗しても候補表示を続け、警告を出す", async () => {
  const putOcrSession = vi.fn(async () => {
    throw new Error("quota exceeded");
  });
  const storageRepository = { putOcrSession } as unknown as import("@/core/storage").StorageRepository;
  render(<ScannerPage ocr={makeDoneOcr("民法709条")} storageRepository={storageRepository} />);
  selectImage();

  expect(await screen.findByText(/セッションを保存できませんでした/)).toBeInTheDocument();
  expect(screen.getByText("民法 第709条")).toBeInTheDocument();
});
```

先頭 import に `waitFor` が無ければ追加する:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/scanner-page.test.tsx`
Expected: FAIL（`putOcrSession` が呼ばれない）

- [ ] **Step 3: Write the implementation**

`src/app/scanner-page.tsx`:

import に追加:

```tsx
import { generateStorageId } from "@/core/storage";
```

hooks 群に保存の副作用と警告 state を追加（`detectedReferences` の下）:

```tsx
  const [sessionSaveFailed, setSessionSaveFailed] = useState(false);
  // 同一 OCR result を二重保存しないよう、保存済み result を参照で覚える。
  const savedResultRef = useRef<OcrResult | undefined>(undefined);

  useEffect(() => {
    const result = ocr.result;

    // done でない・repository 未注入・保存済みの result はスキップする。
    if (
      ocr.phase !== "done" ||
      result === undefined ||
      storageRepository === undefined ||
      savedResultRef.current === result
    ) {
      return;
    }

    savedResultRef.current = result;
    setSessionSaveFailed(false);
    const now = new Date().toISOString();
    const session: OcrSession = {
      id: generateStorageId(),
      sourceText: result.text,
      detectedReferences,
      createdAt: now,
      updatedAt: now,
    };

    // 保存はベストエフォート。失敗しても候補表示は継続し、警告のみ出す。
    void storageRepository.putOcrSession(session).catch(() => {
      setSessionSaveFailed(true);
    });
  }, [ocr.phase, ocr.result, detectedReferences, storageRepository]);
```

型 import を追加（既存の `@/core/ocr` からの type import 群、および domain）:

```tsx
import type { CameraErrorKind, CameraStreamProvider, CapturedImage, OcrResult } from "@/core/ocr";
import type { LawReferenceCandidate, OcrSession } from "@/core/domain";
```

画像プレビュー分岐の候補一覧の直前に警告表示を追加:

```tsx
        {sessionSaveFailed ? (
          <p
            className="rounded-md border border-destructive/50 px-4 py-2 text-sm text-destructive"
            role="alert"
          >
            セッションを保存できませんでした。候補の利用は続けられます。
          </p>
        ) : null}
        {ocr.phase === "done" && ocr.result !== undefined ? (
          <OcrReferenceResults
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/scanner-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Verify gate & commit**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check
git add src/app/scanner-page.tsx src/app/scanner-page.test.tsx
git commit -m "$(cat <<'EOF'
feat(app): OCRセッションをローカル保存する

done 到達時に sourceText と検出参照を putOcrSession で保存する。
保存失敗はインライン警告に留め、候補表示は継続する。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: law-viewer での学習カードダイアログ自動起動

**Files:**
- Modify: `src/app/router.tsx`（記事ルートに `validateSearch` を追加）
- Modify: `src/app/law-viewer-page.tsx`（`study=new` を読み取りダイアログを自動起動）
- Test: `src/app/law-viewer-page.test.tsx`（router 経由で自動起動を検証）

**Interfaces:**
- Consumes: `useSearch`（`@tanstack/react-router`）、既存 `LawViewerReadyState` の `setIsCardDialogOpen` / `activeNode` / `activeArticleNumber` / `navigate` / `lawId`。
- Produces: 記事ルートの search 契約 `{ study?: "new" }`。

- [ ] **Step 1: Write the failing test**

`src/app/law-viewer-page.test.tsx` に追記（既存の `createAppRouter` + `createMemoryHistory` パターンを踏襲。fixture 民法 = `129AC0000000089`、第1条を対象にする）:

```tsx
it("記事ルートに study=new で入ると学習カードダイアログを自動起動する", async () => {
  const history = createMemoryHistory({
    initialEntries: ["/laws/129AC0000000089/articles/1?study=new"],
  });
  const { fetcher } = createJsonFetchStub(lawDataFixture);
  const lawRepository = createEgovLawRepository({ fetcher, now });
  const storageRepository = createMemoryStorageRepository();

  render(
    <RouterProvider router={createAppRouter({ history, lawRepository, storageRepository })} />,
  );

  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("学習カードを作る")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/law-viewer-page.test.tsx`
Expected: FAIL（ダイアログが開かない。`study` search が無視される）

- [ ] **Step 3: 記事ルートに validateSearch を追加する**

`src/app/router.tsx` の `lawViewerArticleRoute`:

```tsx
  const lawViewerArticleRoute = createRoute({
    getParentRoute: () => lawViewerRoute,
    path: "articles/$article",
    component: LawViewerRoute,
    // OCR 候補からの「復習に追加」は study=new を付けて遷移し、本文ロード後に
    // 学習カード作成ダイアログを自動起動する。未指定・他値は空 search に畳む。
    validateSearch: (search: Record<string, unknown>): { study?: "new" } =>
      search.study === "new" ? { study: "new" } : {},
  });
```

- [ ] **Step 4: law-viewer 側で study=new を読み取り自動起動する**

`src/app/law-viewer-page.tsx`:

import に `useSearch` を追加、`useRef` が無ければ追加:

```tsx
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { type SyntheticEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
```

`LawViewerReadyState` 内、`activeNode`（現在の line 458 付近）の定義直後に自動起動の効果を追加する:

```tsx
  // カード作成ダイアログのアンカー対象ノード。アクティブ条が定まるときのみ描画する。
  const activeNode =
    activeArticleNumber !== undefined
      ? findArticleNode(state.nodes, activeArticleNumber)
      : undefined;

  // OCR 候補の「復習に追加」由来。study=new かつ対象条ノードが確定したら、
  // 一度だけカード作成ダイアログを自動起動し、リロード時の再起動を防ぐため param を消す。
  const articleSearch = useSearch({ from: "/laws/$lawId/articles/$article", shouldThrow: false });
  const cardAutoOpenedRef = useRef(false);

  useEffect(() => {
    if (
      articleSearch?.study !== "new" ||
      activeNode === undefined ||
      activeArticleNumber === undefined ||
      cardAutoOpenedRef.current
    ) {
      return;
    }

    cardAutoOpenedRef.current = true;
    setIsCardDialogOpen(true);
    void navigate({
      to: "/laws/$lawId/articles/$article",
      params: { lawId, article: activeArticleNumber },
      search: {},
      replace: true,
    });
  }, [articleSearch?.study, activeNode, activeArticleNumber, lawId, navigate]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/law-viewer-page.test.tsx`
Expected: PASS

- [ ] **Step 6: Verify gate & commit**

```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check
git add src/app/router.tsx src/app/law-viewer-page.tsx src/app/law-viewer-page.test.tsx
git commit -m "$(cat <<'EOF'
feat(app): study=newで学習カードダイアログを自動起動する

OCR候補の復習追加から記事ルートへ遷移し、本文ロード後に
StudyCardCreateDialog を開いて既存の指紋アンカーを再利用する。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 全体検証と実画面確認

**Files:** なし（検証のみ）

- [ ] **Step 1: 全テスト・検証ゲート**

Run:
```bash
pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test
```
Expected: すべて PASS

- [ ] **Step 2: 実画面確認（playwright-cli）**

`playwright-cli open --headed` でセッションを確立し、以下を確認してスクリーンショットを撮る:

1. `/scanner` で画像を選ぶ → OCR → 条文参照候補が一覧表示される。
2. 候補の「開く」で本文（例: 民法709条）へ遷移する。
3. スキャナーへ戻り候補の「復習に追加」→ 本文へ遷移し学習カード作成ダイアログが自動で開く。
4. 検出0件の画像で「条文参照が見つかりませんでした」と生テキストが出る。

Note: 実ブラウザで OCR モデルの初回ダウンロードが要る。ネットワーク事情で OCR が重い場合は、候補一覧以降の導線（開く・復習に追加）を、テキスト貼り付けではなく既存の手動導線と併せて確認し、制約を PR に記録する。

- [ ] **Step 3: スクリーンショットを PR に添付**

`github-image-upload` スキル（`gh image upload`）で撮影画像を PR 本文へ添付する。

---

## Self-Review

**1. Spec coverage:**

| Spec 節 | 対応タスク |
| --- | --- |
| §3 参照抽出（detectLawReferences） | Task 1 |
| §4 OCR セッション保存 | Task 5 |
| §5 候補一覧 UI / 開く | Task 2（UI）・Task 4（配線）・Task 3（開く写像は既存 navigateToCandidate 再利用、復習写像を追加） |
| §6 カード化（本文遷移 + 自動起動） | Task 3（遷移写像）・Task 6（自動起動） |
| §9 テスト戦略 | 各タスクの test ステップ + Task 7 実画面 |

**2. Placeholder scan:** プレースホルダなし。各コードステップに実コードを記載済み。

**3. Type consistency:** `detectLawReferences` の戻り値 `DetectedLawReference[]` を Task 4/5 が消費。`navigateToReviewCandidate`（Task 3）を Task 4 の router が使用。`OcrReferenceResults` の props（Task 2）を Task 4 が供給。`study=new` search 契約は Task 3（付与）・Task 6（`validateSearch` + 読み取り）で一致。ScannerPage props は Task 4 で定義し Task 5 が同じ形に追記。

**Deviation note:** セッション保存失敗の通知は、AppShell に Toaster 未マウントのため spec の「トースト」ではなくインライン警告にした（候補表示継続の意図は保持）。最終報告で自己申告する。
