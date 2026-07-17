import type { ReactNode } from "react";

import type { Law, LawNode, LawRevision } from "@/core/domain";
import { Badge } from "@/shared/ui/badge";
import { formatIsoDateLabel } from "@/shared/utils/dates";

import { applyLawTextDisplayMode } from "./displayMode";
import type { LawTextDisplayMode } from "./displayMode";
import { LawNodeList } from "./LawNodeList";

interface LawDocumentViewProps {
  law: Law;
  revision: LawRevision;
  nodes: LawNode[];
  isSaved: boolean;
  activeArticleNumber?: string;
  displayMode?: LawTextDisplayMode;
  renderArticleActions?: (article: LawNode) => ReactNode;
}

export const LawDocumentView = ({
  activeArticleNumber,
  displayMode = "readable",
  renderArticleActions,
  law,
  revision,
  nodes,
  isSaved,
}: LawDocumentViewProps) => (
  <article aria-label={law.title} className="grid min-w-0 gap-6">
    <header className="grid min-w-0 gap-4 border-b pb-5">
      <div className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {law.lawType !== undefined ? <Badge variant="secondary">{law.lawType}</Badge> : null}
          <Badge variant={isSaved ? "default" : "outline"}>{isSaved ? "保存済み" : "未保存"}</Badge>
        </div>
        <div className="grid min-w-0 gap-2">
          <h1 className="min-w-0 font-serif text-2xl font-semibold text-foreground break-words md:text-3xl">
            {law.title}
          </h1>
          {law.lawNumber !== undefined ? (
            <p className="text-sm leading-display text-muted-foreground break-words">
              {getDisplayLawNumber(law.lawNumber, displayMode)}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-sm leading-display text-muted-foreground">
        {revision.effectiveDate !== undefined ? (
          <div className="min-w-0 break-words">
            <dt className="sr-only">施行日</dt>
            <dd>施行日: {formatIsoDateLabel(revision.effectiveDate)}</dd>
          </div>
        ) : null}
        <div className="min-w-0 break-words">
          <dt className="sr-only">取得日</dt>
          <dd>取得: {getDisplayFetchedDate(revision.fetchedAt)}</dd>
        </div>
      </dl>
    </header>

    <LawNodeList
      activeArticleNumber={activeArticleNumber}
      displayMode={displayMode}
      nodes={nodes}
      renderArticleActions={renderArticleActions}
    />
  </article>
);

const getDisplayLawNumber = (lawNumber: string, displayMode: LawTextDisplayMode): string =>
  applyLawTextDisplayMode(lawNumber, displayMode, "law-number");

const getDisplayFetchedDate = (fetchedAt: string): string => formatIsoDateLabel(fetchedAt);
