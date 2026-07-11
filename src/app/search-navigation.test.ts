import { describe, expect, it, vi } from "vitest";

import { navigateToCandidate, toNavigationTarget } from "./search-navigation";

describe("toNavigationTarget", () => {
  it("条番号があれば条文ルートへ写像する", () => {
    expect(toNavigationTarget({ lawId: "129AC0000000089", article: "709" })).toEqual({
      to: "/laws/$lawId/articles/$article",
      params: { lawId: "129AC0000000089", article: "709" },
    });
  });

  it("条番号がなければ法令トップへ写像する", () => {
    expect(toNavigationTarget({ lawId: "129AC0000000089" })).toEqual({
      to: "/laws/$lawId",
      params: { lawId: "129AC0000000089" },
    });
  });

  it("navigateToCandidate は条文候補を条文ルートへ navigate する", () => {
    const navigate = vi.fn();
    navigateToCandidate(navigate, { lawId: "129AC0000000089", article: "709" }, { replace: true });

    expect(navigate).toHaveBeenCalledWith({
      to: "/laws/$lawId/articles/$article",
      params: { lawId: "129AC0000000089", article: "709" },
      replace: true,
    });
  });
});
