import { useEffect, useState } from "react";

import type { Bookmark, LawNode } from "@/core/domain";
import { computeArticleFingerprint } from "@/core/domain";
import type { StorageRepository } from "@/core/storage";
import type { AnchorStatus } from "@/core/viewer";
import { findArticleNode, pinAnchor, repathAnchor } from "@/core/viewer";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

interface AnchorCompareDialogProps {
  bookmark: Bookmark;
  status: AnchorStatus;
  currentNodes: LawNode[];
  currentRevisionId: string;
  loadCreatedNodes: () => Promise<LawNode[]>;
  storageRepository: StorageRepository;
  onRepaired: (updated: Bookmark) => void;
  onClose: () => void;
}

// 作成時版と現在の解決先を見比べ、「付け替える」「この版のまま固定する」の 2 択を提供する。
export const AnchorCompareDialog = ({
  bookmark,
  status,
  currentNodes,
  currentRevisionId,
  loadCreatedNodes,
  storageRepository,
  onRepaired,
  onClose,
}: AnchorCompareDialogProps) => {
  const article = bookmark.target.article ?? "";
  const [createdText, setCreatedText] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadCreatedNodes().then((nodes) => {
      if (!cancelled) {
        setCreatedText(findArticleNode(nodes, article)?.plainText ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadCreatedNodes, article]);

  const currentNode = findArticleNode(currentNodes, article);
  const canRepath = status !== "not_found" && currentNode !== undefined;

  const persist = async (updated: Bookmark) => {
    setIsSaving(true);
    try {
      await storageRepository.putBookmark(updated);
      onRepaired(updated);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRepath = async () => {
    if (currentNode === undefined) {
      return;
    }
    const fingerprint = await computeArticleFingerprint(currentNode.plainText);
    const now = new Date().toISOString();
    await persist({
      ...bookmark,
      updatedAt: now,
      target: repathAnchor(bookmark.target, { revisionId: currentRevisionId, fingerprint }),
    });
  };

  const handlePin = async () => {
    const now = new Date().toISOString();
    await persist({ ...bookmark, updatedAt: now, target: pinAnchor(bookmark.target) });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>改正の可能性</DialogTitle>
          <DialogDescription>
            作成時の条文と現在の条文を見比べて、参照の扱いを選んでください。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <section>
            <h3 className="mb-1 text-sm font-semibold">作成時の版</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {createdText ?? "読み込み中…"}
            </p>
          </section>
          <section>
            <h3 className="mb-1 text-sm font-semibold">現在の版</h3>
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
              {status === "not_found"
                ? "現在の版に該当する条が見つかりません"
                : (currentNode?.plainText ?? "")}
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button
            disabled={!canRepath || isSaving}
            onClick={() => {
              void handleRepath();
            }}
            type="button"
          >
            新しい条文に付け替える
          </Button>
          <Button
            disabled={isSaving}
            onClick={() => {
              void handlePin();
            }}
            type="button"
            variant="secondary"
          >
            この版のまま固定する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
