# UI ワイヤーフレーム適用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 承認済みの UI ワイヤーフレーム設計（`docs/superpowers/specs/2026-07-06-ui-wireframe-design.md`）を既存の React コードベースに適用する。

**Architecture:** Tailwind CSS 4 の `@theme` トークンを深緑・生成り・明朝/ゴシックに差し替えたうえで、AppShell を「ヘッダーナビ + 本文」に再構成し、法令ビューワーを「目次 | 本文 | 学習コンテキスト」の 3 カラムへ組み替える。`/jump` はコマンドパレットに統合して廃止する。未実装機能（OCR、復習、設定の各項目）は「準備中」の骨格として意匠のみ適用する。

**Tech Stack:** React 19 / TanStack Router / Tailwind CSS 4 / shadcn/ui スタイルの共通 UI（cmdk 含む）/ Vitest + Testing Library

## Global Constraints

- **Git 操作禁止**: ユーザー指示により、ブランチ作成・コミット・プッシュを一切行わない（通常のコミット手順はこの計画では省略している）。
- **UI 文言は日本語**（CLAUDE.md 第四条）。
- **アクセシブルネームの互換維持**: 既存テストが依存する名前を変えない — `読みやすい表示` / `原文表示`（aria-label `表示モード` の group 内）、`条番号` input + `移動` button、`目次` toggle button、`オフライン保存` / `保存解除` button、`法令目次` navigation、article の `data-active` / `aria-current` 属性。
- **カラートークンはスペック 2.1 の値を逐語コピー**: primary `#166534`、accent 淡 `#dcfce7` / `#f0fdf4`、accent 深 `#14532d`、背景 `#fcfbf8` / `#faf8f2` / `#fffdf9`、罫線 `#e7e0d3` / `#d6cdbc`、墨 `#27272a`、淡墨 `#57534e` / `#78716c` / `#a8a29e`。
- **未実装機能に偽の操作を付けない**: 動かないボタンは `disabled` + 「準備中」表記にする。
- 各タスク完了時に `pnpm run typecheck && pnpm test` が通ること。

---

### Task 1: デザイントークン（深緑・生成り・明朝/ゴシック）

**Files:**

- Modify: `src/index.css`

**Interfaces:**

- Produces: Tailwind ユーティリティ `font-serif`（明朝）、`font-sans`（ゴシック）、および `primary` = 深緑 / `accent` = 淡緑 / `background` = 生成り に差し替わった shadcn 系カラートークン。以降の全タスクがこれを前提にする。

- [ ] **Step 1: `@theme inline` のフォントトークンを差し替え、`--font-serif` を追加**

`src/index.css` の `--font-sans:` 行（7-8行目）を次に置き換える:

```css
--font-sans:
  "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, ui-sans-serif, system-ui,
  sans-serif;
--font-serif: "Hiragino Mincho ProN", "Yu Mincho", "BIZ UDMincho", "Noto Serif JP", ui-serif, serif;
```

- [ ] **Step 2: `:root` のカラーパレットを差し替え**

`:root` ブロック全体を次に置き換える（`--radius` は現状維持）:

```css
:root {
  --radius: 0.625rem;
  --background: #fcfbf8;
  --foreground: #27272a;
  --card: #ffffff;
  --card-foreground: #27272a;
  --popover: #fffdf9;
  --popover-foreground: #27272a;
  --primary: #166534;
  --primary-foreground: #fffdf9;
  --secondary: #faf8f2;
  --secondary-foreground: #57534e;
  --muted: #faf8f2;
  --muted-foreground: #78716c;
  --accent: #dcfce7;
  --accent-foreground: #14532d;
  --destructive: oklch(0.577 0.245 27.325);
  --border: #e7e0d3;
  --input: #d6cdbc;
  --ring: #166534;
  --chart-1: #166534;
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: #dcfce7;
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: #faf8f2;
  --sidebar-foreground: #27272a;
  --sidebar-primary: #166534;
  --sidebar-primary-foreground: #fffdf9;
  --sidebar-accent: #dcfce7;
  --sidebar-accent-foreground: #14532d;
  --sidebar-border: #e7e0d3;
  --sidebar-ring: #166534;
}
```

- [ ] **Step 3: `.dark` のカラーパレットを暫定値で差し替え**

スペック 9 章のとおりダークモードの確定値は残課題である。ライトの深緑と衝突しない暫定値として `.dark` ブロック全体を次に置き換える:

```css
.dark {
  --background: #1c1917;
  --foreground: #fafaf9;
  --card: #292524;
  --card-foreground: #fafaf9;
  --popover: #292524;
  --popover-foreground: #fafaf9;
  --primary: #4ade80;
  --primary-foreground: #052e16;
  --secondary: #292524;
  --secondary-foreground: #fafaf9;
  --muted: #292524;
  --muted-foreground: #a8a29e;
  --accent: #14532d;
  --accent-foreground: #dcfce7;
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: #4ade80;
  --chart-1: #4ade80;
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: #14532d;
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: #292524;
  --sidebar-foreground: #fafaf9;
  --sidebar-primary: #4ade80;
  --sidebar-primary-foreground: #052e16;
  --sidebar-accent: #14532d;
  --sidebar-accent-foreground: #dcfce7;
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: #4ade80;
}
```

- [ ] **Step 4: 回帰確認**

Run: `pnpm run typecheck && pnpm test && pnpm run format:check`
Expected: すべて PASS（CSS 変更はテストの対象外だが、format:check が新 CSS の整形を検証する。format:check が落ちたら `pnpm run format` を実行）

