import type { useNavigate } from "@tanstack/react-router";

import type { QuickSearchCandidate } from "@/core/jump";

// core を route 非依存に保つため、候補 → ルート遷移の写像は app 層に置く。
export type SearchNavigationTarget =
  | { to: "/laws/$lawId"; params: { lawId: string } }
  | { to: "/laws/$lawId/articles/$article"; params: { lawId: string; article: string } };

export const toNavigationTarget = (
  candidate: Pick<QuickSearchCandidate, "lawId" | "article">,
): SearchNavigationTarget =>
  candidate.article === undefined
    ? { to: "/laws/$lawId", params: { lawId: candidate.lawId } }
    : {
        to: "/laws/$lawId/articles/$article",
        params: { lawId: candidate.lawId, article: candidate.article },
      };

// 候補への命令的遷移。TanStack の Link/navigate は union の `to` を素直に受けないため、
// リテラルで分岐して params 型を一致させる。この型ナローイングをここ 1 箇所に閉じ込める。
export const navigateToCandidate = (
  navigate: ReturnType<typeof useNavigate>,
  candidate: Pick<QuickSearchCandidate, "lawId" | "article">,
  options: { replace?: boolean } = {},
): void => {
  const target = toNavigationTarget(candidate);

  if (target.to === "/laws/$lawId") {
    void navigate({ to: target.to, params: target.params, replace: options.replace });
  } else {
    void navigate({ to: target.to, params: target.params, replace: options.replace });
  }
};
