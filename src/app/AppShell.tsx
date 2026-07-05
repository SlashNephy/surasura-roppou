import { Link, Outlet } from "@tanstack/react-router";
import { BookOpen, Camera, GraduationCap, Home, Search, Settings, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { cn } from "@/shared/utils/cn";

interface NavItem {
  to: "/laws" | "/jump" | "/scanner" | "/study" | "/settings";
  label: string;
  icon: LucideIcon;
}

const primaryNavItems: NavItem[] = [
  { to: "/laws", label: "法令", icon: BookOpen },
  { to: "/jump", label: "ジャンプ", icon: Search },
  { to: "/scanner", label: "撮る", icon: Camera },
  { to: "/study", label: "復習", icon: GraduationCap },
  { to: "/settings", label: "設定", icon: Settings },
];

const desktopPanelItems = ["目次", "検索結果", "保存済み"] as const;
const studyPanelItems = ["メモ", "定義語", "復習カード"] as const;

const navLinkClassName =
  "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground";
const activeNavLinkClassName = "bg-accent text-foreground";
const inactiveNavLinkClassName = "text-muted-foreground";

const Header = () => (
  <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
    <Link
      to="/"
      className="flex min-w-0 items-center gap-2 rounded-md text-sm font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Home className="size-4" aria-hidden="true" />
      </span>
      <span className="truncate">すらすら六法</span>
    </Link>
    <Button
      type="button"
      variant="outline"
      className="ml-auto hidden h-9 min-w-0 justify-start gap-2 px-3 text-muted-foreground md:flex md:w-[22rem]"
    >
      <Search className="size-4" aria-hidden="true" />
      <span className="truncate">国賠法1条、民709、行政手続法14条</span>
    </Button>
    <Badge variant="secondary" className="gap-1">
      <Sparkles className="size-3" aria-hidden="true" />
      基盤構築中
    </Badge>
  </header>
);

const DesktopNavigation = () => (
  <aside
    aria-label="ナビゲーションパネル"
    className="hidden min-h-0 border-r bg-muted/30 md:flex md:flex-col"
  >
    <div className="p-4">
      <Button
        type="button"
        variant="outline"
        className="h-9 w-full justify-start text-muted-foreground"
      >
        <Search className="size-4" aria-hidden="true" />
        国賠法1条、民709
      </Button>
    </div>
    <nav aria-label="デスクトップナビゲーション" className="grid gap-1 px-3 pb-4">
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
    <Separator />
    <div className="grid gap-3 p-4">
      {desktopPanelItems.map((item) => (
        <section key={item} className="rounded-md border bg-background p-3">
          <h2 className="text-sm font-medium text-foreground">{item}</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">基盤構築中</p>
        </section>
      ))}
    </div>
  </aside>
);

const StudyPanel = () => (
  <aside
    aria-label="学習パネル"
    className="hidden min-h-0 border-l bg-muted/20 md:flex md:flex-col"
  >
    <div className="flex items-center gap-2 p-4">
      <GraduationCap className="size-4 text-primary" aria-hidden="true" />
      <h2 className="text-sm font-semibold text-foreground">学習</h2>
    </div>
    <Separator />
    <div className="grid gap-3 p-4">
      {studyPanelItems.map((item) => (
        <section key={item} className="rounded-md border bg-background p-3">
          <h3 className="text-sm font-medium text-foreground">{item}</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">基盤構築中</p>
        </section>
      ))}
    </div>
  </aside>
);

const MobileNavigation = () => (
  <nav
    aria-label="モバイルナビゲーション"
    className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] pt-2 backdrop-blur md:hidden"
  >
    {primaryNavItems.map((item) => (
      <Link
        key={item.to}
        to={item.to}
        className={cn(
          "flex h-12 flex-col items-center justify-center gap-1 rounded-md text-xs font-medium",
          "transition-colors hover:bg-accent hover:text-foreground",
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
  <div className="min-h-dvh bg-background text-foreground">
    <Header />
    <div className="grid min-h-[calc(100dvh-4rem)] md:grid-cols-[17rem_minmax(0,1fr)_18rem]">
      <DesktopNavigation />
      <main aria-label="メインコンテンツ" className="min-w-0 pb-20 md:pb-0">
        <Outlet />
      </main>
      <StudyPanel />
    </div>
    <MobileNavigation />
  </div>
);
