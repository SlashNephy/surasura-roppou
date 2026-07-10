import { useEffect, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import type { QuickSearch, QuickSearchCandidate, QuickSearchOutcome } from "@/core/jump";

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
      <span className="text-xs text-muted-foreground">{candidate.reason.join(" / ")}</span>
    </>
  );

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

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed === "") {
      // 空クエリのときは outcome の更新は不要。初期値 "empty" のまま表示する。
      return;
    }

    let cancelled = false;
    void quickSearch
      .search(trimmed)
      .then((next) => {
        if (!cancelled) {
          setOutcome(next);
        }
      })
      .catch((error: unknown) => {
        console.error("search page query failed", error);
        if (!cancelled) {
          // 検索失敗時は空の候補リストにフォールバックして「該当なし」状態を表示する。
          setOutcome({ status: "candidates", candidates: [], autoJump: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [q, quickSearch]);

  // 単一の確定候補はページを挟まず該当条文へ置換遷移する。履歴を汚さないよう replace: true を使う。
  useEffect(() => {
    if (outcome.status !== "candidates" || !outcome.autoJump || outcome.candidates.length !== 1) {
      return;
    }

    navigateToCandidate(navigate, outcome.candidates[0], { replace: true });
  }, [outcome, navigate]);

  const trimmedQ = q.trim();

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6 px-5 py-10">
      <header className="grid gap-1">
        <h1 className="font-serif text-xl font-semibold">検索</h1>
        {trimmedQ !== "" ? <p className="text-sm text-muted-foreground">「{q}」の結果</p> : null}
      </header>

      {trimmedQ === "" ? (
        <p className="text-sm text-muted-foreground">
          法令名や条文参照（民709、国賠法1条 など）を入力してください。
        </p>
      ) : null}

      {outcome.status === "unresolved" ? (
        <p
          role="status"
          className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground"
        >
          {outcome.reason === "needs-context"
            ? "相対参照は前後の文脈が必要です。法令名を含めて入力してください。"
            : "該当する法令が見つかりませんでした。"}
        </p>
      ) : null}

      {outcome.status === "candidates" && outcome.candidates.length > 0 ? (
        <ul className="grid gap-3">
          {outcome.candidates.map((candidate) => (
            <li key={`${candidate.kind}:${candidate.lawId}:${candidate.article ?? ""}`}>
              <CandidateLink candidate={candidate} />
            </li>
          ))}
        </ul>
      ) : null}

      {outcome.status === "candidates" && outcome.candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">該当する候補がありません。</p>
      ) : null}
    </section>
  );
};
