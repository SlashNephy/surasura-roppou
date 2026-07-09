import { Link, Outlet } from "@tanstack/react-router";
import { BookOpen, Camera, GraduationCap, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/shared/utils/cn";

import { PwaUpdatePrompt } from "./PwaUpdatePrompt";
import type { PrimaryRoute } from "./routes";
import { SearchPalette } from "./SearchPalette";

interface NavItem {
  to: PrimaryRoute;
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
    <SearchPalette />
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

// 出典（e-Gov 法令検索）と免責を全画面で表示する共通フッター。
// AppShell 直下に置くことで contentinfo ランドマークになる。
const Footer = () => (
  <footer className="border-t bg-popover px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] text-xs text-muted-foreground md:px-6 md:pb-4">
    <div className="mx-auto grid max-w-4xl gap-1">
      <p>
        出典：
        <a
          href="https://laws.e-gov.go.jp"
          target="_blank"
          rel="noreferrer"
          className="rounded-sm underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          e-Gov 法令検索（https://laws.e-gov.go.jp）
        </a>
      </p>
      <p>本アプリは学習補助であり、法的助言を提供するものではありません</p>
    </div>
  </footer>
);

export const AppShell = () => (
  <div className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
    <Header />
    <main aria-label="メインコンテンツ" className="min-w-0 flex-1">
      <Outlet />
    </main>
    <Footer />
    <MobileNavigation />
    <PwaUpdatePrompt />
  </div>
);
