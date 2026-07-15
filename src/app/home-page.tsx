import { Link } from "@tanstack/react-router";
import {
  BookOpenCheck,
  Camera,
  ClipboardPaste,
  GraduationCap,
  Search,
  TrendingUp,
} from "lucide-react";

import { createStorageRepository } from "@/core/storage";
import type { StorageRepository } from "@/core/storage";
import { Button } from "@/shared/ui/button";

import { useSavedLaws } from "./use-saved-laws";
import { useSearchPalette } from "./search-palette-context";
import { useStudyDashboard } from "./use-study-dashboard";

const defaultStorageRepository = createStorageRepository();

// 初回起動時のコールドスタート対策として提示する定番法令（e-Gov lawId）
const featuredLaws = [
  { lawId: "321CONSTITUTION", title: "日本国憲法" },
  { lawId: "129AC0000000089", title: "民法" },
  { lawId: "140AC0000000045", title: "刑法" },
] as const;

export const HomePage = ({
  storageRepository = defaultStorageRepository,
}: {
  storageRepository?: StorageRepository;
}) => {
  const { savedLaws, savedLawsError } = useSavedLaws(storageRepository);
  const { dashboard, error } = useStudyDashboard(storageRepository);
  const hasSavedLaws = savedLaws.length > 0;
  const { open } = useSearchPalette();

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-10 px-5 py-12 md:py-16">
      <div className="grid justify-items-center gap-4 text-center">
        <h1 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">
          撮って、開いて、すらすら読める。
        </h1>
        <p className="text-sm text-muted-foreground">e-Gov 法令データに基づく法令ビューワー</p>
        {/* クリックで検索パレットを開く。/laws へのナビゲーションは廃止した。 */}
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full max-w-md justify-start gap-2"
          onClick={open}
        >
          <span className="sr-only">検索</span>
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="truncate text-muted-foreground">法律や条文で検索できます</span>
        </Button>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/scanner">
              <Camera className="size-4" aria-hidden="true" />
              撮って開く
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/scanner">
              <ClipboardPaste className="size-4" aria-hidden="true" />
              貼り付けて開く
            </Link>
          </Button>
        </div>
      </div>

      {error !== undefined ? (
        // 読み込み失敗時は savedLawsError と同型のバナーでエラーを明示する
        <p
          role="status"
          className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground"
        >
          {error}
        </p>
      ) : dashboard !== undefined &&
        (dashboard.dueCount > 0 ||
          dashboard.cardCount > 0 ||
          dashboard.stats.accuracy !== undefined) ? (
        <section aria-labelledby="home-study-heading" className="grid gap-4">
          <h2 id="home-study-heading" className="sr-only">
            学習
          </h2>
          <Button asChild className="h-auto justify-start gap-3 py-3">
            <Link to="/study">
              <GraduationCap className="size-5" aria-hidden="true" />
              <span className="grid text-left">
                <span className="font-semibold">
                  {dashboard.dueCount > 0
                    ? `今日の復習 ${dashboard.dueCount.toLocaleString("ja-JP")} 件`
                    : "今日の復習はありません"}
                </span>
                <span className="text-xs opacity-75">
                  {dashboard.stats.accuracy === undefined
                    ? "復習を始めると正答率が表示されます"
                    : `通算正答率 ${String(Math.round(dashboard.stats.accuracy * 100))}%`}
                </span>
              </span>
            </Link>
          </Button>

          <div className="grid gap-4 sm:grid-cols-2">
            <section
              aria-labelledby="home-weak-heading"
              className="grid gap-2 rounded-md border bg-card p-4"
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />
                <h3 id="home-weak-heading" className="text-sm font-semibold text-foreground">
                  苦手な条文
                </h3>
              </div>
              {dashboard.weakCards.length === 0 ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  まだ苦手な条文はありません
                </p>
              ) : (
                <ul className="grid gap-1.5">
                  {dashboard.weakCards.map((weak) => (
                    <li
                      key={weak.card.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <Link
                        className="min-w-0 truncate text-primary underline-offset-4 hover:underline"
                        params={{
                          lawId: weak.card.target.lawId,
                          article: weak.card.target.article ?? "",
                        }}
                        to="/laws/$lawId/articles/$article"
                      >
                        {weak.card.question}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {Math.round(weak.accuracy * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-labelledby="home-recent-heading"
              className="grid gap-2 rounded-md border bg-card p-4"
            >
              <div className="flex items-center gap-2">
                <BookOpenCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                <h3 id="home-recent-heading" className="text-sm font-semibold text-foreground">
                  最近開いた
                </h3>
              </div>
              {dashboard.recentItems.length === 0 ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  最近開いた項目はまだありません
                </p>
              ) : (
                <ul className="grid gap-1.5">
                  {dashboard.recentItems.map((item) =>
                    item.kind === "law" ? (
                      <li key={`law-${item.lawId}`} className="text-sm">
                        <Link
                          className="block truncate text-primary underline-offset-4 hover:underline"
                          params={{ lawId: item.lawId }}
                          to="/laws/$lawId"
                        >
                          {item.title}
                        </Link>
                      </li>
                    ) : (
                      <li key={`card-${item.card.id}`} className="text-sm">
                        <Link
                          className="block truncate text-primary underline-offset-4 hover:underline"
                          params={{
                            lawId: item.card.target.lawId,
                            article: item.card.target.article ?? "",
                          }}
                          to="/laws/$lawId/articles/$article"
                        >
                          {item.card.question}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>
          </div>
        </section>
      ) : null}

      {savedLawsError !== undefined ? (
        // ストレージ障害時は空状態（チップ）と区別できるようエラーを明示する
        <p
          role="status"
          className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground"
        >
          {savedLawsError}
        </p>
      ) : hasSavedLaws ? (
        <div className="grid gap-4">
          <section aria-labelledby="home-saved-laws-heading" className="grid gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <h2 id="home-saved-laws-heading" className="text-lg font-semibold text-foreground">
                オフライン保存済み
              </h2>
              <Link
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                to="/saved"
              >
                すべて表示
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {savedLaws.map((savedLaw) => (
                <li key={savedLaw.law.lawId} className="rounded-md border bg-card p-4">
                  <Link
                    className="font-serif text-base font-semibold text-foreground underline-offset-4 hover:underline"
                    params={{ lawId: savedLaw.law.lawId }}
                    to="/laws/$lawId"
                  >
                    {savedLaw.law.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {savedLaw.nodeCount.toLocaleString("ja-JP")} ノード
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="grid justify-items-center gap-3 text-center">
          <p className="text-xs tracking-widest text-muted-foreground">よく読まれている法令</p>
          <div className="flex flex-wrap justify-center gap-2">
            {featuredLaws.map((law) => (
              <Button asChild key={law.lawId} variant="outline" className="rounded-full font-serif">
                <Link params={{ lawId: law.lawId }} to="/laws/$lawId">
                  {law.title}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
