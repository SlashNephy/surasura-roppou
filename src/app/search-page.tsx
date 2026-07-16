import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import type { QuickSearch, QuickSearchCandidate, QuickSearchOutcome } from "@/core/jump";
import { findSubject, gyoseishoshiSubjects, isLawInSubject } from "@/core/study";
import type { SubjectId } from "@/core/study";
import { Select } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";

import { defaultQuickSearch } from "./quick-search";
import { navigateToCandidate, toNavigationTarget } from "./search-navigation";

const candidateLinkClassName = "grid gap-1 rounded-md border p-4 hover:bg-accent";

const CandidateLink = ({ candidate }: { candidate: QuickSearchCandidate }) => {
  const target = toNavigationTarget(candidate);
  const label = `${candidate.lawTitle}${candidate.article !== undefined ? ` 第${candidate.article}条` : ""}`;
  // className と内容は 1 度だけ組み立て、Link ラッパーだけリテラル to で分岐する。
  const content = (
    <>
      <span className="font-serif font-semibold">{label}</span>
      <span className="text-xs leading-display text-muted-foreground">
        {candidate.reason.join(" / ")}
      </span>
    </>
  );

  // 型ナローイングのため to リテラルで分岐する（search-navigation.ts と同様）。両辺の内容は同一で意図的。
  return target.to === "/laws/$lawId" ? (
    <Link className={candidateLinkClassName} to={target.to} params={target.params}>
      {content}
    </Link>
  ) : (
    <Link className={candidateLinkClassName} to={target.to} params={target.params}>
      {content}
    </Link>
  );
};

export const SearchPage = ({ quickSearch = defaultQuickSearch }: { quickSearch?: QuickSearch }) => {
  const { q } = useSearch({ from: "/search" });
  const navigate = useNavigate();
  // クエリが空のときは "empty" を初期値とする。
  const [outcome, setOutcome] = useState<QuickSearchOutcome>({ status: "empty" });
  // 検索が解決した時点のクエリ。現在の q との差分で「検索中」を判定する。
  const [settledQuery, setSettledQuery] = useState("");

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed === "") {
      // 空クエリのときは outcome の更新は不要。初期値 "empty" のまま表示する。
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    void quickSearch
      .search(trimmed, { signal: controller.signal })
      .then((next) => {
        if (!cancelled) {
          setOutcome(next);
          setSettledQuery(q);
        }
      })
      .catch((error: unknown) => {
        // 中断（クエリ変更・アンマウント）は正常系なので無視する。
        if (controller.signal.aborted) {
          return;
        }
        console.error("search page query failed", error);
        if (!cancelled) {
          // 検索失敗時は空の候補リストにフォールバックして「該当なし」状態を表示する。
          setOutcome({ status: "candidates", candidates: [], autoJump: false });
          setSettledQuery(q);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [q, quickSearch]);

  // 単一の確定候補はページを挟まず該当条文へ置換遷移する。履歴を汚さないよう replace: true を使う。
  useEffect(() => {
    if (outcome.status !== "candidates" || !outcome.autoJump || outcome.candidates.length !== 1) {
      return;
    }

    navigateToCandidate(navigate, outcome.candidates[0], { replace: true });
  }, [outcome, navigate]);

  // 科目フィルタは表示中の候補リストにのみ作用する一時的な状態。URL には載せない。
  const [subjectFilter, setSubjectFilter] = useState<SubjectId | "all">("all");
  // クエリが変わったら科目フィルタをリセットする。前の検索語向けの絞り込みが新しい候補に
  // 残って即「0 件」表示になるのを防ぐ。effect での setState を避けるため、前回同期した
  // 値と比較してレンダー中に同期する（settings-page と同じ React 公式の推奨形）。
  const [syncedQuery, setSyncedQuery] = useState(q);
  if (q !== syncedQuery) {
    setSyncedQuery(q);
    setSubjectFilter("all");
  }

  const visibleCandidates =
    outcome.status === "candidates"
      ? outcome.candidates.filter(
          (candidate) => subjectFilter === "all" || isLawInSubject(subjectFilter, candidate.lawId),
        )
      : [];

  const trimmedQ = q.trim();
  // settledQuery が現在の q に追いつくまでは検索中（通信待ち）とみなす。
  const isSearching = trimmedQ !== "" && settledQuery !== q;

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6 px-5 py-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-xl font-semibold">検索</h1>
        {trimmedQ !== "" ? (
          <p className="text-sm leading-display text-muted-foreground">「{q}」の結果</p>
        ) : null}
      </header>

      {trimmedQ === "" ? (
        <p className="text-sm leading-display text-muted-foreground">
          法令名や条文参照（民709、国賠法1条 など）を入力してください。
        </p>
      ) : null}

      {trimmedQ !== "" && isSearching ? (
        <div role="status" aria-label="検索中" className="grid gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {/* 空クエリ時は effect が outcome を更新しないため、stale な outcome を表示しないようにガードする。 */}
      {!isSearching && trimmedQ !== "" && outcome.status === "unresolved" ? (
        <p
          role="status"
          className="rounded-md border border-dashed px-4 py-5 text-sm leading-display text-muted-foreground"
        >
          {outcome.reason === "needs-context"
            ? "相対参照は前後の文脈が必要です。法令名を含めて入力してください。"
            : "該当する法令が見つかりませんでした。"}
        </p>
      ) : null}

      {!isSearching &&
      trimmedQ !== "" &&
      outcome.status === "candidates" &&
      outcome.candidates.length > 0 ? (
        <label className="grid w-full max-w-60 gap-1 text-sm font-medium text-foreground">
          科目で絞り込む
          <Select
            onChange={(event) => {
              // findSubject で検証し、不明値は「すべての科目」に倒す。
              setSubjectFilter(findSubject(event.target.value)?.id ?? "all");
            }}
            value={subjectFilter}
          >
            <option value="all">すべての科目</option>
            {gyoseishoshiSubjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.label}
              </option>
            ))}
          </Select>
        </label>
      ) : null}

      {!isSearching &&
      trimmedQ !== "" &&
      outcome.status === "candidates" &&
      visibleCandidates.length > 0 ? (
        <ul className="grid gap-3">
          {visibleCandidates.map((candidate) => (
            <li key={`${candidate.kind}:${candidate.lawId}:${candidate.article ?? ""}`}>
              <CandidateLink candidate={candidate} />
            </li>
          ))}
        </ul>
      ) : null}

      {!isSearching &&
      trimmedQ !== "" &&
      outcome.status === "candidates" &&
      outcome.candidates.length === 0 ? (
        <p className="text-sm leading-display text-muted-foreground">該当する候補がありません。</p>
      ) : null}

      {!isSearching &&
      trimmedQ !== "" &&
      outcome.status === "candidates" &&
      outcome.candidates.length > 0 &&
      visibleCandidates.length === 0 ? (
        <p className="text-sm leading-display text-muted-foreground">
          この科目に該当する候補がありません。
        </p>
      ) : null}
    </section>
  );
};
