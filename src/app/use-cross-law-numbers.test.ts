import type { LawNode } from "@/core/domain";
import type { LawNumberResolver } from "@/core/jump";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCrossLawNumbers } from "./use-cross-law-numbers";

const node = (id: string, plainText: string): LawNode => ({
  id,
  lawId: "L",
  revisionId: "R",
  type: "Paragraph",
  path: id,
  rawText: "",
  plainText,
  children: [],
});

const resolverOf = (
  byKey: Record<string, string>,
): { resolver: LawNumberResolver; resolve: ReturnType<typeof vi.fn> } => {
  const resolve = vi.fn((parsed: { era: string; year: number; type: string; number: number }) =>
    Promise.resolve(
      byKey[`${parsed.era}/${String(parsed.year)}/${parsed.type}/${String(parsed.number)}`],
    ),
  );

  return { resolver: { resolve }, resolve };
};

describe("useCrossLawNumbers", () => {
  it("resolves each law number in the document once", async () => {
    const { resolve, resolver } = resolverOf({ "Heisei/11/法律/156": "411AC0000000156" });
    const nodes = [
      node("p1", "原子力災害対策特別措置法（平成11年法律第156号）第2条の規定による。"),
      node("p2", "原子力災害対策特別措置法（平成11年法律第156号）第3条の規定による。"),
    ];

    const { result } = renderHook(() => useCrossLawNumbers(nodes, resolver));

    await waitFor(() => {
      expect(result.current.get("Heisei/11/法律/156")).toBe("411AC0000000156");
    });
    // 同じ法令番号が 2 回現れても解決は 1 回。
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("omits law numbers the resolver could not resolve", async () => {
    const { resolve, resolver } = resolverOf({ "Heisei/11/法律/156": "411AC0000000156" });
    const nodes = [
      node("p1", "原子力災害対策特別措置法（平成11年法律第156号）第2条の規定による。"),
      node("p2", "不正競争防止法（平成5年法律第47号）第2条の規定による。"),
    ];

    const { result } = renderHook(() => useCrossLawNumbers(nodes, resolver));

    await waitFor(() => {
      expect(result.current.size).toBe(1);
    });
    expect(result.current.has("Heisei/5/法律/47")).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("returns an empty map when the document has no law numbers", async () => {
    const { resolve, resolver } = resolverOf({});

    const { result } = renderHook(() =>
      useCrossLawNumbers([node("p1", "前項の規定による。")], resolver),
    );

    await waitFor(() => {
      expect(resolve).not.toHaveBeenCalled();
    });
    expect(result.current.size).toBe(0);
  });
});
