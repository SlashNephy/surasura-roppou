# Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue #8 の合意済み設計に従い、すらすら六法の Vite + React + TypeScript フロントエンド基盤、AppShell、主要 route、PWA manifest、品質チェック、CI を実装する。

**Architecture:** `src/app` に起動、router、route 定義、AppShell を置く。`src/shared/ui` は shadcn/ui 由来の基本部品、`src/shared/utils` は `cn()` のような純粋ユーティリティだけを持つ。Issue #8 では実データ取得や Service Worker を入れず、静的な AppShell skeleton と route 入口を作る。

**Tech Stack:** pnpm、mise、Vite、React、TypeScript strict、TanStack Router、Tailwind CSS、shadcn/ui、Radix UI primitives、lucide-react、Vitest、Testing Library、ESLint、Prettier、GitHub Actions。

---

## Files

- Create: `.mise.toml`
- Create: `.npmrc`
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `components.json`
- Create: `public/manifest.webmanifest`
- Create: `public/pwa.svg`
- Create: `.github/workflows/check.yml`
- Create: `src/main.tsx`
- Create: `src/index.css`
- Create: `src/vite-env.d.ts`
- Create: `src/test/setup.ts`
- Create: `src/app/router.tsx`
- Create: `src/app/router.test.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/app/AppShell.test.tsx`
- Create: `src/app/pages.tsx`
- Create: `src/shared/utils/cn.ts`
- Create: `src/shared/utils/cn.test.ts`
- Create: `src/shared/ui/*` through the shadcn/ui CLI
- Modify: `README.md`

## Task 1: Toolchain and Package Scripts

**Files:**
- Create: `.mise.toml`
- Create: `.npmrc`
- Create: `package.json`
- Create: `.prettierrc.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`

- [ ] **Step 1: Add toolchain files**

Create `.mise.toml`:

```toml
[tools]
node = "22.12.0"
```

Create `.npmrc`:

```ini
engine-strict=true
auto-install-peers=true
```

- [ ] **Step 2: Add package metadata and scripts**

Create `package.json`:

