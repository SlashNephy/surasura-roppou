import { describe, expect, it } from "vitest";

import type { TabHistory } from "./tab-history";
import { findPrimaryRoute, recordTabVisit, resolveTabHref } from "./tab-history";

describe("findPrimaryRoute", () => {
  it.each([
    ["/laws", "/laws"],
    ["/laws/129AC0000000089", "/laws"],
    ["/laws/129AC0000000089/articles/90", "/laws"],
    ["/scanner", "/scanner"],
    ["/study/cards/abc", "/study"],
    ["/settings/data-transfer", "/settings"],
  ] as const)("maps %s to the %s tab", (pathname, expected) => {
    expect(findPrimaryRoute(pathname)).toBe(expected);
  });

  it.each([
    ["/"],
    ["/saved"],
    ["/search"],
    // 前方一致だけで判定するとタブ扱いされてしまう紛らわしいパス。
    ["/lawsuits"],
    ["/studying"],
  ])("returns undefined for %s", (pathname) => {
    expect(findPrimaryRoute(pathname)).toBeUndefined();
  });
});

describe("recordTabVisit", () => {
  it("remembers the visited href under its primary tab", () => {
    const history = recordTabVisit({}, "/laws/129AC0000000089/articles/90");

    expect(history["/laws"]).toBe("/laws/129AC0000000089/articles/90");
  });

  it("keeps the query string so filters survive the tab switch", () => {
    const history = recordTabVisit({}, "/study/cards?subject=civil");

    expect(history["/study"]).toBe("/study/cards?subject=civil");
  });

  it("overwrites the previous href of the same tab without touching other tabs", () => {
    const first = recordTabVisit({}, "/laws/129AC0000000089");
    const second = recordTabVisit(first, "/scanner");
    const third = recordTabVisit(second, "/laws/132AC0000000048");

    expect(third).toEqual({ "/laws": "/laws/132AC0000000048", "/scanner": "/scanner" });
  });

  it("ignores hrefs outside the primary tabs", () => {
    const history: TabHistory = { "/laws": "/laws/129AC0000000089" };

    expect(recordTabVisit(history, "/saved")).toBe(history);
  });
});

describe("resolveTabHref", () => {
  it("returns the remembered href for the tab", () => {
    const history: TabHistory = { "/laws": "/laws/129AC0000000089/articles/90" };

    expect(resolveTabHref(history, "/laws")).toBe("/laws/129AC0000000089/articles/90");
  });

  it("falls back to the tab root before the tab has been visited", () => {
    expect(resolveTabHref({}, "/study")).toBe("/study");
  });
});
