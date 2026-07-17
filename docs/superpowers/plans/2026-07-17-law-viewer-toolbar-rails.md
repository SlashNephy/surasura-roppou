# 条文ビューワー ツールバー整理（2レール分業）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 条文ビューワー中央の操作カードを解体し、文書レベル操作を左レール／選択条レベル操作を右レールへ分業し、モバイルはボトムシートへ集約する。あわせて表示モードを永続設定へ移し、日付表記を `yyyy/mm/dd` に統一する。

**Architecture:** 表示モードはビューワーのローカル状態から `DisplayPreferences` ストア（`useSyncExternalStore` ベース）へ移す。ビューワーはレイアウト（3 カラム grid）とレール／モバイルシートの開閉状態のみ保持し、レール内容は小さなプレゼンテーション単位へ切り出す。日付整形は共通関数 `formatIsoDateLabel` に一元化する。

**Tech Stack:** React 19 / TanStack Router / Tailwind CSS 4 / radix-ui (`Sheet`) / Vitest + Testing Library / next-themes（テーマのみ）

## Global Constraints

- 法令本文の原文は保持し、表示切替は表示レイヤーで行う（`node.rawText` / `node.plainText` を維持）。
- コメントは日本語。非自明な直値・外部制約・設定項目には理由コメントを付ける。
- アイコンは `lucide-react`。共通 UI は `src/shared/ui/` の既存 variant / className 合成を使う。
- UI 変更はデスクトップ幅・モバイル幅の両方を意識し、テキストがコンテナからはみ出さないようにする。アクセシビリティ上の名前・ランドマーク・キーボード操作を維持する。
- React hooks: effect 内の set-state を避ける（`react-hooks` v7 で error）。ダイアログ/シートの開時初期化は conditional mount + useState 初期化子で行う。
- 検証ゲート: `pnpm run typecheck` / `pnpm run lint` / `pnpm run format:check` / `pnpm test` を全て通す。
- 表示モードの値は `"readable" | "original"`、既定 `"readable"`。storage key は `surasura:display:text-mode`。
- `core/settings` は `core/viewer` に依存しない（設定側は同値の union を独自定義する）。

---

## File Structure

- `src/core/settings/display-preferences.ts`（変更）: `textDisplayMode` を追加。
- `src/core/settings/display-preferences.test.ts`（変更）: `textDisplayMode` の read/write/validation テスト。
- `src/core/settings/index.ts`（変更）: 新 API の再エクスポート。
- `src/app/use-display-preferences.ts`（変更）: `textDisplayMode` と setter を公開。
- `src/app/settings-page.tsx`（変更）: 静的行「既定の表示」を実 `<Select>` に置換。
- `src/app/settings-page.test.tsx`（変更）: 表示モード切替のテスト。
- `src/shared/utils/dates.ts`（変更）: `formatIsoDateLabel` を `yyyy/mm/dd` へ。
- `src/shared/utils/dates.test.ts`（新規）: 整形テスト。
- `src/core/viewer/LawDocumentView.tsx`（変更）: 施行日を共通整形経由に。
- `src/core/viewer/LawDocumentView.test.tsx`（変更）: 日付期待値。
- `src/app/law-viewer-page.tsx`（変更）: 表示モードを設定から読む / トグル撤去 / 日付整形統一 / 2レール分業 / モバイルサブバー＋シート。
- `src/app/law-viewer-page.test.tsx`（変更）: 上記に合わせて更新。

---

## Task 1: 表示モードを設定ストアへ追加

**Files:**

- Modify: `src/core/settings/display-preferences.ts`
- Modify: `src/core/settings/index.ts`
- Test: `src/core/settings/display-preferences.test.ts`

**Interfaces:**