---

### Task 2: AppShell 再構成（ナビをヘッダーへ、左右パネル撤去）

**Files:**

- Modify: `src/app/AppShell.tsx`
- Test: `src/app/AppShell.test.tsx`

**Interfaces:**

- Consumes: Task 1 のトークン（`font-serif`、`bg-accent` = 淡緑）
- Produces: `AppShell`（ヘッダー banner + `main` + モバイル下部ナビのみ。`complementary` ランドマークなし）。ヘッダー検索は Task 3 で `SearchPalette` に置換するまでのダミーボタン。ナビ項目は `法令 /laws`・`撮る /scanner`・`復習 /study`・`設定 /settings` の 4 つ（`ジャンプ` は Task 3 で廃止するためここで除去）。

- [ ] **Step 1: テストを新構造の期待に書き換える**

`src/app/AppShell.test.tsx` 全体を次に置き換える:

```tsx
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMemoryStorageRepository } from "@/test/fixtures/storage";

import { createAppRouter } from "./router";

const primaryNavRoutes = ["法令", "撮る", "復習", "設定"] as const;
const scrollTo = window.scrollTo;

describe("AppShell", () => {
  beforeAll(() => {
    window.scrollTo = () => undefined;
  });

  afterAll(() => {
    window.scrollTo = scrollTo;
  });

  it("renders header and mobile navigation links for main routes", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      for (const label of primaryNavRoutes) {
        expect(screen.getAllByRole("link", { name: label })).toHaveLength(2);
      }
    });
  });

  it("renders header banner and main content without side panels", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByRole("main", { name: "メインコンテンツ" })).toBeInTheDocument();
      expect(
        screen.queryByRole("complementary", { name: "ナビゲーションパネル" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("complementary", { name: "学習パネル" })).not.toBeInTheDocument();
    });
  });

  it("separates active and inactive navigation color classes", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      const activeLinks = screen.getAllByRole("link", { name: "法令" });
      const inactiveLinks = screen.getAllByRole("link", { name: "設定" });

      for (const link of activeLinks) {
        expect(link).toHaveClass("bg-accent");
        expect(link).toHaveClass("text-accent-foreground");
        expect(link).not.toHaveClass("text-muted-foreground");
      }

      for (const link of inactiveLinks) {
        expect(link).toHaveClass("text-muted-foreground");
        expect(link).not.toHaveClass("bg-accent");
      }
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/app/AppShell.test.tsx`
Expected: FAIL（現行 AppShell は `ジャンプ` を含む 5 リンク・complementary パネルありのため）

- [ ] **Step 3: AppShell を書き換える**

`src/app/AppShell.tsx` 全体を次に置き換える:

```tsx
import { Link, Outlet } from "@tanstack/react-router";
import { BookOpen, Camera, GraduationCap, Search, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/utils/cn";

import { PwaUpdatePrompt } from "./PwaUpdatePrompt";

interface NavItem {
  to: "/laws" | "/scanner" | "/study" | "/settings";
  label: string;
  icon: LucideIcon;
}

const primaryNavItems: NavItem[] = [
  { to: "/laws", label: "法令", icon: BookOpen },
  { to: "/scanner", label: "撮る", icon: Camera },
  { to: "/study", label: "復習", icon: GraduationCap },
  { to: "/settings", label: "設定", icon: Settings },
];

const navLinkClassName =
  "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground";
const activeNavLinkClassName = "bg-accent text-accent-foreground";
const inactiveNavLinkClassName = "text-muted-foreground";

const Header = () => (
  <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-popover/95 px-4 backdrop-blur md:px-6">
    <Link
      to="/"
      className="flex min-w-0 items-center gap-2 rounded-md font-serif text-sm font-semibold text-primary outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-md bg-primary font-serif text-sm text-primary-foreground"
      >
        六
      </span>
      <span className="truncate">すらすら六法</span>
    </Link>
    <Button
      type="button"
      variant="outline"
      className="hidden h-9 w-full max-w-sm min-w-0 justify-start gap-2 px-3 font-normal text-muted-foreground md:flex"
    >
      <Search className="size-4" aria-hidden="true" />
      <span className="truncate">国賠法1条、民709、行政手続法14条…</span>
    </Button>
    <nav
      aria-label="グローバルナビゲーション"
      className="ml-auto hidden items-center gap-1 md:flex"
    >
      {primaryNavItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={navLinkClassName}
          activeProps={{ className: activeNavLinkClassName }}
          inactiveProps={{ className: inactiveNavLinkClassName }}
        >
          <item.icon className="size-4" aria-hidden="true" />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  </header>
);

const MobileNavigation = () => (
  <nav
    aria-label="モバイルナビゲーション"
    className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-popover/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-2 backdrop-blur md:hidden"
  >
    {primaryNavItems.map((item) => (
      <Link
        key={item.to}
        to={item.to}
        className={cn(
          "flex h-12 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium",
          "transition-colors hover:bg-accent hover:text-accent-foreground",
        )}
        activeProps={{ className: activeNavLinkClassName }}
        inactiveProps={{ className: inactiveNavLinkClassName }}
      >
        <item.icon className="size-4" aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    ))}
  </nav>
);

export const AppShell = () => (
  <div className="min-h-dvh bg-background font-sans text-foreground">
    <Header />
    <main aria-label="メインコンテンツ" className="min-w-0 pb-20 md:pb-0">
      <Outlet />
    </main>
    <MobileNavigation />
    <PwaUpdatePrompt />
  </div>
);
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test -- src/app/AppShell.test.tsx`
Expected: PASS

