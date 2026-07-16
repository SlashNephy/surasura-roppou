import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import type { LawNode, StudyCard } from "@/core/domain";
import type { AnchorStatus } from "@/core/viewer";
import { findArticleNode, verifyAnchor } from "@/core/viewer";
import { Badge } from "@/shared/ui/badge";
import { Skeleton } from "@/shared/ui/skeleton";

import type { LawViewerState } from "./law-viewer-page";

interface StudyReviewEvidencePanelProps {
  card: StudyCard;
  // 法令の取得はページ側がセッション内キャッシュ付きで供給する。
  loadDocument: (lawId: string) => Promise<LawViewerState>;
}

type EvidenceState =
  | { status: "loading" }
  // 法令を取得できなかったときの縮退。ビューアへのリンクだけ出す。
  | { status: "fallback" }
  | {
      status: "ready";
      lawTitle: string;
      baseDateLabel: string;
      // 条ノードが現在の版に見つからないときは undefined。
      node?: LawNode;
      // 指紋を持たないカードでは検証しない(undefined)。
      anchorStatus?: AnchorStatus;
    };

// 回答後に必ず根拠条文を基準日で解決して表示する(design-doc 14.3、スペック 8 章)。
// カードが変わったらページ側が key={card.id} で作り直すため、状態の手動リセットは不要。
export const StudyReviewEvidencePanel = ({ card, loadDocument }: StudyReviewEvidencePanelProps) => {
  const [state, setState] = useState<EvidenceState>({ status: "loading" });

  useEffect(() => {
    let isCurrent = true;

    const run = async () => {
      const document = await loadDocument(card.target.lawId);

      if (document.status !== "ready") {
        if (isCurrent) {
          setState({ status: "fallback" });
        }
        return;
      }

      const article = card.target.article ?? "";
      const node = article === "" ? undefined : findArticleNode(document.nodes, article);
      let anchorStatus: AnchorStatus | undefined;

      // 条番号を持たないカードは条ノードを解決できないため、アンカー検証の対象外とする(バッジを出さない)。
      if (article !== "") {
        if (node === undefined) {
          anchorStatus = "not_found";
        } else if (typeof card.target.fingerprint === "string") {
          anchorStatus = await verifyAnchor(
            { article, fingerprint: card.target.fingerprint },
            document.nodes,
          );
        }
      }

      if (isCurrent) {
        setState({
          status: "ready",
          lawTitle: document.law.title,
          baseDateLabel: document.requestedAsOf ?? "未設定（現行法）",
          node,
          anchorStatus,
        });
      }
    };

    run().catch(() => {
      if (isCurrent) {
        setState({ status: "fallback" });
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [card, loadDocument]);

  const articleLabel =
    card.target.article === null || card.target.article === undefined || card.target.article === ""
      ? ""
      : ` 第${card.target.article}条`;

  const article = card.target.article ?? "";
  // 条番号を持たないカードは条文ルートではなく法令トップへ飛ばす(空パラメータの不正 URL を防ぐ)。
  const viewerLinkProps =
    article === ""
      ? ({ params: { lawId: card.target.lawId }, to: "/laws/$lawId" } as const)
      : ({
          params: { article, lawId: card.target.lawId },
          to: "/laws/$lawId/articles/$article",
        } as const);

  return (
    <section aria-label="根拠条文" className="grid gap-2 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-foreground">根拠条文</h2>
        {state.status === "ready" &&
        state.anchorStatus !== undefined &&
        state.anchorStatus !== "match" ? (
          <>
            <Badge className="gap-1" variant="destructive">
              <AlertTriangle aria-hidden="true" className="size-3.5" />
              改正の可能性
            </Badge>
            {/* 作り直しはビューアの「カードを作る」で行う。question / answer は自動で書き換えない(スペック 8 章)。
                study=new はビューアが本文ロード後にカード作成ダイアログを自動起動する既存パラメータ。
                article が空のとき anchorStatus は undefined のため、このブロックは article が空のカードでは表示されない。 */}
            <Link
              className="text-sm text-primary underline-offset-4 hover:underline"
              params={{ article: card.target.article ?? "", lawId: card.target.lawId }}
              search={{ study: "new" }}
              to="/laws/$lawId/articles/$article"
            >
              カードを作り直す
            </Link>
          </>
        ) : null}
      </div>

      {state.status === "loading" ? <Skeleton className="h-16 w-full" /> : null}

      {state.status === "fallback" ? (
        <p className="text-sm leading-display text-muted-foreground">
          条文を取得できませんでした。{" "}
          <Link className="text-primary underline-offset-4 hover:underline" {...viewerLinkProps}>
            ビューアで開く
          </Link>
        </p>
      ) : null}

      {state.status === "ready" ? (
        <>
          <Link
            className="text-sm text-primary underline-offset-4 hover:underline"
            {...viewerLinkProps}
          >
            {state.lawTitle}
            {articleLabel}
          </Link>
          {state.node === undefined ? (
            <p className="text-sm leading-display text-muted-foreground">
              この条は現在の版に見つかりません。
            </p>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-display text-foreground">
              {state.node.plainText}
            </p>
          )}
          <p className="text-xs text-muted-foreground">表示基準日: {state.baseDateLabel}</p>
        </>
      ) : null}
    </section>
  );
};