- Produces:
  - `type DisplayTextMode = "readable" | "original"`
  - `DisplayPreferences.textDisplayMode: DisplayTextMode`
  - `isDisplayTextMode(value: unknown): value is DisplayTextMode`
  - `setDisplayTextMode(value: DisplayTextMode): void`
  - `DISPLAY_PREFERENCES_STORAGE_KEYS.textMode: "surasura:display:text-mode"`
  - `DEFAULT_DISPLAY_PREFERENCES.textDisplayMode === "readable"`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/settings/display-preferences.test.ts` の import に `isDisplayTextMode`, `setDisplayTextMode` を追加し、`storageKeys` に `textMode: "surasura:display:text-mode"` を足す。末尾に以下の describe を追加する。

```ts
describe("textDisplayMode", () => {
  it("既定は readable", () => {
    expect(getDisplayPreferences().textDisplayMode).toBe("readable");
  });

  it.each(["readable", "original"] as const)("%s を保存して復元する", (mode) => {
    setDisplayTextMode(mode);
    expect(getDisplayPreferences().textDisplayMode).toBe(mode);
  });

  it("不正な保存値は既定へフォールバックする", () => {
    localStorage.setItem(storageKeys.textMode, "invalid");
    expect(getDisplayPreferences().textDisplayMode).toBe("readable");
  });

  it.each([
    { value: "readable", expected: true },
    { value: "original", expected: true },
    { value: "invalid", expected: false },
    { value: undefined, expected: false },
  ])("isDisplayTextMode($value) === $expected", ({ value, expected }) => {
    expect(isDisplayTextMode(value)).toBe(expected);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test -- src/core/settings/display-preferences.test.ts`
Expected: FAIL（`isDisplayTextMode` / `setDisplayTextMode` が未定義、`textDisplayMode` が存在しない）

- [ ] **Step 3: ストアに textDisplayMode を実装する**

`src/core/settings/display-preferences.ts` を以下の通り変更する。

先頭の const 群に追加:

```ts
const displayTextModes = ["readable", "original"] as const;
```

型を追加:

```ts
export type DisplayTextMode = (typeof displayTextModes)[number];
```

`DisplayPreferences` にフィールドを追加:

```ts
export interface DisplayPreferences {
  readonly fontSize: DisplayFontSize;
  readonly lineSpacing: DisplayLineSpacing;
  readonly theme: DisplayTheme;
  // 法令本文の表示モード（読みやすい表示 / 原文表示）。原文は常に保持し表示のみ切替。
  readonly textDisplayMode: DisplayTextMode;
}
```

`createDisplayPreferences` に引数を追加:

```ts
const createDisplayPreferences = (
  fontSize: DisplayFontSize,
  lineSpacing: DisplayLineSpacing,
  theme: DisplayTheme,
  textDisplayMode: DisplayTextMode,
): DisplayPreferences => Object.freeze({ fontSize, lineSpacing, theme, textDisplayMode });
```

`DEFAULT_DISPLAY_PREFERENCES` を更新:

```ts
export const DEFAULT_DISPLAY_PREFERENCES = createDisplayPreferences(
  "standard",
  "standard",
  "system",
  "readable",
);
```

storage key を追加:

```ts
export const DISPLAY_PREFERENCES_STORAGE_KEYS = {
  fontSize: "surasura:display:font-size",
  lineSpacing: "surasura:display:line-spacing",
  theme: "surasura:display:theme",
  textMode: "surasura:display:text-mode",
} as const;
```

`handleStorage` のキー判定に追加:

```ts
const handleStorage = (event: StorageEvent): void => {
  if (
    event.key !== null &&
    event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize &&
    event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing &&
    event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.theme &&
    event.key !== DISPLAY_PREFERENCES_STORAGE_KEYS.textMode
  ) {
    return;
  }

  for (const listener of listeners) {
    listener();
  }
};
```

バリデータを追加（既存バリデータ群の隣）:

```ts
export const isDisplayTextMode = (value: unknown): value is DisplayTextMode =>
  typeof value === "string" && includes(displayTextModes, value);
```

`getDisplayPreferences` に read とキャッシュ比較を追加:

```ts
export const getDisplayPreferences = (): DisplayPreferences => {
  const storage = getStorage();
  const fontSize = read(
    storage,
    DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize,
    displayFontSizes,
    DEFAULT_DISPLAY_PREFERENCES.fontSize,
  );
  const lineSpacing = read(
    storage,
    DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing,
    displayLineSpacings,
    DEFAULT_DISPLAY_PREFERENCES.lineSpacing,
  );
  const theme = read(
    storage,
    DISPLAY_PREFERENCES_STORAGE_KEYS.theme,
    displayThemes,
    DEFAULT_DISPLAY_PREFERENCES.theme,
  );
  const textDisplayMode = read(
    storage,
    DISPLAY_PREFERENCES_STORAGE_KEYS.textMode,
    displayTextModes,
    DEFAULT_DISPLAY_PREFERENCES.textDisplayMode,
  );

  // useSyncExternalStore の snapshot が、値の不変時に同じ参照を返す契約を保つ。
  if (
    cachedPreferences.fontSize === fontSize &&
    cachedPreferences.lineSpacing === lineSpacing &&
    cachedPreferences.theme === theme &&
    cachedPreferences.textDisplayMode === textDisplayMode
  ) {
    return cachedPreferences;
  }

  cachedPreferences = createDisplayPreferences(fontSize, lineSpacing, theme, textDisplayMode);
  return cachedPreferences;
};
```

セッターを追加（既存 setter 群の隣）:

```ts
export const setDisplayTextMode = (value: DisplayTextMode): void => {
  write(getStorage(), DISPLAY_PREFERENCES_STORAGE_KEYS.textMode, value);
};
```

`src/core/settings/index.ts` の display-preferences ブロックに追加（アルファベット順の近傍へ）:

```ts
  isDisplayTextMode,
  setDisplayTextMode,
  type DisplayTextMode,
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test -- src/core/settings/display-preferences.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/core/settings/display-preferences.ts src/core/settings/display-preferences.test.ts src/core/settings/index.ts
git commit -m "feat: 表示モードを表示設定ストアに追加する"
```

---

## Task 2: useDisplayPreferences フックへ配線

**Files:**

- Modify: `src/app/use-display-preferences.ts`

**Interfaces:**

- Consumes: `getDisplayPreferences().textDisplayMode`, `setDisplayTextMode`, `DisplayTextMode`（Task 1）
- Produces: `useDisplayPreferences()` の戻り値に `textDisplayMode: DisplayTextMode` と `setTextDisplayMode: (value: DisplayTextMode) => void` を追加。

このタスクは既存の `subscribeDisplayPreferences` 経由の `useSyncExternalStore` から `textDisplayMode` を取り出して返すだけで、フック単体の振る舞いテストは Task 3（設定画面）と Task 5（ビューワー）で公開 UI 経由に検証されるため、独立テストは追加しない。

- [ ] **Step 1: フックを更新する**

`src/app/use-display-preferences.ts` を以下に変更する。

import に型と setter を追加:

```ts
import {
  DEFAULT_DISPLAY_PREFERENCES,
  getDisplayPreferences,
  isDisplayTheme,
  setDisplayFontSize,
  setDisplayLineSpacing,
  setDisplayTextMode,
  subscribeDisplayPreferences,
  type DisplayFontSize,
  type DisplayLineSpacing,
  type DisplayPreferences,
  type DisplayTextMode,
  type DisplayTheme,
} from "@/core/settings";
```

戻り値の型に追加:

```ts
interface DisplayPreferencesValue extends DisplayPreferences {
  setFontSize: (value: DisplayFontSize) => void;
  setLineSpacing: (value: DisplayLineSpacing) => void;
  setTextDisplayMode: (value: DisplayTextMode) => void;
  setTheme: (value: DisplayTheme) => void;
}
```

`useSyncExternalStore` の分割代入に `textDisplayMode` を加え、return に含める:

```ts
export const useDisplayPreferences = (): DisplayPreferencesValue => {
  const { fontSize, lineSpacing, textDisplayMode } = useSyncExternalStore(
    subscribeDisplayPreferences,
    getDisplayPreferences,
    getServerDisplayPreferences,
  );
  const { setTheme: setNextTheme, theme: nextTheme } = useTheme();
  const theme = isDisplayTheme(nextTheme) ? nextTheme : DEFAULT_DISPLAY_PREFERENCES.theme;
  const setTheme = useCallback(
    (value: DisplayTheme): void => {
      setNextTheme(value);
    },
    [setNextTheme],
  );

  return {
    fontSize,
    lineSpacing,
    textDisplayMode,
    theme,
    setFontSize: setDisplayFontSize,
    setLineSpacing: setDisplayLineSpacing,
    setTextDisplayMode: setDisplayTextMode,
    setTheme,
  };
};
```

- [ ] **Step 2: 型チェックが通ることを確認する**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/app/use-display-preferences.ts
git commit -m "feat: useDisplayPreferences に表示モードを公開する"
```

---

## Task 3: 設定画面に表示モードのセレクトを追加

**Files:**

- Modify: `src/app/settings-page.tsx`
- Test: `src/app/settings-page.test.tsx`

**Interfaces:**

- Consumes: `useDisplayPreferences().textDisplayMode` / `setTextDisplayMode`（Task 2）, `isDisplayTextMode`（Task 1）

- [ ] **Step 1: 失敗するテストを書く**

`src/app/settings-page.test.tsx` に以下のテストを追加する。既存の `renderSettingsRoute()`（`{ user }` を返す。内部で `DisplayPreferencesProvider` ラップ済み）と `getByLabelText` パターンに倣う。

```ts
it("表示モードを原文表示に切り替えて保存する", async () => {
  const { user } = renderSettingsRoute();

  const select = await screen.findByLabelText("既定の表示");
  expect(select).toHaveValue("readable");

  await user.selectOptions(select, "original");

  expect(screen.getByLabelText("既定の表示")).toHaveValue("original");
  expect(localStorage.getItem("surasura:display:text-mode")).toBe("original");
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test -- src/app/settings-page.test.tsx`
Expected: FAIL（`既定の表示` がラベル付きセレクトでなく静的テキストのため `getByLabelText` が見つからない）

- [ ] **Step 3: 静的行を実セレクトに置換する**

`src/app/settings-page.tsx` の `DisplaySettingsGroup` を変更する。

import に追加:

```ts
import {
  baseDateToStudyYear,
  earliestBaseDate,
  isDisplayFontSize,
  isDisplayLineSpacing,
  isDisplayTextMode,
  isDisplayTheme,
  isValidBaseDate,
  listSelectableStudyYears,
  studyYearToBaseDate,
} from "@/core/settings";
```

フックの分割代入に追加:

```ts
const {
  fontSize,
  lineSpacing,
  setFontSize,
  setLineSpacing,
  setTextDisplayMode,
  setTheme,
  textDisplayMode,
  theme,
} = useDisplayPreferences();
```

`textModeId` の `useId` を追加:

```ts
const textModeId = useId();
```

末尾の静的行（`<div className="flex items-center justify-between ...">既定の表示 ... 読みやすい表示</div>`）を、テーマ行の下に置く次の `DisplaySelectRow` に置換する:

```tsx
<DisplaySelectRow id={textModeId} label="既定の表示">
  <Select
    className="w-full"
    id={textModeId}
    onChange={(event) => {
      if (isDisplayTextMode(event.target.value)) {
        setTextDisplayMode(event.target.value);
      }
    }}
    value={textDisplayMode}
  >
    <option value="readable">読みやすい表示</option>
    <option value="original">原文表示</option>
  </Select>
</DisplaySelectRow>
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test -- src/app/settings-page.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/app/settings-page.tsx src/app/settings-page.test.tsx
git commit -m "feat: 設定画面で本文の表示モードを切り替えられるようにする"
```

---

## Task 4: 日付表記を yyyy/mm/dd に統一

**Files:**

- Modify: `src/shared/utils/dates.ts`
- Test: `src/shared/utils/dates.test.ts`（新規）
- Modify: `src/core/viewer/LawDocumentView.tsx`
- Modify: `src/core/viewer/LawDocumentView.test.tsx`
- Modify: `src/app/law-viewer-page.tsx`（日付ヘルパーのみ）
- Modify: `src/app/law-viewer-page.test.tsx`（日付期待値のみ）

**Interfaces:**

- Produces: `formatIsoDateLabel(value)` が `YYYY/MM/DD` を返す。壊れた値は `"不明"`。

- [ ] **Step 1: 共通関数の失敗するテストを書く**

`src/shared/utils/dates.test.ts` を新規作成する。

```ts
import { describe, expect, it } from "vitest";

import { formatIsoDateLabel } from "./dates";

describe("formatIsoDateLabel", () => {
  it.each([
    { value: "2026-07-05", expected: "2026/07/05" },
    { value: "2026-07-05T12:34:56Z", expected: "2026/07/05" },
    { value: "2020-04-01", expected: "2020/04/01" },
  ])("$value を $expected に整形する", ({ value, expected }) => {
    expect(formatIsoDateLabel(value)).toBe(expected);
  });

  it.each([{ value: undefined }, { value: "" }, { value: "2026" }])(
    "壊れた値 $value は不明にする",
    ({ value }) => {
      expect(formatIsoDateLabel(value)).toBe("不明");
    },
  );
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test -- src/shared/utils/dates.test.ts`
Expected: FAIL（現状はハイフン区切りを返す）

- [ ] **Step 3: 共通関数を yyyy/mm/dd へ変更する**

`src/shared/utils/dates.ts` を変更する。

```ts
// ISO 8601 文字列から日付部分を取り出し yyyy/mm/dd で表示する。壊れた値は「不明」とする。
export const formatIsoDateLabel = (value: string | undefined): string =>
  typeof value === "string" && value.length >= 10 ? value.slice(0, 10).replace(/-/g, "/") : "不明";
```

- [ ] **Step 4: 共通関数テストが通ることを確認する**

Run: `pnpm test -- src/shared/utils/dates.test.ts`
Expected: PASS

- [ ] **Step 5: ビューワー内の生 ISO 表示を共通関数へ寄せる**

`src/core/viewer/LawDocumentView.tsx` の施行日表示を整形経由にする。`dd` を次に変更:

```tsx
<dd>施行日: {formatIsoDateLabel(revision.effectiveDate)}</dd>
```

（`formatIsoDateLabel` は既に import 済み。`effectiveDate` が `undefined` のとき当該 `div` を出さない既存の条件分岐はそのまま残す。）

`src/app/law-viewer-page.tsx` の日付ヘルパーと保存日時表示を整形経由にする。

import に `formatIsoDateLabel` があることを確認（既にある）。ヘルパーを変更:

```ts
// 表示に使った基準日のラベル。未設定なら現行法である旨を示す。
const formatBaseDateLabel = (state: Extract<LawViewerState, { status: "ready" }>): string =>
  state.requestedAsOf === undefined ? "未設定（現行法）" : formatIsoDateLabel(state.requestedAsOf);

// 解決版の施行日ラベル。未施行版など施行日が無い場合は「不明」にする。
const formatEffectiveDateLabel = (revision: LawRevision): string =>
  !revision.effectiveDate ? "不明" : `${formatIsoDateLabel(revision.effectiveDate)} 版`;
```

保存日時表示（`savedState.savedAt.slice(0, 10)`）を整形経由に変更:

```tsx
{
  savedState.savedAt !== undefined ? (
    <span>保存日時: {formatIsoDateLabel(savedState.savedAt)}</span>
  ) : null;
}
```

- [ ] **Step 6: 影響する既存テストの日付期待値を更新する**

`src/core/viewer/LawDocumentView.test.tsx`:

```ts
expect(within(document).getByText("施行日: 2026/06/24")).toBeInTheDocument();
expect(within(document).getByText("取得: 2026/07/05")).toBeInTheDocument();
```

`src/app/law-viewer-page.test.tsx`（該当行を置換）:

```ts
expect(screen.getByText("取得: 2026/07/05")).toBeInTheDocument();
```

```ts
expect(screen.getAllByText(/施行日 2026\/06\/24/).length).toBeGreaterThan(0);
```

```ts
expect(screen.getAllByText(/基準日 2020\/06\/01/).length).toBeGreaterThan(0);
```

```ts
expect(screen.getAllByText(/施行日 2026\/06\/24/).length).toBeGreaterThan(0);
```

```ts
expect(screen.getAllByText(/施行日 2020\/04\/01/).length).toBeGreaterThan(0);
```

保存日時（`保存日時: ...`）を断定するテストがあれば `2026/07/05` 形式へ更新する。存在しなければ変更不要。

- [ ] **Step 7: 関連テストが通ることを確認する**

Run: `pnpm test -- src/shared/utils/dates.test.ts src/core/viewer/LawDocumentView.test.tsx src/app/law-viewer-page.test.tsx`
Expected: PASS（他画面のテストで日付を断定している箇所があれば併せて `yyyy/mm/dd` に更新。まず `pnpm test` 全体で失敗箇所を洗い出す）

- [ ] **Step 8: 全体テストで波及を確認する**

Run: `pnpm test`
Expected: PASS。失敗が残る場合は `saved-page` / `study-cards-page` / `pages` の日付断定を `yyyy/mm/dd` へ更新する。

- [ ] **Step 9: コミット**

```bash
git add src/shared/utils/dates.ts src/shared/utils/dates.test.ts src/core/viewer/LawDocumentView.tsx src/core/viewer/LawDocumentView.test.tsx src/app/law-viewer-page.tsx src/app/law-viewer-page.test.tsx
git commit -m "feat: 日付表記を yyyy/mm/dd に統一する"
```

---

## Task 5: ビューワーの表示モードを設定から読む（トグル撤去）

**Files:**

- Modify: `src/app/law-viewer-page.tsx`
- Modify: `src/app/law-viewer-page.test.tsx`

**Interfaces:**

- Consumes: `useDisplayPreferences().textDisplayMode`（Task 2）

**注意:** ビューワーは `useDisplayPreferences` を呼ぶが、`textDisplayMode` は `useSyncExternalStore`（外部ストア）由来であり `useTheme`（context）に依存しない。テストは `localStorage` に storage key を直接設定してから描画すれば反映される（`DisplayPreferencesProvider` でのラップは不要）。

- [ ] **Step 1: 表示モードが設定由来になるテストへ更新する**

`src/app/law-viewer-page.test.tsx`。既存の「switches between readable and original display modes」テストは、トグルボタンが無くなるため設定由来の描画テストに置換する。import に storage key を追加（既にある: `DISPLAY_PREFERENCES_STORAGE_KEYS`）。

「renders readable display mode by default」の、トグルボタン `aria-pressed` を確認する行を削除し、本文の見出しだけを確認する形に変更:

```ts
it("既定は読みやすい表示で本文を描画する", async () => {
  renderLawViewerRoute("/laws/129AC0000000089");

  expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

  const article = screen.getByRole("article", { name: "第一条" });
  expect(within(article).getByRole("heading", { name: "第1条" })).toBeInTheDocument();
});
```

「switches between readable and original display modes」を、設定値 `original` を事前に入れて描画する形へ置換:

```ts
it("設定が原文表示のとき原文で描画する", async () => {
  localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.textMode, "original");
  renderLawViewerRoute("/laws/129AC0000000089");

  await screen.findByRole("article", { name: "民法" });

  const article = screen.getByRole("article", { name: "第一条" });
  expect(within(article).getByRole("heading", { name: "第一条" })).toBeInTheDocument();
});
```

「switches structural headings and both table of contents with display mode」からは、トグルボタン `原文表示` / `読みやすい表示` のクリックに依存する部分を分割し、設定値ごとに別テストとして描画する（`original` を storage に入れて描画 → 原文見出しを確認 / 何も入れずに描画 → 読みやすい見出しを確認）。「目次」ボタンで2つ目の TOC を出す既存手順は維持する:

```ts
it("原文表示の設定で構造見出しと目次が原文になる", async () => {
  localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.textMode, "original");
  const { user } = renderLawViewerRoute("/laws/129AC0000000089");

  const lawArticle = await screen.findByRole("article", { name: "民法" });
  await user.click(screen.getByRole("button", { name: "目次" }));

  expect(within(lawArticle).getByRole("heading", { name: /第一編\s+総則/u })).toBeInTheDocument();
});
```

（読みやすい側は既存の「renders readable display mode by default」相当で担保されるため、重複させない。）

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test -- src/app/law-viewer-page.test.tsx`
Expected: FAIL（まだトグルボタンが存在し、設定値を読んでいない）

- [ ] **Step 3: ビューワーからローカル状態とトグル UI を撤去し設定を読む**

`src/app/law-viewer-page.tsx` を変更する。

import に追加:

```ts
import { useDisplayPreferences } from "./use-display-preferences";
```

`LawViewerReadyState` 内のローカル状態を撤去し、設定から読む:

```ts
// 表示モードは設定（DisplayPreferences）で永続管理し、ビューワーは読むだけにする。
const { textDisplayMode: displayMode } = useDisplayPreferences();
```

（`const [displayMode, setDisplayMode] = useState<LawTextDisplayMode>("readable");` の行を削除。`LawTextDisplayMode` の import が他で未使用になる場合は削除する。）

中央ツールバー内の「表示」グループ（`表示` ラベル＋読みやすい/原文の2ボタンを含む `<div className="grid min-w-0 gap-2">` 一式）を削除する。`displayMode` を `LawDocumentView` / `LawTableOfContents` に渡している箇所はそのまま維持する。

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test -- src/app/law-viewer-page.test.tsx`
Expected: PASS

- [ ] **Step 5: 検証ゲートを通す**

Run: `pnpm run typecheck && pnpm run lint`
Expected: PASS（未使用 import が無いこと）

- [ ] **Step 6: コミット**

```bash
git add src/app/law-viewer-page.tsx src/app/law-viewer-page.test.tsx
git commit -m "feat: ビューワーの表示モードを設定から読み取る"
```

---

## Task 6: デスクトップ 2レール分業（中央ツールバー解体）

**Files:**

- Modify: `src/app/law-viewer-page.tsx`
- Modify: `src/app/law-viewer-page.test.tsx`

このタスクは中央上部の残りの操作カード（条番号ジャンプ・オフライン保存・基準日・この条文アクション）を左右レールへ移す。ジャンプ／保存／この条文の各ハンドラ（`handleJumpSubmit` / `handleSaveToggle` / `handleSaveAnchor` / ダイアログ開閉 state など）は既存のものを再利用し、配置先だけを変える。

**jsdom 上の重複に注意:** レスポンシブ class が効かないため、後続 Task 7 のモバイル要素と共存すると同名操作が重複する。テストは対象レール（`complementary` ランドマーク）内へ `within` で絞って断定する。左レール = `getByRole("complementary", { name: "法令の目次" })`、右レール = `getByRole("complementary", { name: "学習コンテキスト" })`。

- [ ] **Step 1: レール配置を検証する失敗テストを書く**

`src/app/law-viewer-page.test.tsx` に追加する。

```ts
it("文書レベル操作を左レールに、選択条操作を右レールに配置する", async () => {
  renderLawViewerRoute("/laws/129AC0000000089/articles/1");

  await screen.findByRole("article", { name: "民法" });

  const leftRail = screen.getByRole("complementary", { name: "法令の目次" });
  // 条番号ジャンプ・オフライン保存は文書レベル操作として左レールに入る
  expect(within(leftRail).getByRole("button", { name: "移動" })).toBeInTheDocument();
  expect(
    within(leftRail).getByRole("button", { name: /オフライン保存|保存解除/ }),
  ).toBeInTheDocument();

  const rightRail = screen.getByRole("complementary", { name: "学習コンテキスト" });
  // 選択条があるとき、この条文の操作は右レールに入る
  expect(within(rightRail).getByRole("button", { name: "この条文を保存" })).toBeInTheDocument();
  expect(within(rightRail).getByRole("button", { name: "カードを作る" })).toBeInTheDocument();
  expect(within(rightRail).getByRole("button", { name: "クイズを生成" })).toBeInTheDocument();
});

it("条が未選択のとき右レールは案内文を表示し操作を出さない", async () => {
  renderLawViewerRoute("/laws/129AC0000000089");

  await screen.findByRole("article", { name: "民法" });

  const rightRail = screen.getByRole("complementary", { name: "学習コンテキスト" });
  expect(within(rightRail).getByText("条を選ぶと操作が表示されます")).toBeInTheDocument();
  expect(
    within(rightRail).queryByRole("button", { name: "この条文を保存" }),
  ).not.toBeInTheDocument();
});
```

既存テストで、中央ツールバー配置を前提に `screen.getByRole("button", { name: "移動" })` 等を曖昧参照している箇所があれば、`within(leftRail)` へ絞るか、Task 7 追加後に `getAllByRole` へ緩める（重複時）。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test -- src/app/law-viewer-page.test.tsx`
Expected: FAIL（操作がまだ中央カードにあり、右レールは "準備中" のみ）

- [ ] **Step 3: 左レールに文書レベル操作を配置する**

`src/app/law-viewer-page.tsx` の左レール `<aside aria-label="法令の目次">` 内、タイトル／保存バッジの下・目次の上に、条番号ジャンプ・オフライン保存・基準日を移す。中央から該当 JSX（`<form onSubmit={handleJumpSubmit}>`、オフライン保存ボタン群、基準日 `<div aria-label="基準日情報">`）を移設する。`articleInputId` / `hasJumpError` / `saveError` などの参照はそのまま使える（同一コンポーネント内のため）。移設後のマークアップ例:

```tsx
<div className="grid gap-3 border-b pb-3">
  <form className="grid gap-2" onSubmit={handleJumpSubmit}>
    <label
      className="grid min-w-0 gap-1 text-sm font-medium text-foreground"
      htmlFor={articleInputId}
    >
      条番号
      <Input
        aria-describedby={hasJumpError ? articleJumpErrorId : undefined}
        aria-invalid={hasJumpError ? true : undefined}
        autoComplete="off"
        id={articleInputId}
        name="article"
        onChange={(event) => {
          setJumpArticleNumber(event.target.value);
          setHasJumpError(false);
        }}
        placeholder="例: 1"
        value={jumpArticleNumber}
      />
    </label>
    <Button className="w-fit" type="submit">
      移動
    </Button>
  </form>
  {hasArticleError ? notFoundAlert : null}
  <Button
    aria-describedby={saveError === undefined ? undefined : saveErrorId}
    className="w-fit gap-2"
    disabled={isSaving}
    onClick={() => {
      void handleSaveToggle();
    }}
    type="button"
    variant={savedState.isSaved ? "outline" : "default"}
  >
    {savedState.isSaved ? (
      <Trash2 className="size-4" aria-hidden="true" />
    ) : (
      <Download className="size-4" aria-hidden="true" />
    )}
    {savedState.isSaved ? "保存解除" : "オフライン保存"}
  </Button>
  <p className="text-sm leading-display text-muted-foreground">
    基準日 {formatBaseDateLabel(state)} ・ 施行日 {formatEffectiveDateLabel(state.revision)}{" "}
    <Link className="text-primary underline-offset-4 hover:underline" to="/settings">
      設定で変更
    </Link>
  </p>
</div>
```

- [ ] **Step 4: 右レールに選択条レベル操作を配置する**

右レール `<aside aria-label="学習コンテキスト">` 内、「選択中: 第X条」の下・準備中パネル群の上に、この条文アクションを移す。中央の「この条文」グループ（`この条文を保存` / `カードを作る` / `クイズを生成` / `AnchorDriftBadge`）を移設する。条未選択時は案内文を出す:

```tsx
{
  activeArticleNumber !== undefined ? (
    <div className="grid gap-2 border-b pb-3">
      <Button
        className="w-full"
        onClick={() => {
          void handleSaveAnchor(activeArticleNumber);
        }}
        type="button"
        variant="ghost"
        aria-label="この条文を保存"
      >
        この条文を保存
      </Button>
      {activeNode !== undefined ? (
        <>
          <Button
            className="w-full"
            onClick={() => {
              setIsCardDialogOpen(true);
            }}
            type="button"
            variant="ghost"
          >
            カードを作る
          </Button>
          <Button
            className="w-full"
            onClick={() => {
              setIsQuizDialogOpen(true);
            }}
            type="button"
            variant="ghost"
          >
            クイズを生成
          </Button>
        </>
      ) : null}
      {verification !== undefined &&
      (verification.status !== "match" || verification.bookmark.target.pinned === true) ? (
        <AnchorDriftBadge
          status={verification.status === "not_found" ? "not_found" : "drift"}
          onOpenCompare={() => {
            setIsCompareOpen(true);
          }}
        />
      ) : null}
    </div>
  ) : (
    <p className="border-b pb-3 text-xs leading-display text-muted-foreground">
      条を選ぶと操作が表示されます
    </p>
  );
}
```

移設に伴い、中央の操作カード `<div className="mb-4 grid gap-3 rounded-md border bg-card ...">` 全体を削除する。ただしカード内にあった `saveError` / `copyError` の警告表示（`role="alert"` の `<p>`）は本文の直前へ残す（保存失敗は左レール操作、コピー失敗は中央操作に対応するため、本文カラム上部に残置してよい）。オンライン状態・保存済み本文バッジの行はそのまま本文カラムに残す。

- [ ] **Step 5: テストが通ることを確認する**

Run: `pnpm test -- src/app/law-viewer-page.test.tsx`
Expected: PASS（既存テストで中央前提の曖昧参照が壊れる場合は `within(leftRail)` へ絞って修正する）

- [ ] **Step 6: 検証ゲート＋実画面確認**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check`
Expected: PASS

デスクトップ幅の実画面を確認する:

```bash
pnpm build && pnpm preview --port 4173 &
playwright-cli open "http://localhost:4173/laws/321CONSTITUTION/articles/9"
playwright-cli resize 1440 900
playwright-cli screenshot --filename=/tmp/viewer-desktop-rails.png
```

Expected: 中央に操作カードが無く、左レールにジャンプ／保存／基準日、右レールに条アクションが出る。

- [ ] **Step 7: コミット**

```bash
git add src/app/law-viewer-page.tsx src/app/law-viewer-page.test.tsx
git commit -m "feat: 条文ビューワーの操作を左右レールへ分業する"
```

---

## Task 7: モバイルのサブバー＋ボトムシート

**Files:**

- Modify: `src/app/law-viewer-page.tsx`
- Modify: `src/app/law-viewer-page.test.tsx`

モバイル（`lg` 未満）で、本文直下に sticky サブバー `[目次] [この条文]` を置き、それぞれ `Sheet side="bottom"` を開く。目次シートの先頭に文書レベル操作（オフライン保存・基準日・条番号ジャンプ）をまとめ、その下に目次。この条文シートに保存／カード／クイズ／ドリフト。既存のモバイル目次トグル（`isMobileTocOpen` の折りたたみ `<div id={tocPanelId}>`）はシートへ置き換える。

**注意（jsdom）:** レスポンシブ class が効かないため、サブバーとレールが共存する。既存の「目次」ボタン（現在はモバイルトグル）を Sheet トリガに変える。開閉状態は `Sheet` の制御 props（`open` / `onOpenChange`）に既存 state を接続する。シートは開いている間だけ内容を mount する（条件レンダーは Sheet 側が管理）。

- [ ] **Step 1: 失敗テストを書く**

`src/app/law-viewer-page.test.tsx` に追加する。`Sheet` は radix Dialog ベースで、開くと `role="dialog"` を出す。

```ts
it("モバイルの目次シートに文書操作と目次が入る", async () => {
  const { user } = renderLawViewerRoute("/laws/129AC0000000089/articles/1");

  await screen.findByRole("article", { name: "民法" });
  await user.click(screen.getByRole("button", { name: "目次" }));

  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByRole("button", { name: "移動" })).toBeInTheDocument();
  expect(
    within(sheet).getByRole("button", { name: /オフライン保存|保存解除/ }),
  ).toBeInTheDocument();
  expect(within(sheet).getByRole("navigation", { name: "法令目次" })).toBeInTheDocument();
});

it("モバイルのこの条文シートに条アクションが入る", async () => {
  const { user } = renderLawViewerRoute("/laws/129AC0000000089/articles/1");

  await screen.findByRole("article", { name: "民法" });
  await user.click(screen.getByRole("button", { name: "この条文" }));

  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByRole("button", { name: "カードを作る" })).toBeInTheDocument();
  expect(within(sheet).getByRole("button", { name: "クイズを生成" })).toBeInTheDocument();
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `pnpm test -- src/app/law-viewer-page.test.tsx`
Expected: FAIL（サブバーの「この条文」ボタンやシートが無い）

- [ ] **Step 3: サブバーとシートを実装する**

`src/app/law-viewer-page.tsx` を変更する。

import に Sheet 一式を追加:

```ts
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
```

state を用意（既存 `isMobileTocOpen` を目次シート用に流用し、この条文シート用を追加）:

```ts
const [isArticleSheetOpen, setIsArticleSheetOpen] = useState(false);
```

本文カラム先頭（`<div className="min-w-0 px-4 py-6 md:px-8">` の直後）にサブバーを置く。既存のモバイル目次トグルボタンおよび折りたたみ `<div id={tocPanelId} hidden={...}>` は削除し、次に置換する:

```tsx
<div className="mb-4 flex flex-wrap items-center gap-2 lg:hidden">
  <Button
    aria-controls={tocPanelId}
    aria-expanded={isMobileTocOpen}
    className="gap-2"
    onClick={() => {
      setIsMobileTocOpen(true);
    }}
    type="button"
    variant="outline"
  >
    <ListTree className="size-4" aria-hidden="true" />
    目次
  </Button>
  <Button
    className="gap-2"
    disabled={activeArticleNumber === undefined}
    onClick={() => {
      setIsArticleSheetOpen(true);
    }}
    type="button"
    variant="outline"
  >
    この条文
  </Button>
</div>
```

目次シート（文書操作＋目次）。本文セクションの後段、既存ダイアログ群の近くに置く:

```tsx
<Sheet onOpenChange={setIsMobileTocOpen} open={isMobileTocOpen}>
  <SheetContent id={tocPanelId} side="bottom" className="max-h-[85dvh] overflow-y-auto">
    <SheetHeader>
      <SheetTitle>目次と操作</SheetTitle>
    </SheetHeader>
    <div className="grid gap-3 px-4 pb-4">
      <form className="grid gap-2" onSubmit={handleJumpSubmit}>
        <label
          className="grid min-w-0 gap-1 text-sm font-medium text-foreground"
          htmlFor={`${articleInputId}-mobile`}
        >
          条番号
          <Input
            autoComplete="off"
            id={`${articleInputId}-mobile`}
            name="article"
            onChange={(event) => {
              setJumpArticleNumber(event.target.value);
              setHasJumpError(false);
            }}
            placeholder="例: 1"
            value={jumpArticleNumber}
          />
        </label>
        <Button className="w-fit" type="submit">
          移動
        </Button>
      </form>
      <Button
        className="w-fit gap-2"
        disabled={isSaving}
        onClick={() => {
          void handleSaveToggle();
        }}
        type="button"
        variant={savedState.isSaved ? "outline" : "default"}
      >
        {savedState.isSaved ? "保存解除" : "オフライン保存"}
      </Button>
      <p className="text-sm leading-display text-muted-foreground">
        基準日 {formatBaseDateLabel(state)} ・ 施行日 {formatEffectiveDateLabel(state.revision)}
      </p>
      <LawTableOfContents
        activeArticleNumber={activeArticleNumber}
        displayMode={displayMode}
        items={tocItems}
        onSelectArticle={navigateToArticle}
      />
    </div>
  </SheetContent>
</Sheet>
```

（`navigateToArticle` は既に `setIsMobileTocOpen(false)` を呼ぶため、条選択でシートが閉じる。）

この条文シート:

```tsx
{
  activeArticleNumber !== undefined ? (
    <Sheet onOpenChange={setIsArticleSheetOpen} open={isArticleSheetOpen}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>第{activeArticleNumber}条の操作</SheetTitle>
        </SheetHeader>
        <div className="grid gap-2 px-4 pb-4">
          <Button
            className="w-full"
            onClick={() => {
              void handleSaveAnchor(activeArticleNumber);
              setIsArticleSheetOpen(false);
            }}
            type="button"
            variant="ghost"
            aria-label="この条文を保存"
          >
            この条文を保存
          </Button>
          {activeNode !== undefined ? (
            <>
              <Button
                className="w-full"
                onClick={() => {
                  setIsArticleSheetOpen(false);
                  setIsCardDialogOpen(true);
                }}
                type="button"
                variant="ghost"
              >
                カードを作る
              </Button>
              <Button
                className="w-full"
                onClick={() => {
                  setIsArticleSheetOpen(false);
                  setIsQuizDialogOpen(true);
                }}
                type="button"
                variant="ghost"
              >
                クイズを生成
              </Button>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  ) : null;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `pnpm test -- src/app/law-viewer-page.test.tsx`
Expected: PASS

既存の「switches structural headings and both table of contents」系テストが「目次」ボタンで2つ目の TOC を得る手順に依存している場合、目次はシート内 TOC として `role="dialog"` 内に出る。`getAllByRole("navigation", { name: "法令目次" })` の件数前提を、シート版に合わせて更新する（デスクトップ左レール TOC ＋シート内 TOC）。

- [ ] **Step 5: 検証ゲート＋実画面確認（モバイル）**

Run: `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test`
Expected: PASS

モバイル幅の実画面を確認する:

```bash
pnpm build && pnpm preview --port 4173 &
playwright-cli open "http://localhost:4173/laws/321CONSTITUTION/articles/9"
playwright-cli resize 390 844
playwright-cli screenshot --filename=/tmp/viewer-mobile-subbar.png
playwright-cli click "getByRole('button', { name: '目次' })"
playwright-cli screenshot --filename=/tmp/viewer-mobile-toc-sheet.png
```

Expected: サブバーに `[目次][この条文]`。目次ボタンでボトムシートが開き、先頭に条番号ジャンプ・オフライン保存・基準日、下に目次が出る。

- [ ] **Step 6: コミット**

```bash
git add src/app/law-viewer-page.tsx src/app/law-viewer-page.test.tsx
git commit -m "feat: 条文ビューワーのモバイル操作をボトムシートへ集約する"
```

---

## 仕上げ

- [ ] `pnpm run typecheck && pnpm run lint && pnpm run format:check && pnpm test` を最終実行して全て PASS。
- [ ] `pnpm run review:antigravity` を実行（`agy` が無ければ skip を記録）。
- [ ] デスクトップ・モバイルのスクリーンショットを PR に添付（`github-image-upload` スキル）。
- [ ] Draft ではない PR を作成し、本文に「動物界における比擬」セクションを設け、`Close`（対応 issue があれば）とユーザー Assign を行う。
