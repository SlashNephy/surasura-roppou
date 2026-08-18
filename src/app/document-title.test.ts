import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formatDocumentTitle, useDocumentTitle } from "./document-title";

describe("formatDocumentTitle", () => {
  const cases: { name: string; pageTitle: string | undefined; expected: string }[] = [
    { name: "ページ名にブランド名を続ける", pageTitle: "設定", expected: "設定 | すらすら六法" },
    {
      name: "法令名のような長い見出しでも同じ書式を使う",
      pageTitle: "道路交通法施行令",
      expected: "道路交通法施行令 | すらすら六法",
    },
    {
      name: "ページ名が無ければブランド名だけを返す",
      pageTitle: undefined,
      expected: "すらすら六法",
    },
    { name: "空文字はページ名なしとして扱う", pageTitle: "", expected: "すらすら六法" },
    { name: "空白のみもページ名なしとして扱う", pageTitle: "   ", expected: "すらすら六法" },
    {
      name: "前後の空白を落としてから連結する",
      pageTitle: "  検索  ",
      expected: "検索 | すらすら六法",
    },
  ];

  for (const { name, pageTitle, expected } of cases) {
    it(name, () => {
      expect(formatDocumentTitle(pageTitle)).toBe(expected);
    });
  }
});

describe("useDocumentTitle", () => {
  it("document.title へ整形済みのタイトルを反映する", () => {
    renderHook(() => {
      useDocumentTitle("設定");
    });

    expect(document.title).toBe("設定 | すらすら六法");
  });

  it("ページ名が変わったら追従する", () => {
    const { rerender } = renderHook(
      ({ pageTitle }: { pageTitle: string | undefined }) => {
        useDocumentTitle(pageTitle);
      },
      { initialProps: { pageTitle: "読み込み前" } },
    );

    rerender({ pageTitle: "道路交通法施行令" });

    expect(document.title).toBe("道路交通法施行令 | すらすら六法");
  });

  it("ページ名が未確定の間はブランド名だけを表示する", () => {
    renderHook(() => {
      useDocumentTitle(undefined);
    });

    expect(document.title).toBe("すらすら六法");
  });
});
