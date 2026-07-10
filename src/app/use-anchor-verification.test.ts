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
});
