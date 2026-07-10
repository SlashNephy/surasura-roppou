import type { Bookmark, LawNode } from "@/core/domain";
import { computeArticleFingerprint } from "@/core/domain";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAnchorVerification } from "./use-anchor-verification";

const articleNode = (number: string, plainText: string): LawNode => ({
  id: `art-${number}`,
  lawId: "L",
  revisionId: "R",
  type: "Article",
  path: `/Article[${number}]`,
  number,
  rawText: plainText,
  plainText,
  children: [],
});

const nodes = [articleNode("1", "第一条 この法律は…")];

const bookmark = (target: Bookmark["target"]): Bookmark => ({
  id: "b1",
  target,
  title: "テスト",
  tags: [],
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
});

const storageWith = (bookmarks: Bookmark[]) =>
  ({ listBookmarks: () => Promise.resolve(bookmarks) }) as unknown as Parameters<
    typeof useAnchorVerification
  >[0]["storageRepository"];

describe("useAnchorVerification", () => {
  it("アンカー付きブックマークが drift のとき status=drift を返す", async () => {
    const storageRepository = storageWith([
      bookmark({ lawId: "L", article: "1", revisionId: "R", fingerprint: "deadbeefdeadbeef" }),
    ]);

    const { result } = renderHook(() =>
      useAnchorVerification({ lawId: "L", article: "1", nodes, storageRepository }),
    );

    await waitFor(() => {
      expect(result.current?.status).toBe("drift");
    });
  });

  it("指紋が一致すれば status=match", async () => {
    const fingerprint = await computeArticleFingerprint("第一条 この法律は…");
    const storageRepository = storageWith([
      bookmark({ lawId: "L", article: "1", revisionId: "R", fingerprint }),
    ]);

    const { result } = renderHook(() =>
      useAnchorVerification({ lawId: "L", article: "1", nodes, storageRepository }),
    );

    await waitFor(() => {
      expect(result.current?.status).toBe("match");
    });
  });

  it("未アンカー（指紋なし）ブックマークは undefined（検証対象外）", async () => {
    const storageRepository = storageWith([bookmark({ lawId: "L", article: "1" })]);

    const { result } = renderHook(() =>
      useAnchorVerification({ lawId: "L", article: "1", nodes, storageRepository }),
    );

    // 非同期解決後も undefined のままであることを確認する。
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeUndefined();
  });

  it("article 未指定なら undefined", () => {
    const storageRepository = storageWith([]);
    const { result } = renderHook(() =>
      useAnchorVerification({ lawId: "L", article: undefined, nodes, storageRepository }),
    );
    expect(result.current).toBeUndefined();
  });

  it("refreshToken が変わると storage を読み直し drift → match に更新する", async () => {
    // 初回は指紋不一致（drift）のブックマークを返し、修復後に指紋一致のものへ差し替える。
    // refreshToken の変更で検証が再実行され、同一セッション内で status が更新されることを検証する。
    const matchingFingerprint = await computeArticleFingerprint("第一条 この法律は…");
    let current = bookmark({
      lawId: "L",
      article: "1",
      revisionId: "R",
      fingerprint: "deadbeefdeadbeef",
    });
    const storageRepository = {
      listBookmarks: () => Promise.resolve([current]),
    } as unknown as Parameters<typeof useAnchorVerification>[0]["storageRepository"];

    const { result, rerender } = renderHook(
      ({ refreshToken }: { refreshToken: number }) =>
        useAnchorVerification({ lawId: "L", article: "1", nodes, storageRepository, refreshToken }),
      { initialProps: { refreshToken: 0 } },
    );

    await waitFor(() => {
      expect(result.current?.status).toBe("drift");
    });

    // 修復に相当する差し替え。トークンを変えるまでは stale な drift のままであること。
    current = bookmark({
      lawId: "L",
      article: "1",
      revisionId: "R",
      fingerprint: matchingFingerprint,
    });
    rerender({ refreshToken: 1 });

    await waitFor(() => {
      expect(result.current?.status).toBe("match");
    });
  });

  it("article が変わったとき、前の検証結果を即座に捨てて stale な値を返さない", async () => {
    // article="1" のアンカー付きブックマーク（指紋不一致で drift になるもの）を用意する。
    const storageRepository = storageWith([
      bookmark({ lawId: "L", article: "1", revisionId: "R", fingerprint: "deadbeefdeadbeef" }),
    ]);

    const { result, rerender } = renderHook(
      ({ article }: { article: string }) =>
        useAnchorVerification({ lawId: "L", article, nodes, storageRepository }),
      { initialProps: { article: "1" } },
    );

    // article="1" で drift が解決されることを確認する。
    await waitFor(() => {
      expect(result.current?.status).toBe("drift");
    });

    // article="2" に切り替える（対応するブックマークは存在しない）。
    rerender({ article: "2" });

    // article 変更直後、前の drift 結果は即座に捨てられ undefined になる。
    await waitFor(() => {
      expect(result.current).toBeUndefined();
    });
  });
});
