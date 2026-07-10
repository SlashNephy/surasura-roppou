import type { Bookmark, LawNode } from "@/core/domain";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnchorCompareDialog } from "./AnchorCompareDialog";

const articleNode = (number: string, plainText: string): LawNode => ({
  id: `art-${number}`,
  lawId: "L",
  revisionId: "cur",
  type: "Article",
  path: `/Article[${number}]`,
  number,
  rawText: plainText,
  plainText,
  children: [],
});

const bookmark: Bookmark = {
  id: "b1",
  target: { lawId: "L", article: "1", revisionId: "old", fingerprint: "oldfingerprint00" },
  title: "テスト",
  tags: [],
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

const baseProps = {
  bookmark,
  status: "drift" as const,
  currentNodes: [articleNode("1", "第一条 改正後の本文…")],
  currentRevisionId: "cur",
  loadCreatedNodes: () => Promise.resolve([articleNode("1", "第一条 改正前の本文…")]),
  onClose: vi.fn(),
};

describe("AnchorCompareDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("「付け替える」で target の指紋と revisionId を現在版へ更新して保存する", async () => {
    const putBookmark = vi.fn<(bookmark: Bookmark) => Promise<void>>(() => Promise.resolve());
    const onRepaired = vi.fn();

    render(
      <AnchorCompareDialog
        {...baseProps}
        storageRepository={{ putBookmark } as never}
        onRepaired={onRepaired}
      />,
    );

    await screen.findByText("第一条 改正前の本文…");
    await userEvent.click(screen.getByRole("button", { name: "新しい条文に付け替える" }));

    await waitFor(() => {
      expect(putBookmark).toHaveBeenCalledTimes(1);
    });
    const saved = putBookmark.mock.calls[0][0];
    expect(saved.target.revisionId).toBe("cur");
    expect(saved.target.pinned).toBe(false);
    // 現在版本文の指紋に更新されている（元の指紋とは異なる）。
    expect(saved.target.fingerprint).not.toBe("oldfingerprint00");
    expect(onRepaired).toHaveBeenCalledTimes(1);
  });

  it("「この版のまま固定する」で pinned=true にして保存する", async () => {
    const putBookmark = vi.fn<(bookmark: Bookmark) => Promise<void>>(() => Promise.resolve());
    const onRepaired = vi.fn();

    render(
      <AnchorCompareDialog
        {...baseProps}
        storageRepository={{ putBookmark } as never}
        onRepaired={onRepaired}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "この版のまま固定する" }));

    await waitFor(() => {
      expect(putBookmark).toHaveBeenCalledTimes(1);
    });
    const saved = putBookmark.mock.calls[0][0];
    expect(saved.target.pinned).toBe(true);
    expect(saved.target.revisionId).toBe("old");
    await waitFor(() => {
      expect(onRepaired).toHaveBeenCalledTimes(1);
    });
  });

  it("作成時版の取得に失敗したとき、読み込み中のままにせずエラー文言を表示する", async () => {
    render(
      <AnchorCompareDialog
        {...baseProps}
        loadCreatedNodes={() => Promise.reject(new Error("network down"))}
        storageRepository={
          {
            putBookmark: vi.fn<(bookmark: Bookmark) => Promise<void>>(() => Promise.resolve()),
          } as never
        }
        onRepaired={vi.fn()}
      />,
    );

    expect(await screen.findByText("作成時の条文を読み込めませんでした。")).toBeInTheDocument();
    expect(screen.queryByText("読み込み中…")).not.toBeInTheDocument();
  });

  it("not_found のとき「付け替える」は無効", () => {
    render(
      <AnchorCompareDialog
        {...baseProps}
        status="not_found"
        currentNodes={[]}
        storageRepository={
          {
            putBookmark: vi.fn<(bookmark: Bookmark) => Promise<void>>(() => Promise.resolve()),
          } as never
        }
        onRepaired={vi.fn()}
      />,
    );

    expect(screen.getByText("現在の版に該当する条が見つかりません")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新しい条文に付け替える" })).toBeDisabled();
  });
});
