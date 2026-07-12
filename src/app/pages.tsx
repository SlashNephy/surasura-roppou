import { Link } from "@tanstack/react-router";
import { BookOpenCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { createStorageRepository } from "@/core/storage";
import type { SavedLawSummary, StorageRepository } from "@/core/storage";
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

export const StudyPage = ({ storageRepository }: { storageRepository?: StorageRepository }) => {
  const [cardCount, setCardCount] = useState<number>();

  useEffect(() => {
    if (storageRepository === undefined) {
      return;
    }

    let isCurrent = true;

    void storageRepository
      .listStudyCards()
      .then((cards) => {
        if (isCurrent) {
          setCardCount(cards.length);
        }
      })
      .catch(() => {
        // 読み込み失敗時は件数を出さないだけに留め、ページ全体は表示する。
        if (isCurrent) {
          setCardCount(undefined);
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
            {cardCount === undefined
              ? "保存したカードを一覧できます"
              : `${String(cardCount)} 件のカード`}
          </p>
          <Link
            className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline"
            to="/study/cards"
          >
            カード一覧を開く
          </Link>
        </section>
        {(["苦手な条文", "科目別プリセット"] as const).map((title) => (
          <section key={title} className="rounded-md border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground">{title}</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">準備中</p>
          </section>
        ))}
      </div>
    </section>
  );
};

export { HomePage } from "./home-page";
export { LawViewerPage } from "./law-viewer-page";
export { ScannerPage } from "./scanner-page";
export { SearchPage } from "./search-page";
export { SettingsPage } from "./settings-page";
