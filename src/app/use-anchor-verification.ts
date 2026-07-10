import { useEffect, useState } from "react";

import type { Bookmark, LawNode } from "@/core/domain";
import { buildArticleReferenceKey } from "@/core/domain";
import type { StorageRepository } from "@/core/storage";
import type { AnchorStatus } from "@/core/viewer";
import { verifyAnchor } from "@/core/viewer";

export interface AnchorVerification {
  status: AnchorStatus;
  bookmark: Bookmark;
}

interface UseAnchorVerificationArgs {
  lawId: string;
  article: string | undefined;
  nodes: LawNode[];
  storageRepository: StorageRepository;
}

// アクティブな条について、指紋付きアンカー（ブックマーク）を storage から引き、
// 現在の nodes に対して検証状態を返す。未アンカー・該当なしは undefined。
export const useAnchorVerification = ({
  lawId,
  article,
  nodes,
  storageRepository,
}: UseAnchorVerificationArgs): AnchorVerification | undefined => {
  const [verification, setVerification] = useState<AnchorVerification | undefined>(undefined);

  useEffect(() => {
    // article が未指定のときはエフェクト内で非同期処理を起動しない。
    // 戻り値は後段で undefined に揃える。
    if (article === undefined || article === "") {
      return;
    }

    let cancelled = false;
    // lawId・article のみで照合する key（revisionId は除く）。
    // アンカーはどのリビジョンで保存されていても、現在閲覧中の条と突き合わせる。
    const targetKey = buildArticleReferenceKey({ lawId, article });

    const run = async () => {
      const bookmarks = await storageRepository.listBookmarks({ lawId });
      // by-target-key 相当の突き合わせ。revisionId を除いた key で比較し、
      // 指紋を持つ（アンカー付き）ものだけ検証する。
      const anchored = bookmarks.find(
        (bookmark) =>
          typeof bookmark.target.fingerprint === "string" &&
          buildArticleReferenceKey({
            lawId: bookmark.target.lawId,
            article: bookmark.target.article ?? undefined,
          }) === targetKey,
      );

      if (anchored?.target.fingerprint === undefined || anchored.target.fingerprint === null) {
        if (!cancelled) {
          setVerification(undefined);
        }
        return;
      }

      const status = await verifyAnchor(
        { article, fingerprint: anchored.target.fingerprint },
        nodes,
      );

      if (!cancelled) {
        setVerification({ status, bookmark: anchored });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [lawId, article, nodes, storageRepository]);

  // article が未指定のときは state を無視して undefined を返す。
  if (article === undefined || article === "") {
    return undefined;
  }

  return verification;
};