```json
{
  "name": "surasura-roppou",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint .",
    "format": "prettier . --write",
    "format:check": "prettier . --check",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

Create `.prettierrc.json`:

```json
{
  "printWidth": 100,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all"
}
```

- [ ] **Step 3: Add TypeScript project references**

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

Create `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "eslint.config.js"]
}
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
mise install
corepack enable
corepack prepare pnpm@latest --activate
pnpm pkg set packageManager="pnpm@$(pnpm --version)"
pnpm add @tanstack/react-router react react-dom lucide-react class-variance-authority clsx tailwind-merge tw-animate-css
pnpm add -D @vitejs/plugin-react @tailwindcss/vite tailwindcss @eslint/js @testing-library/jest-dom @testing-library/react @types/node @types/react @types/react-dom eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals jsdom prettier typescript typescript-eslint vite vitest
```

Expected:

```text
pnpm-lock.yaml is created and package.json has non-empty dependencies and devDependencies.
```

- [ ] **Step 5: Verify scripts exist**

Run:

```bash
pnpm run typecheck
```

Expected: FAIL because app source files do not exist yet. The failure should be about missing inputs or config, not package installation.

- [ ] **Step 6: Commit**

Run:

```bash
git add .mise.toml .npmrc package.json pnpm-lock.yaml .prettierrc.json tsconfig.json tsconfig.app.json tsconfig.node.json
git commit -m "chore: フロントエンドのツールチェーンを追加"
```

## Task 2: Vite, Tailwind, Test Setup, and `cn`

**Files:**
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `eslint.config.js`
- Create: `src/index.css`
- Create: `src/vite-env.d.ts`
- Create: `src/test/setup.ts`
- Create: `src/shared/utils/cn.ts`
- Create: `src/shared/utils/cn.test.ts`

- [ ] **Step 1: Write the failing utility test**

Create `src/shared/utils/cn.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("merges conditional class names and resolves Tailwind conflicts", () => {
    expect(cn("px-2 text-zinc-900", false && "hidden", "px-4")).toBe("text-zinc-900 px-4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/shared/utils/cn.test.ts
```

Expected: FAIL because `src/shared/utils/cn.ts` does not exist.

- [ ] **Step 3: Add Vite and Vitest config**

Create `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
```

Create `index.html`:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#4f46e5" />
    <meta
      name="description"
      content="すらすら六法は、法令を読みやすく閲覧し、条文参照をすぐ確認できる Web/PWA アプリです。"
    />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>すらすら六法</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add Tailwind CSS entrypoint**

Create `src/index.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";

@theme {
  --font-sans:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --color-background: oklch(0.985 0 0);
  --color-foreground: oklch(0.21 0.006 285.885);
  --color-primary: oklch(0.511 0.262 276.966);
  --color-primary-foreground: oklch(0.98 0.016 73.684);
  --color-accent: oklch(0.879 0.169 91.605);
  --color-accent-foreground: oklch(0.279 0.077 45.635);
}

html {
  color-scheme: light;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
}

button,
input,
textarea,
select {
  font: inherit;
}
```

- [ ] **Step 5: Add ESLint config**

Create `eslint.config.js`:

```js
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.app.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
```

- [ ] **Step 6: Implement `cn`**

Create `src/shared/utils/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

- [ ] **Step 7: Run tests and checks**

Run:

```bash
pnpm test src/shared/utils/cn.test.ts
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

Expected: `cn` test passes. `typecheck`, `lint`, and `format:check` pass after formatting any generated file with `pnpm format`.

- [ ] **Step 8: Commit**

Run:

```bash
git add index.html vite.config.ts eslint.config.js src/index.css src/vite-env.d.ts src/test/setup.ts src/shared/utils/cn.ts src/shared/utils/cn.test.ts
git commit -m "chore: Vite と品質チェックの基盤を追加"
```

## Task 3: Router and Route Rendering

**Files:**
- Create: `src/main.tsx`
- Create: `src/app/router.tsx`
- Create: `src/app/router.test.tsx`
- Create: `src/app/pages.tsx`

- [ ] **Step 1: Write failing route rendering tests**

Create `src/app/router.test.tsx`:

```tsx
import { RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createAppRouter } from "./router";

const routes = [
  ["/", "今日の条文へ進む"],
  ["/laws", "法令を探す"],
  ["/jump", "条文参照を開く"],
  ["/scanner", "条文参照を撮る"],
  ["/study", "復習を始める"],
  ["/settings", "設定を調整する"],
] as const;

describe("app router", () => {
  it.each(routes)("renders %s", async (path, heading) => {
    window.history.pushState({}, "", path);

    render(<RouterProvider router={createAppRouter()} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/app/router.test.tsx
```

Expected: FAIL because `src/app/router.tsx` does not exist.

- [ ] **Step 3: Add page skeletons**

Create `src/app/pages.tsx`:

```tsx
type Page = {
  title: string;
  description: string;
  eyebrow: string;
};

const PagePanel = ({ title, description, eyebrow }: Page) => (
  <section className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-3xl flex-col justify-center gap-4 px-5 py-10 md:min-h-[calc(100vh-4rem)]">
    <p className="text-sm font-medium text-indigo-700">{eyebrow}</p>
    <h1 className="text-3xl font-semibold tracking-normal text-zinc-950 md:text-4xl">{title}</h1>
    <p className="max-w-2xl text-base leading-7 text-zinc-700">{description}</p>
  </section>
);

export const HomePage = () => (
  <PagePanel
    eyebrow="Home"
    title="今日の条文へ進む"
    description="最近開いた条文、保存済み法令、今日の復習へ戻るための入口です。"
  />
);

export const LawsPage = () => (
  <PagePanel
    eyebrow="Laws"
    title="法令を探す"
    description="法令名、略称、法令番号から目的の法令へ進むための入口です。"
  />
);

export const JumpPage = () => (
  <PagePanel
    eyebrow="Jump"
    title="条文参照を開く"
    description="国賠法1条や民709のような参照表記を入力して、該当条文へ進むための入口です。"
  />
);

export const ScannerPage = () => (
  <PagePanel
    eyebrow="Scanner"
    title="条文参照を撮る"
    description="画像やカメラから条文参照を検出する将来機能の入口です。"
  />
);

export const StudyPage = () => (
  <PagePanel
    eyebrow="Study"
    title="復習を始める"
    description="保存した条文や苦手な論点を復習するための入口です。"
  />
);

export const SettingsPage = () => (
  <PagePanel
    eyebrow="Settings"
    title="設定を調整する"
    description="表示、基準日、オフライン保存、学習設定を調整するための入口です。"
  />
);
```

- [ ] **Step 4: Add code-based route tree**

Create `src/app/router.tsx`:

```tsx
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import {
  HomePage,
  JumpPage,
  LawsPage,
  ScannerPage,
  SettingsPage,
  StudyPage,
} from "./pages";

const Root = () => <Outlet />;

const rootRoute = createRootRoute({
  component: Root,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const lawsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "laws",
  component: LawsPage,
});

const jumpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "jump",
  component: JumpPage,
});

const scannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "scanner",
  component: ScannerPage,
});

const studyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "study",
  component: StudyPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  lawsRoute,
  jumpRoute,
  scannerRoute,
  studyRoute,
  settingsRoute,
]);

export const createAppRouter = () => createRouter({ routeTree });

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

Create `src/main.tsx`:

```tsx
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { router } from "./app/router";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

- [ ] **Step 5: Run route tests and checks**

Run:

```bash
pnpm test src/app/router.test.tsx
pnpm run typecheck
pnpm run lint
```

Expected: Route tests pass and static checks pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/main.tsx src/app/router.tsx src/app/router.test.tsx src/app/pages.tsx
git commit -m "feat: 主要画面のルーティングを追加"
```

## Task 4: shadcn/ui Foundation

**Files:**
- Create: `components.json`
- Create: `src/shared/ui/*`
- Modify: `src/index.css`
- Modify: `vite.config.ts`
- Modify: `tsconfig.app.json`

- [ ] **Step 1: Initialize shadcn/ui**

Run:

```bash
pnpm dlx shadcn@latest init
```

Answer prompts with:

```text
Style: New York
Base color: Zinc
CSS file: src/index.css
CSS variables: yes
Import alias: @/*
Components alias: @/shared/ui
Utils alias: @/shared/utils/cn
```

Expected: `components.json` is created and `src/index.css`, `vite.config.ts`, or TypeScript alias files are updated.

- [ ] **Step 2: Add agreed UI components**

Run:

```bash
pnpm dlx shadcn@latest add button input card badge separator sheet scroll-area command skeleton sonner breadcrumb resizable
```

Expected: component files are generated under `src/shared/ui`.

- [ ] **Step 3: Normalize generated imports**

Inspect generated files:

```bash
rg -n "@/lib/utils|@/components/ui" src/shared/ui components.json
```

Expected: no matches. If the CLI generated `@/lib/utils`, replace it with `@/shared/utils/cn`. If it generated `@/components/ui`, replace it with `@/shared/ui`.

- [ ] **Step 4: Run checks**

Run:

```bash
pnpm run format
pnpm run typecheck
pnpm run lint
pnpm test
```

Expected: all checks pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add components.json src/index.css src/shared/ui vite.config.ts tsconfig.app.json package.json pnpm-lock.yaml
git commit -m "feat: shadcn/ui の基盤を追加"
```

## Task 5: AppShell Skeleton

**Files:**
- Modify: `src/app/router.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/app/AppShell.test.tsx`
- Modify: `src/app/pages.tsx`

- [ ] **Step 1: Write failing AppShell tests**

Create `src/app/AppShell.test.tsx`:

```tsx
import { RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createAppRouter } from "./router";

describe("AppShell", () => {
  it("shows desktop and mobile navigation entries for the main routes", () => {
    window.history.pushState({}, "", "/");

    render(<RouterProvider router={createAppRouter()} />);

    for (const name of ["法令", "ジャンプ", "撮る", "復習", "設定"]) {
      expect(screen.getAllByRole("link", { name })).toHaveLength(2);
    }
  });

  it("shows the three desktop panes", () => {
    window.history.pushState({}, "", "/laws");

    render(<RouterProvider router={createAppRouter()} />);

    expect(screen.getByRole("complementary", { name: "ナビゲーションパネル" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "メインコンテンツ" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "学習パネル" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/app/AppShell.test.tsx
```

Expected: FAIL because `AppShell` is not part of the root route yet.

- [ ] **Step 3: Implement AppShell**

Create `src/app/AppShell.tsx`:

```tsx
import { Link, Outlet } from "@tanstack/react-router";
import {
  BookOpen,
  Camera,
  GraduationCap,
  Home,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";

const primaryNav = [
  { to: "/laws", label: "法令", icon: BookOpen },
  { to: "/jump", label: "ジャンプ", icon: Search },
  { to: "/scanner", label: "撮る", icon: Camera },
  { to: "/study", label: "復習", icon: GraduationCap },
  { to: "/settings", label: "設定", icon: Settings },
] as const;

const desktopPanelItems = ["目次", "検索結果", "保存済み"];
const studyPanelItems = ["メモ", "定義語", "復習カード"];

export const AppShell = () => (
  <div className="min-h-screen bg-zinc-50 text-zinc-950">
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50/95 px-4 backdrop-blur md:px-6">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3 font-semibold" aria-label="ホーム">
          <span className="flex size-9 items-center justify-center rounded-md bg-indigo-600 text-white">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
          <span>すらすら六法</span>
        </Link>
        <div className="hidden min-w-0 flex-1 justify-center md:flex">
          <Button variant="outline" className="w-full max-w-md justify-start text-zinc-500">
            <Search className="size-4" aria-hidden="true" />
            国賠法1条、民709、行政手続法14条
          </Button>
        </div>
        <Badge variant="secondary" className="hidden md:inline-flex">
          基盤構築中
        </Badge>
      </div>
    </header>

    <div className="mx-auto hidden h-[calc(100vh-4rem)] max-w-7xl grid-cols-[18rem_minmax(0,1fr)_18rem] md:grid">
      <aside
        aria-label="ナビゲーションパネル"
        className="border-r border-zinc-200 bg-white/70 p-4"
      >
        <nav aria-label="デスクトップナビゲーション" className="grid gap-2">
          <Link to="/" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-zinc-100">
            <Home className="size-4" aria-hidden="true" />
            ホーム
          </Link>
          {primaryNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-zinc-100"
              activeProps={{ className: "bg-indigo-50 text-indigo-700" }}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
        <Separator className="my-4" />
        <div className="grid gap-2">
          {desktopPanelItems.map((item) => (
            <div key={item} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
              {item}
            </div>
          ))}
        </div>
      </aside>

      <main aria-label="メインコンテンツ" className="overflow-y-auto bg-white">
        <Outlet />
      </main>

      <aside aria-label="学習パネル" className="border-l border-zinc-200 bg-white/70 p-4">
        <div className="grid gap-2">
          {studyPanelItems.map((item) => (
            <div key={item} className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
              {item}
            </div>
          ))}
        </div>
      </aside>
    </div>

    <main aria-label="メインコンテンツ" className="pb-20 md:hidden">
      <Outlet />
    </main>

    <nav
      aria-label="モバイルナビゲーション"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-zinc-200 bg-white md:hidden"
    >
      {primaryNav.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="flex h-16 flex-col items-center justify-center gap-1 text-xs text-zinc-600"
          activeProps={{ className: "text-indigo-700" }}
        >
          <item.icon className="size-5" aria-hidden="true" />
          {item.label}
        </Link>
      ))}
    </nav>
  </div>
);
```

- [ ] **Step 4: Wire AppShell into the root route**

Modify the root part of `src/app/router.tsx`:

```tsx
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { AppShell } from "./AppShell";
import {
  HomePage,
  JumpPage,
  LawsPage,
  ScannerPage,
  SettingsPage,
  StudyPage,
} from "./pages";

const rootRoute = createRootRoute({
  component: AppShell,
});
```

Keep the child route definitions from Task 3 unchanged.

- [ ] **Step 5: Run AppShell tests and checks**

Run:

```bash
pnpm test src/app/AppShell.test.tsx src/app/router.test.tsx
pnpm run typecheck
pnpm run lint
```

Expected: tests and checks pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/app/AppShell.tsx src/app/AppShell.test.tsx src/app/router.tsx src/app/pages.tsx
git commit -m "feat: AppShell の雛形を追加"
```

## Task 6: PWA Manifest and Documentation

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/pwa.svg`
- Modify: `README.md`

- [ ] **Step 1: Add manifest smoke test**

Create `src/app/manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import manifest from "../../public/manifest.webmanifest";

describe("PWA manifest", () => {
  it("uses the agreed app name and route start URL", () => {
    expect(manifest.name).toBe("すらすら六法");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/app/manifest.test.ts
```

Expected: FAIL because `public/manifest.webmanifest` does not exist.

- [ ] **Step 3: Add PWA assets**

Create `public/manifest.webmanifest`:

```json
{
  "name": "すらすら六法",
  "short_name": "すら六",
  "description": "法令を読みやすく閲覧し、条文参照をすぐ確認できる Web/PWA アプリです。",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#fafafa",
  "theme_color": "#4f46e5",
  "lang": "ja",
  "icons": [
    {
      "src": "/pwa.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

Create `public/pwa.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img">
  <rect width="512" height="512" rx="96" fill="#4f46e5"/>
  <path d="M144 132h184c22.1 0 40 17.9 40 40v228H184c-22.1 0-40-17.9-40-40V132z" fill="#fafafa"/>
  <path d="M184 112h184v248H184c-22.1 0-40 17.9-40 40V152c0-22.1 17.9-40 40-40z" fill="#f59e0b"/>
  <path d="M206 178h118M206 226h118M206 274h84" stroke="#27272a" stroke-width="24" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: Update README**

Append to `README.md`:

````md
## Development

```bash
mise install
corepack enable
pnpm install
pnpm dev
```

Quality checks:

```bash
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
```
````

- [ ] **Step 5: Run tests and checks**

Run:

```bash
pnpm test src/app/manifest.test.ts
pnpm run typecheck
pnpm run lint
pnpm run format:check
```

Expected: all checks pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add public/manifest.webmanifest public/pwa.svg src/app/manifest.test.ts README.md
git commit -m "feat: PWA manifest の雛形を追加"
```

## Task 7: GitHub Actions CI

**Files:**
- Create: `.github/workflows/check.yml`

- [ ] **Step 1: Add CI workflow**

Create `.github/workflows/check.yml`:

```yaml
name: Check

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup mise
        uses: jdx/mise-action@v2

      - name: Enable corepack
        run: corepack enable

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm run typecheck

      - name: Lint
        run: pnpm run lint

      - name: Format check
        run: pnpm run format:check

      - name: Test
        run: pnpm test
```

- [ ] **Step 2: Run local CI-equivalent checks**

Run:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
```

Expected: all checks pass.

- [ ] **Step 3: Commit**

Run:

```bash
git add .github/workflows/check.yml
git commit -m "ci: フロントエンドの品質チェックを追加"
```

## Task 8: Browser Verification and PR Preparation

**Files:**
- Modify: files touched by formatting only if verification reveals a fix.

- [ ] **Step 1: Start the dev server**

Run:

```bash
pnpm dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 2: Open headed browser verification**

Run:

```bash
playwright-cli open --headed http://127.0.0.1:5173/
```

Verify these paths manually in the headed browser:

```text
/
/laws
/jump
/scanner
/study
/settings
```

Expected:

- No route displays a blank page.
- Desktop width shows header, left navigation panel, main content, and right learning panel.
- Mobile width shows header, main content, and bottom navigation.
- Text does not overflow its buttons or navigation items.

- [ ] **Step 3: Capture screenshot if useful for the PR**

If a screenshot is captured, save it under a temporary path outside the committed source tree and use the `github-image-upload` skill during PR creation.

- [ ] **Step 4: Final full check**

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm test
pnpm run build
git status --short
```

Expected: checks pass, build passes, and only intended source changes are present.

- [ ] **Step 5: Prepare PR**

Use a normal PR, not Draft, if every check passes.

PR title:

```text
feat: フロントエンド基盤とCIを構築
```

PR body must include:

```md
## 概要

- Vite + React + TypeScript のフロントエンド基盤を追加
- TanStack Router で主要 route の入口を追加
- Desktop 3ペイン / Mobile bottom navigation の AppShell 雛形を追加
- PWA manifest と GitHub Actions の品質チェックを追加

## 動作確認

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run format:check`
- `pnpm test`
- `pnpm run build`
- `playwright-cli open --headed http://127.0.0.1:5173/`

## 動物界における比擬

この変更は、巣そのものを完成させるのではなく、通路、部屋、見張り台の位置を先に整える作業に似ています。法令本文、OCR、復習機能はまだ入れず、それぞれが迷わず収まる場所を用意しています。

Closes #8
```

- [ ] **Step 6: Assign the user after PR creation**

Run:

```bash
gh pr edit --add-assignee SlashNephy
```

Expected: PR assignee includes `SlashNephy`.

## References

- Vite Getting Started: https://vite.dev/guide/
- Tailwind CSS with Vite: https://tailwindcss.com/docs/installation/using-vite
- shadcn/ui Vite installation: https://ui.shadcn.com/docs/installation/vite
- TanStack Router Quick Start: https://tanstack.com/router/v1/docs/quick-start
