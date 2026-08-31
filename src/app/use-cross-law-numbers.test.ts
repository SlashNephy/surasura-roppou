import type { LawNode } from "@/core/domain";
import type { LawNumberResolver } from "@/core/jump";
import { act, renderHook, waitFor } from "@testing-library/react";
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

// 応答のタイミングをテスト側で決められる解決器。法令を切り替えた後に前の法令の
// 問い合わせが返ってくる、という順序を再現するために使う。
const deferredResolverOf = (): {
  resolver: LawNumberResolver;
  settle: (key: string, lawId: string) => void;
  pendingKeys: () => string[];
} => {
  const pending = new Map<string, (lawId: string | undefined) => void>();
  const resolve = (parsed: { era: string; year: number; type: string; number: number }) =>
    new Promise<string | undefined>((settleOne) => {
      pending.set(
        `${parsed.era}/${String(parsed.year)}/${parsed.type}/${String(parsed.number)}`,
        settleOne,
      );
    });

  return {
    resolver: { resolve },
    settle: (key, lawId) => {
      const settleOne = pending.get(key);

      if (settleOne === undefined) {
        throw new Error(`no pending resolution for ${key}`);
      }

      settleOne(lawId);
    },
    pendingKeys: () => [...pending.keys()],
  };
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

  it("discards the previous document's table and its in-flight resolutions", async () => {
    const { pendingKeys, resolver, settle } = deferredResolverOf();
    const previousNodes = [
      node("p1", "原子力災害対策特別措置法（平成11年法律第156号）第2条の規定による。"),
      node("p2", "不正競争防止法（平成5年法律第47号）第2条の規定による。"),
    ];
    const nextNodes = [node("p1", "電波法（昭和25年法律第131号）第4条の規定による。")];
    // 解決を 1 件返し、それを受けた再描画まで待つ。
    const settleAndFlush = async (key: string, lawId: string) => {
      await act(async () => {
        settle(key, lawId);
        await Promise.resolve();
      });
    };

    const { rerender, result } = renderHook(
      ({ nodes }: { nodes: LawNode[] }) => useCrossLawNumbers(nodes, resolver),
      { initialProps: { nodes: previousNodes } },
    );

    await waitFor(() => {
      expect(pendingKeys()).toContain("Heisei/11/法律/156");
    });
    // 片方だけ先に解決させ、もう片方は応答待ちのまま法令を切り替える。
    await settleAndFlush("Heisei/11/法律/156", "411AC0000000156");
    expect(result.current.size).toBe(1);

    rerender({ nodes: nextNodes });

    // 切り替えた瞬間に前の法令の対応表は消える。
    expect(result.current.size).toBe(0);

    // 切り替え後に返ってきた前の法令の応答は表へ載らない。
    await settleAndFlush("Heisei/5/法律/47", "405AC0000000047");
    expect(result.current.has("Heisei/5/法律/47")).toBe(false);
    expect(result.current.size).toBe(0);

    // 新しい法令の解決は始まっている。
    await waitFor(() => {
      expect(pendingKeys()).toContain("Showa/25/法律/131");
    });
    await settleAndFlush("Showa/25/法律/131", "325AC0000000131");
    expect(result.current.get("Showa/25/法律/131")).toBe("325AC0000000131");
    expect(result.current.size).toBe(1);
  });
});
