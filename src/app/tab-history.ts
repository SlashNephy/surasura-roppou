import type { PrimaryRoute } from "./routes";

// タブごとに「最後に見ていた URL」を覚えておくための表。
// タブ切替はルート遷移なので、これがないと法令タブへ戻るたびに一覧へ差し戻され、
// 読みかけの条文とスクロール位置が失われる。
export type TabHistory = Partial<Record<PrimaryRoute, string>>;

const primaryRoutes: PrimaryRoute[] = ["/laws", "/scanner", "/study", "/settings"];

// href からタブを判定する。/lawsuits のような紛らわしいパスをタブ扱いしないよう、
// 完全一致かセグメント境界（/laws/...）でのみ一致とみなす。
export const findPrimaryRoute = (pathname: string): PrimaryRoute | undefined =>
  primaryRoutes.find((route) => pathname === route || pathname.startsWith(`${route}/`));

const toPathname = (href: string): string => href.split(/[?#]/)[0] ?? href;

export const recordTabVisit = (history: TabHistory, href: string): TabHistory => {
  const tab = findPrimaryRoute(toPathname(href));
  if (tab === undefined || history[tab] === href) {
    // 変化がないときは同じ参照を返し、呼び出し側の再レンダリングを避ける。
    return history;
  }

  return { ...history, [tab]: href };
};

export const resolveTabHref = (history: TabHistory, tab: PrimaryRoute): string =>
  history[tab] ?? tab;