- [ ] **Step 5: 全体回帰**

Run: `pnpm run typecheck && pnpm test`
Expected: PASS（router.test の `/jump` は Task 3 まで残るが、ルート自体は未削除なので通る）

---

### Task 3: コマンドパレット新設と `/jump` 廃止

**Files:**

- Create: `src/app/SearchPalette.tsx`
- Test: `src/app/SearchPalette.test.tsx`
- Modify: `src/app/AppShell.tsx`（ダミー検索ボタンを `SearchPalette` に置換）
- Modify: `src/app/router.tsx`（`jumpRoute` 削除）
- Modify: `src/app/pages.tsx`（`JumpPage` 削除）
- Modify: `src/app/router.test.tsx`（`/jump` の行を削除）

**Interfaces:**

- Consumes: `@/shared/ui/command` の `CommandDialog`（props: `open`, `onOpenChange`, `title`, `description`）, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`
- Produces: `SearchPalette`（props なし。ヘッダー用トリガーボタン + ダイアログ。`/` キーでも開く）

- [ ] **Step 1: SearchPalette のテストを書く**

`src/app/SearchPalette.test.tsx` を作成:

```tsx
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { createMemoryStorageRepository } from "@/test/fixtures/storage";

import { createAppRouter } from "./router";

const renderShell = async (initialEntry = "/laws") => {
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const storageRepository = createMemoryStorageRepository().repository;

  render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);
  await screen.findByRole("banner");

  return { history };
};

