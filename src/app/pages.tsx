import { Link } from "@tanstack/react-router";
import { BookOpenCheck } from "lucide-react";
import { useEffect, useState } from "react";

import type { StudyCard } from "@/core/domain";
import { createStorageRepository } from "@/core/storage";
import type { SavedLawSummary, StorageRepository } from "@/core/storage";
import { gyoseishoshiSubjects, isLawInSubject } from "@/core/study";
import { Badge } from "@/shared/ui/badge";
import { formatIsoDateLabel } from "@/shared/utils/dates";

import { useSavedLaws } from "./use-saved-laws";

const defaultStorageRepository = createStorageRepository();

export const LawsPage = ({
  storageRepository = defaultStorageRepository,
}: {
  storageRepository?: StorageRepository;
}) => {
  const { savedLaws, savedLawsError } = useSavedLaws(storageRepository);

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-8 px-5 py-8 md:px-6">
      <div className="grid gap-3">
        <h1 className="font-serif text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
          法令を探す
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          法令名、略称、法令番号から目的の法令へ進むための入口です。
        </p>
      </div>

      <section aria-labelledby="saved-laws-heading" className="grid gap-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <BookOpenCheck className="size-4 text-primary" aria-hidden="true" />
            <h2 id="saved-laws-heading" className="text-lg font-semibold text-foreground">
              保存済み法令
            </h2>
          </div>
          <Link
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            to="/saved"
          >
            保存リストを開く
          </Link>
        </div>
        {savedLawsError !== undefined ? (
          <p
            role="status"
            className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground"
          >
            {savedLawsError}
          </p>
        ) : savedLaws.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
            保存済み法令はまだありません。
          </p>
        ) : (
          <ul className="grid gap-2">
            {savedLaws.map((savedLaw) => (
              <li key={savedLaw.law.lawId} className="rounded-md border bg-card p-4">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-2">
                    <Link
                      className="font-serif text-base font-semibold text-foreground underline-offset-4 hover:underline"
                      params={{ lawId: savedLaw.law.lawId }}
                      to="/laws/$lawId"
                    >
                      {savedLaw.law.title}
                    </Link>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      <span>最終取得: {formatSavedLawFetchedDate(savedLaw)}</span>
                      <span>{savedLaw.nodeCount.toLocaleString("ja-JP")} ノード</span>
                    </div>
                  </div>
                  <Badge variant="secondary">オフライン保存済み</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
};

const formatSavedLawFetchedDate = (savedLaw: SavedLawSummary): string =>
  formatIsoDateLabel(savedLaw.revision.fetchedAt);

export const StudyPage = ({
  // 本番ルーターは createAppRouter() を引数なしで呼ぶため、DI がないときは既定のリポジトリへフォールバックする。
  storageRepository = defaultStorageRepository,
}: { storageRepository?: StorageRepository } = {}) => {
  // undefined = 読み込み前または失敗。件数表示を省略して導線だけ出す。
  const [cards, setCards] = useState<StudyCard[]>();

  useEffect(() => {
    let isCurrent = true;

    void storageRepository
      .listStudyCards()
      .then((loaded) => {
        if (isCurrent) {
          setCards(loaded);
        }
      })
      .catch(() => {
        // 読み込み失敗時は件数を出さないだけに留め、ページ全体は表示する。
        if (isCurrent) {
          setCards(undefined);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [storageRepository]);

  return (
    <section className="mx-auto grid w-full max-w-2xl gap-4 px-5 py-10">
      <h1 className="font-serif text-2xl font-semibold text-foreground">復習</h1>
      <div className="rounded-md bg-primary p-4 text-primary-foreground">
        <p className="font-semibold">今日の復習</p>
        <p className="mt-1 text-xs opacity-75">復習カード機能は準備中です</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-md border bg-card p-4">
          <h2 className="text-sm font-medium text-foreground">条文カード</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {cards === undefined
              ? "保存したカードを一覧できます"
              : `${cards.length.toLocaleString("ja-JP")} 件のカード`}
          </p>
          <Link
            className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
            to="/study/cards"
          >
            カード一覧を開く
          </Link>
        </section>
        <section className="rounded-md border bg-card p-4">
          <h2 className="text-sm font-medium text-foreground">苦手な条文</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">準備中</p>
        </section>
        <section className="rounded-md border bg-card p-4">
          <h2 id="subject-presets-heading" className="text-sm font-medium text-foreground">
            科目別プリセット
          </h2>
          <ul aria-labelledby="subject-presets-heading" className="mt-2 grid gap-1.5">
            {gyoseishoshiSubjects.map((subject) => (
              <li key={subject.id} className="flex items-center justify-between gap-2 text-sm">
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  search={{ subject: subject.id }}
                  to="/study/cards"
                >
                  {subject.label}
                </Link>
                {cards === undefined ? null : (
                  <span className="text-xs text-muted-foreground">
                    {cards
                      .filter((card) => isLawInSubject(subject.id, card.target.lawId))
                      .length.toLocaleString("ja-JP")}{" "}
                    件
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
};

export { HomePage } from "./home-page";
export { LawViewerPage } from "./law-viewer-page";
export { ScannerPage } from "./scanner-page";
export { SearchPage } from "./search-page";
export { SettingsPage } from "./settings-page";