describe("SearchPalette", () => {
  it("opens the palette from the header trigger and navigates to a destination", async () => {
    const user = userEvent.setup();
    const { history } = await renderShell();

    await user.click(screen.getByRole("button", { name: "検索" }));

    const dialog = await screen.findByRole("dialog", { name: "検索" });
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "今日の復習" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/study");
    });
  });

  it("opens the palette with the slash key", async () => {
    const user = userEvent.setup();
    await renderShell();

    await user.keyboard("/");

    expect(await screen.findByRole("dialog", { name: "検索" })).toBeInTheDocument();
  });

  it("shows a placeholder message for unresolved reference queries", async () => {
    const user = userEvent.setup();
    await renderShell();

    await user.keyboard("/");
    await user.type(screen.getByPlaceholderText("国賠法1条、民709、行政手続法14条…"), "国賠1");

    expect(
      await screen.findByText("条文参照ジャンプ（国賠1、民709 など）は今後対応予定です。"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/app/SearchPalette.test.tsx`
Expected: FAIL（`検索` ボタンが存在しない）

- [ ] **Step 3: SearchPalette を実装**

`src/app/SearchPalette.tsx` を作成:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Camera, GraduationCap, Search, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command";

interface PaletteDestination {
  to: "/laws" | "/scanner" | "/study" | "/settings";
  label: string;
  icon: LucideIcon;
}

const destinations: PaletteDestination[] = [
  { to: "/laws", label: "法令を探す", icon: BookOpen },
  { to: "/scanner", label: "撮って開く", icon: Camera },
  { to: "/study", label: "今日の復習", icon: GraduationCap },
  { to: "/settings", label: "設定", icon: Settings },
];

// 入力欄へのタイプ中に「/」でパレットが開かないよう、編集中の要素を除外する
const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

export const SearchPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setIsOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const navigateTo = (to: PaletteDestination["to"]) => {
    setIsOpen(false);
    void navigate({ to });
  };

  return (
    <>
      <Button
        aria-label="検索"
        type="button"
        variant="outline"
        className="h-9 min-w-0 gap-2 px-3 font-normal text-muted-foreground md:w-full md:max-w-sm md:justify-start"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="hidden truncate md:inline">国賠法1条、民709、行政手続法14条…</span>
        <kbd
          aria-hidden="true"
          className="ml-auto hidden rounded border px-1.5 text-[10px] md:inline"
        >
          /
        </kbd>
      </Button>
      <CommandDialog
        description="法令名や条文参照から目的の条文を開きます"
        onOpenChange={setIsOpen}
        open={isOpen}
        title="検索"
      >
        <CommandInput placeholder="国賠法1条、民709、行政手続法14条…" />
        <CommandList>
          <CommandEmpty>条文参照ジャンプ（国賠1、民709 など）は今後対応予定です。</CommandEmpty>
          <CommandGroup heading="移動">
            {destinations.map((destination) => (
              <CommandItem
                key={destination.to}
                onSelect={() => {
                  navigateTo(destination.to);
                }}
              >
                <destination.icon aria-hidden="true" />
                {destination.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
};
```

- [ ] **Step 4: AppShell のダミー検索ボタンを置換**

`src/app/AppShell.tsx` で:

1. `import { Button } from "@/shared/ui/button";` を削除し、`import { SearchPalette } from "./SearchPalette";` を追加（`Search` アイコンの import も削除）。
2. `Header` 内の `<Button …>…</Button>`（ダミー検索）を `<SearchPalette />` に置き換える。

- [ ] **Step 5: `/jump` ルートと JumpPage を削除**

1. `src/app/router.tsx`: `jumpRoute` の定義（`const jumpRoute = createRoute({...})`）と `addChildren` 配列内の `jumpRoute,` を削除。import の `JumpPage,` も削除。
2. `src/app/pages.tsx`: `JumpPage` のエクスポート（`export const JumpPage = …` のブロック）を削除。
3. `src/app/router.test.tsx`: `routes` 配列から `["/jump", "条文参照を開く"],` の行を削除。

- [ ] **Step 6: テストが通ることを確認**

Run: `pnpm test -- src/app/SearchPalette.test.tsx src/app/AppShell.test.tsx src/app/router.test.tsx`
Expected: PASS

- [ ] **Step 7: 全体回帰**

Run: `pnpm run typecheck && pnpm run lint && pnpm test`
Expected: PASS

---

### Task 4: 法令ビューワーの 3 カラム化

**Files:**

- Modify: `src/app/law-viewer-page.tsx`（`LawViewerReadyState` の JSX を再構成）
- Test: `src/app/law-viewer-page.test.tsx`（学習コンテキストと出典フッターの検証を追加）

**Interfaces:**

- Consumes: 既存の `LawTableOfContents` / `LawDocumentView` / hooks（変更なし）、`Badge`（`@/shared/ui/badge`）
- Produces: デスクトップで `[15rem 目次 | 本文 | 16rem 学習コンテキスト]` の 3 カラム。`aria-label="法令の目次"` の aside、`aria-label="学習コンテキスト"` の aside、`role="contentinfo"` 相当の出典 footer（`<footer>` 要素）。既存のアクセシブルネームはすべて維持。

- [ ] **Step 1: 追加テストを書く**

`src/app/law-viewer-page.test.tsx` の `describe` 内末尾に追加（既存の import で足りる。`renderLawViewerPage` 等の既存ヘルパーの実引数パターンは同ファイル内の既存テストからコピーする — このファイルでは `history` + `RouterProvider` 描画が既存パターン）:

```tsx
it("renders the study context panel and the source footer", async () => {
  const history = createMemoryHistory({ initialEntries: ["/laws/129AC0000000089"] });
  const { fetcher } = createJsonFetchStub(lawDataFixture);
  const lawRepository = createEgovLawRepository({ fetcher, now });
  const storageRepository = createMemoryStorageRepository().repository;

  render(
    <RouterProvider router={createAppRouter({ history, lawRepository, storageRepository })} />,
  );

  expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "学習コンテキスト" })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "法令の目次" })).toBeInTheDocument();
  expect(screen.getByText(/出典: e-Gov 法令検索/)).toBeInTheDocument();
});
```

注意: このファイルが `createAppRouter` / `createMemoryHistory` / `RouterProvider` を import していない場合は、`src/app/router.test.tsx` と同じ import を追加する。既存テストが `LawViewerPageContent` を直接描画するスタイルなら、`state` を `ready` で組み立てる既存ヘルパーに合わせて書き直してよい（検証内容は同じ 4 assertion を保つ）。

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/app/law-viewer-page.test.tsx`
Expected: 追加テストのみ FAIL（`学習コンテキスト` が存在しない）

- [ ] **Step 3: `LawViewerReadyState` の JSX を再構成**

`src/app/law-viewer-page.tsx` の `LawViewerReadyState` の `return` 文を次に置き換える（ロジック・ハンドラー・state はすべて現状維持。`Badge` を import に追加: `import { Badge } from "@/shared/ui/badge";`）:

```tsx
return (
  <>
    <section className="mx-auto grid w-full max-w-7xl lg:grid-cols-[15rem_minmax(0,1fr)_16rem]">
      <aside aria-label="法令の目次" className="hidden border-r bg-muted/40 lg:block">
        <div className="sticky top-14 grid max-h-[calc(100dvh-3.5rem)] content-start gap-3 overflow-y-auto p-4">
          <div className="grid gap-1">
            <p className="font-serif text-base font-semibold text-foreground">{state.law.title}</p>
            {state.law.lawNumber !== undefined ? (
              <p className="text-xs text-muted-foreground">{state.law.lawNumber}</p>
            ) : null}
          </div>
          {savedState.isSaved ? (
            <Badge variant="secondary" className="w-fit">
              オフライン保存済み
            </Badge>
          ) : null}
          <p className="text-[10px] font-medium tracking-widest text-muted-foreground">目次</p>
          <LawTableOfContents
            activeArticleNumber={activeArticleNumber}
            items={tocItems}
            onSelectArticle={navigateToArticle}
          />
        </div>
      </aside>

      <div className="min-w-0 px-4 py-6 md:px-8">
        <div className="mb-4 grid gap-3 rounded-md border bg-card p-3 text-card-foreground shadow-xs md:flex md:flex-wrap md:items-end">
          <div className="grid min-w-0 gap-2">
            <span className="text-sm font-medium text-foreground">表示</span>
            <div
              aria-label="表示モード"
              className="inline-flex w-fit rounded-md border bg-background p-1"
              role="group"
            >
              <Button
                aria-pressed={displayMode === "readable"}
                className="h-8 px-3"
                onClick={() => {
                  setDisplayMode("readable");
                }}
                type="button"
                variant={displayMode === "readable" ? "default" : "ghost"}
              >
                読みやすい表示
              </Button>
              <Button
                aria-pressed={displayMode === "original"}
                className="h-8 px-3"
                onClick={() => {
                  setDisplayMode("original");
                }}
                type="button"
                variant={displayMode === "original" ? "default" : "ghost"}
              >
                原文表示
              </Button>
            </div>
          </div>

          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_auto]"
            onSubmit={handleJumpSubmit}
          >
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
            <Button className="w-fit self-end" type="submit">
              移動
            </Button>
          </form>

          <Button
            aria-controls={tocPanelId}
            aria-expanded={isMobileTocOpen}
            className="w-fit gap-2 lg:hidden"
            onClick={() => {
              setIsMobileTocOpen((current) => !current);
            }}
            type="button"
            variant="outline"
          >
            <ListTree className="size-4" />
            目次
          </Button>

          <div className="grid min-w-0 gap-2 md:ml-auto">
            <span className="text-sm font-medium text-foreground">オフライン</span>
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
          </div>

          {hasArticleError ? <div className="md:w-full">{notFoundAlert}</div> : null}
        </div>

        {saveError !== undefined ? (
          <p
            id={saveErrorId}
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive"
          >
            {saveError}
          </p>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{isOnline ? "オンライン" : "オフライン"}</span>
          {savedState.loadedFromStorage ? (
            <span className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-primary">
              保存済み本文を表示中
            </span>
          ) : null}
          {savedState.savedAt !== undefined ? (
            <span>保存日時: {savedState.savedAt.slice(0, 10)}</span>
          ) : null}
        </div>

        <div
          id={tocPanelId}
          className="mb-4 rounded-md border bg-card p-3 shadow-xs lg:hidden"
          hidden={!isMobileTocOpen}
        >
          <LawTableOfContents
            activeArticleNumber={activeArticleNumber}
            items={tocItems}
            onSelectArticle={navigateToArticle}
          />
        </div>

        <LawDocumentView
          activeArticleNumber={activeArticleNumber}
          displayMode={displayMode}
          isSaved={savedState.isSaved}
          law={state.law}
          nodes={state.nodes}
          revision={state.revision}
        />
      </div>

      <aside aria-label="学習コンテキスト" className="hidden border-l bg-muted/40 lg:block">
        <div className="sticky top-14 grid max-h-[calc(100dvh-3.5rem)] content-start gap-3 overflow-y-auto p-4 text-sm">
          <p className="text-xs text-muted-foreground">
            選択中:{" "}
            <span className="font-medium text-primary">
              {activeArticleNumber === undefined ? "なし" : `第${activeArticleNumber}条`}
            </span>
          </p>
          {(["メモ", "定義語", "関連条文", "復習カード"] as const).map((panelTitle) => (
            <section key={panelTitle} className="rounded-md border bg-card p-3">
              <h2 className="text-sm font-medium text-foreground">{panelTitle}</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">準備中</p>
            </section>
          ))}
          <div className="grid gap-2 border-t pt-3">
            <Button disabled type="button" className="w-full">
              復習カードを作る（準備中）
            </Button>
            <Button disabled type="button" variant="outline" className="w-full">
              ブックマーク（準備中）
            </Button>
          </div>
        </div>
      </aside>
    </section>

    <footer className="border-t bg-popover px-4 py-2 text-xs text-muted-foreground md:px-6">
      出典: e-Gov 法令検索 ・ 取得 {getDisplaySourceDate(state.revision.fetchedAt)} ・
      読みやすい表示は原文に表示上の加工を含みます（「原文表示」で確認できます）
    </footer>
  </>
);
```

ファイル末尾（`LawViewerOfflineState` の後）にヘルパーを追加:

```tsx
const getDisplaySourceDate = (fetchedAt: string): string =>
  typeof fetchedAt === "string" && fetchedAt.length >= 10 ? fetchedAt.slice(0, 10) : "不明";
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test -- src/app/law-viewer-page.test.tsx src/app/router.test.tsx`
Expected: PASS（既存のアクセシブルネームはすべて温存しているため、既存テストも通る。落ちた場合は名前の変化を疑い、JSX 側を直す — テストを弱めない）

- [ ] **Step 5: 全体回帰**

Run: `pnpm run typecheck && pnpm test`
Expected: PASS

---

### Task 5: 条文・目次の佇まい（明朝、カード廃止、ブラケット選択）

**Files:**

- Modify: `src/core/viewer/LawNodeList.tsx`
- Modify: `src/core/viewer/LawDocumentView.tsx`
- Modify: `src/core/viewer/LawTableOfContents.tsx`

**Interfaces:**

- Consumes: Task 1 の `font-serif` ユーティリティ
- Produces: 条カードの枠・影を廃止し、選択中の条は左余白ブラケット（`aria-hidden` の装飾 span）。`data-active` / `aria-current` / マーカーの `text-muted-foreground` クラスは既存テストの契約なので維持。

- [ ] **Step 1: LawNodeList の Article 描画をブラケット方式に変更**

`src/core/viewer/LawNodeList.tsx` の `case "Article":` 内の `return` を次に置き換える（変数定義部は現状維持）:

```tsx
return (
  <article
    id={articleId}
    data-active={isActiveArticle ? "true" : undefined}
    aria-current={isActiveArticle ? "location" : undefined}
    aria-label={node.title ?? `条文 ${node.number ?? node.path}`}
    className="relative scroll-mt-20 py-4 md:py-5"
  >
    {isActiveArticle ? (
      <span
        aria-hidden="true"
        className="absolute top-4 bottom-4 -left-4 w-2 rounded-l-xs border-y-2 border-l-2 border-primary md:-left-6"
      />
    ) : null}
    <Heading className="font-serif text-lg font-semibold text-foreground">{displayTitle}</Heading>
    <div className="mt-4 grid gap-3">
      {children.length > 0 ? (
        renderChildBlocks({
          activeArticleNumber,
          children,
          depth,
          displayMode,
          isUrlAddressableArticleContext: childArticleContext,
          nodeById,
        })
      ) : (
        <p className="font-serif leading-8 text-foreground break-words">{displayText}</p>
      )}
    </div>
  </article>
);
```

- [ ] **Step 2: Paragraph/Item/Subitem と見出し・本文を明朝化**

同ファイルで次の 3 か所を変更する:

1. `case "Paragraph": case "Item": case "Subitem":` 内の本文 `<p>`:

```tsx
          <p className="flex min-w-0 gap-3 font-serif leading-8 text-foreground">
```

（内側の `<span className="shrink-0 text-muted-foreground">` は変更しない — テスト契約）

2. 構造見出し（switch 後のフォールバック部）の `Heading`:

```tsx
        <Heading className={cn("font-serif text-foreground break-words", headingClassName)}>
```

3. 同フォールバック部の本文 `<p>`:

```tsx
{
  bodyText !== "" ? (
    <p className="font-serif leading-8 text-foreground break-words">{bodyText}</p>
  ) : null;
}
```

- [ ] **Step 3: LawDocumentView の法令名を明朝化**

`src/core/viewer/LawDocumentView.tsx` の `<h1>` の className を次に変更:

```tsx
          <h1 className="min-w-0 font-serif text-2xl font-semibold text-foreground break-words md:text-3xl">
```

- [ ] **Step 4: 目次を明朝 + 左バー選択に変更**

`src/core/viewer/LawTableOfContents.tsx` の `TocItem` 内、条ボタンの `className` と本文 span、非条ラベルを次に変更:

```tsx
<Button
  aria-current={isActiveArticle ? "location" : undefined}
  className={cn(
    "h-auto min-w-0 justify-start rounded-none border-l-2 border-transparent px-2 py-1.5 text-left whitespace-normal",
    isActiveArticle && "border-primary bg-accent text-accent-foreground",
  )}
  onClick={() => {
    onSelectArticle(articleNumber);
  }}
  type="button"
  variant="ghost"
>
  <span className="min-w-0 font-serif break-words">{item.title}</span>
</Button>
```

非条ラベル（`<span className="block …">`）:

```tsx
<span className="block min-w-0 px-2 py-1.5 font-serif text-sm font-medium text-foreground break-words">
  {item.title}
</span>
```

- [ ] **Step 5: viewer 系テストの回帰確認**

Run: `pnpm test -- src/core/viewer src/app/law-viewer-page.test.tsx`
Expected: PASS（`data-active`・`aria-current`・マーカーのクラス・見出し名は温存している）

---

### Task 6: Home（ランチャー + ダッシュボード、空状態退化）

**Files:**

- Create: `src/app/home-page.tsx`
- Test: `src/app/home-page.test.tsx`
- Modify: `src/app/pages.tsx`（旧 `HomePage` を削除し re-export に変更）
- Modify: `src/app/router.tsx`（`HomePage` に `storageRepository` を渡す）
- Modify: `src/app/router.test.tsx`（`/` の期待見出しを変更）

**Interfaces:**

- Consumes: `createSavedLawUseCase` / `createStorageRepository`（`@/core/storage`、LawsPage と同じ読み込みパターン）
- Produces: `HomePage({ storageRepository?: StorageRepository })`。保存済み法令が 0 件なら「よく読まれている法令」チップ、1 件以上ならダッシュボードカードを表示。

- [ ] **Step 1: テストを書く**

`src/app/home-page.test.tsx` を作成:

```tsx
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";

import { sampleLawViewerDocument } from "./law-viewer-sample";
import { createAppRouter } from "./router";

const renderHome = (storageRepository = createMemoryStorageRepository().repository) => {
  const history = createMemoryHistory({ initialEntries: ["/"] });

  render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);
};

describe("HomePage", () => {
  it("renders the launcher with featured law chips when no data is saved", async () => {
    renderHome();

    expect(
      await screen.findByRole("heading", { name: "撮って、開いて、すらすら読める。" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "日本国憲法" })).toHaveAttribute(
      "href",
      "/laws/321CONSTITUTION",
    );
    expect(screen.getByRole("link", { name: "刑法" })).toHaveAttribute(
      "href",
      "/laws/140AC0000000045",
    );
    expect(screen.queryByRole("heading", { name: "オフライン保存済み" })).not.toBeInTheDocument();
  });

  it("renders the dashboard with saved laws when data exists", async () => {
    const storage = createMemoryStorageRepository(
      createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    );

    renderHome(storage.repository);

    expect(await screen.findByRole("heading", { name: "オフライン保存済み" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "民法" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089",
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/app/home-page.test.tsx`
Expected: FAIL（見出しが旧 `今日の条文へ進む` のまま）

- [ ] **Step 3: HomePage を実装**

`src/app/home-page.tsx` を作成:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, ClipboardPaste, GraduationCap, Search } from "lucide-react";

import { createSavedLawUseCase, createStorageRepository } from "@/core/storage";
import type { SavedLawSummary, StorageRepository } from "@/core/storage";
import { Button } from "@/shared/ui/button";

const defaultStorageRepository = createStorageRepository();

// 初回起動時のコールドスタート対策として提示する定番法令（e-Gov lawId）
const featuredLaws = [
  { lawId: "321CONSTITUTION", title: "日本国憲法" },
  { lawId: "129AC0000000089", title: "民法" },
  { lawId: "140AC0000000045", title: "刑法" },
] as const;

export const HomePage = ({
  storageRepository = defaultStorageRepository,
}: {
  storageRepository?: StorageRepository;
}) => {
  const [savedLaws, setSavedLaws] = useState<SavedLawSummary[]>([]);
  const savedLawUseCase = useMemo(
    () => createSavedLawUseCase(storageRepository),
    [storageRepository],
  );

  useEffect(() => {
    let isCurrent = true;

    void savedLawUseCase
      .list()
      .then((nextSavedLaws) => {
        if (isCurrent) {
          setSavedLaws(nextSavedLaws);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSavedLaws([]);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [savedLawUseCase]);

  const hasSavedLaws = savedLaws.length > 0;

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-10 px-5 py-12 md:py-16">
      <div className="grid justify-items-center gap-4 text-center">
        <h1 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">
          撮って、開いて、すらすら読める。
        </h1>
        <p className="text-sm text-muted-foreground">e-Gov 法令データに基づく法令ビューワー</p>
        <Button asChild variant="outline" className="h-11 w-full max-w-md justify-start gap-2">
          <Link to="/laws">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-muted-foreground">
              国賠法1条、民709、行政手続法14条…
            </span>
          </Link>
        </Button>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/scanner">
              <Camera className="size-4" aria-hidden="true" />
              撮って開く
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/scanner">
              <ClipboardPaste className="size-4" aria-hidden="true" />
              貼り付けて開く
            </Link>
          </Button>
        </div>
      </div>

      {hasSavedLaws ? (
        <div className="grid gap-4">
          <Button asChild className="h-auto justify-start gap-3 py-3">
            <Link to="/study">
              <GraduationCap className="size-5" aria-hidden="true" />
              <span className="grid text-left">
                <span className="font-semibold">復習を始める</span>
                <span className="text-xs opacity-75">復習機能は準備中です</span>
              </span>
            </Link>
          </Button>
          <section aria-labelledby="home-saved-laws-heading" className="grid gap-3">
            <h2 id="home-saved-laws-heading" className="text-lg font-semibold text-foreground">
              オフライン保存済み
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {savedLaws.map((savedLaw) => (
                <li key={savedLaw.law.lawId} className="rounded-md border bg-card p-4">
                  <Link
                    className="font-serif text-base font-semibold text-foreground underline-offset-4 hover:underline"
                    params={{ lawId: savedLaw.law.lawId }}
                    to="/laws/$lawId"
                  >
                    {savedLaw.law.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {savedLaw.nodeCount.toLocaleString("ja-JP")} ノード
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="grid justify-items-center gap-3 text-center">
          <p className="text-xs tracking-widest text-muted-foreground">よく読まれている法令</p>
          <div className="flex flex-wrap justify-center gap-2">
            {featuredLaws.map((law) => (
              <Button asChild key={law.lawId} variant="outline" className="rounded-full font-serif">
                <Link params={{ lawId: law.lawId }} to="/laws/$lawId">
                  {law.title}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
```

- [ ] **Step 4: pages.tsx と router.tsx を接続**

1. `src/app/pages.tsx`: `export const HomePage = …` のブロックを削除し、末尾の `export { LawViewerPage } from "./law-viewer-page";` の隣に `export { HomePage } from "./home-page";` を追加。
2. `src/app/router.tsx`: `indexRoute` を次に変更:

```tsx
const HomeRoute = () => <HomePage storageRepository={storageRepository} />;

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeRoute,
});
```

3. `src/app/router.test.tsx`: `routes` 配列の `["/", "今日の条文へ進む"],` を `["/", "撮って、開いて、すらすら読める。"],` に変更。

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm test -- src/app/home-page.test.tsx src/app/router.test.tsx`
Expected: PASS

- [ ] **Step 6: 全体回帰**

Run: `pnpm run typecheck && pnpm test`
Expected: PASS

---

### Task 7: 撮る・復習・設定・法令検索ページの意匠

**Files:**

- Modify: `src/app/pages.tsx`（`ScannerPage` / `StudyPage` / `SettingsPage` の再実装、`LawsPage` の見出し明朝化、不要になった `PagePanel` の削除）
- Modify: `src/app/router.test.tsx`（期待見出しの更新）

**Interfaces:**

- Consumes: Task 1 のトークン
- Produces: 各ページの h1 — `/scanner`: `問題集や資料から条文を開く`、`/study`: `復習`、`/settings`: `設定`。機能は未実装のため操作要素はすべて `disabled` + 「準備中」。

- [ ] **Step 1: router.test の期待見出しを更新**

`src/app/router.test.tsx` の `routes` 配列を次に変更:

```tsx
const routes = [
  ["/", "撮って、開いて、すらすら読める。"],
  ["/laws", "法令を探す"],
  ["/laws/129AC0000000089", "民法"],
  ["/laws/129AC0000000089/articles/1", "民法"],
  ["/scanner", "問題集や資料から条文を開く"],
  ["/study", "復習"],
  ["/settings", "設定"],
] as const;
```

同ファイルの `uses theme-aware text classes on route placeholder content` テストから `expect(screen.getByText("Laws")).toHaveClass("text-primary");` の行を削除する（eyebrow は廃止するため）。

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm test -- src/app/router.test.tsx`
Expected: FAIL（`/scanner` などの見出しが旧文言のまま）

- [ ] **Step 3: pages.tsx の 3 ページを差し替える**

`src/app/pages.tsx` で `PagePanel`・`ScannerPage`・`StudyPage`・`SettingsPage` を削除し、次を追加する。`LawsPage` は `<p className="text-sm font-medium text-primary">Laws</p>` の行を削除し、`<h1>` の className に `font-serif` を追加する。import は `BookOpenCheck` に加えて `Camera` を `lucide-react` から、`Button` を `@/shared/ui/button` から追加する:

```tsx
export const ScannerPage = () => (
  <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-12 text-center">
    <h1 className="font-serif text-2xl font-semibold text-foreground">
      問題集や資料から条文を開く
    </h1>
    <p className="text-xs text-muted-foreground">🔒 画像は端末内で処理され、保存・送信されません</p>
    <Button disabled type="button" className="h-auto w-full flex-col gap-1 py-8">
      <Camera className="size-6" aria-hidden="true" />
      <span className="font-semibold">撮る・画像を選ぶ（準備中）</span>
      <span className="text-xs opacity-75">カメラかライブラリを選択できます</span>
    </Button>
    <Button disabled type="button" variant="outline" className="w-full">
      クリップボードから貼り付け（準備中）
    </Button>
  </section>
);

export const StudyPage = () => (
  <section className="mx-auto grid w-full max-w-2xl gap-4 px-5 py-10">
    <h1 className="font-serif text-2xl font-semibold text-foreground">復習</h1>
    <div className="rounded-md bg-primary p-4 text-primary-foreground">
      <p className="font-semibold">今日の復習</p>
      <p className="mt-1 text-xs opacity-75">復習カード機能は準備中です</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {(["苦手な条文", "カードの内訳", "科目別プリセット"] as const).map((title) => (
        <section key={title} className="rounded-md border bg-card p-4">
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">準備中</p>
        </section>
      ))}
    </div>
  </section>
);

interface SettingsRow {
  label: string;
  value: string;
}

interface SettingsGroup {
  heading: string;
  rows: SettingsRow[];
}

const settingsGroups: SettingsGroup[] = [
  {
    heading: "表示",
    rows: [
      { label: "文字サイズ", value: "標準" },
      { label: "行間", value: "ゆったり" },
      { label: "テーマ", value: "自動" },
      { label: "既定の表示", value: "読みやすい表示" },
    ],
  },
  {
    heading: "学習",
    rows: [
      { label: "学習年度の基準日", value: "未設定" },
      { label: "科目プリセット", value: "未設定" },
    ],
  },
  {
    heading: "データ",
    rows: [
      { label: "オフライン保存の管理", value: "準備中" },
      { label: "エクスポート / インポート", value: "準備中" },
      { label: "ときどき六法と連携", value: "未接続" },
    ],
  },
];

export const SettingsPage = () => (
  <section className="mx-auto grid w-full max-w-2xl gap-6 px-5 py-10">
    <h1 className="font-serif text-2xl font-semibold text-foreground">設定</h1>
    {settingsGroups.map((group) => (
      <section key={group.heading} className="grid gap-2">
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground">
          {group.heading}
        </h2>
        <div className="divide-y rounded-md border bg-card">
          {group.rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-foreground">{row.label}</span>
              <span className="text-muted-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      </section>
    ))}
    <p className="text-center text-xs text-muted-foreground">
      すらすら六法 ・ 法令データ: e-Gov 法令検索
      <br />
      本アプリは学習補助であり、法的助言を提供するものではありません
    </p>
  </section>
);
```

現時点で各設定項目は未実装のため、行は表示のみ（操作なし）とする。

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm test -- src/app/router.test.tsx`
Expected: PASS

- [ ] **Step 5: 全体回帰**

Run: `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run format:check`
Expected: PASS（format:check が落ちたら `pnpm run format`）

---

### Task 8: ブラウザ検証（CLAUDE.md 第七条）

**Files:** なし（検証のみ）

- [ ] **Step 1: 開発サーバーを起動**

Run: `pnpm dev`（バックグラウンド）
Expected: `Local: http://localhost:5173/` が表示される

- [ ] **Step 2: `playwright-cli open --headed` で全ルートを目視確認**

`playwright-cli open --headed http://localhost:5173/` で開き、`goto` で `/`、`/laws`、`/laws/129AC0000000089`（オンラインなら e-Gov から民法を取得）、`/scanner`、`/study`、`/settings` を巡回し、各画面でスクリーンショットを撮る。確認観点:

- ヘッダー: ロゴが明朝 + 深緑、ナビ 4 項目、検索トリガー
- `/` : ランチャー + よく読まれている法令チップ（空状態）
- ビューワー: 3 カラム、目次と本文が明朝、条番号ジャンプで対象条文に深緑ブラケットが付く、フッターに出典
- パレット: `/` キーで開き、`今日の復習` 選択で `/study` へ遷移
- コンソールにエラーが出ていないこと（`playwright-cli console` 相当の出力確認）

- [ ] **Step 3: モバイル幅の確認**

ビューポートを 390x844 に変更し、`/` と `/laws/129AC0000000089` で下部ナビ 4 項目と 1 カラム表示（目次はトグル開閉）を確認してスクリーンショットを撮る。

- [ ] **Step 4: 後片付け**

ブラウザセッションと開発サーバーを停止する。

---

## Self-Review 結果

- スペック 2 章（トークン）→ Task 1、3 章（ビューワー）→ Task 4/5、4 章（Home）→ Task 6、5 章（検索 2 層）→ Task 3（パレット。検索結果ページは既存 `/laws` を暫定の入口として維持）、6〜8 章（撮る/復習/設定）→ Task 7、10 章（実装への影響）→ Task 2/3。
- スペック 5 章の「検索結果ページ（本文横断検索）」は検索機能自体が未実装（M1 以降）のため本計画では対象外。スペック 9 章の残課題（モバイル詳細・ダークモード確定値）も対象外。
- 型・名前の整合: `SearchPalette`（Task 3 定義 → Task 3 Step 4 で使用）、`HomePage({ storageRepository })`（Task 6 定義 → router 接続）、`getDisplaySourceDate`（Task 4 内で完結）を確認済み。
