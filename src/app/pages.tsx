import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpenCheck } from "lucide-react";

import { createSavedLawUseCase, createStorageRepository } from "@/core/storage";
import type { SavedLawSummary, StorageRepository } from "@/core/storage";
import { Badge } from "@/shared/ui/badge";

interface Page {
  title: string;
  description: string;
  eyebrow: string;
}

const defaultStorageRepository = createStorageRepository();

const PagePanel = ({ title, description, eyebrow }: Page) => (
  <section className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-3xl flex-col justify-center gap-4 px-5 py-10 md:min-h-[calc(100dvh-4rem)]">
    <p className="text-sm font-medium text-primary">{eyebrow}</p>
    <h1 className="text-3xl font-semibold tracking-normal text-foreground md:text-4xl">{title}</h1>
    <p className="max-w-2xl text-base leading-7 text-muted-foreground">{description}</p>
  </section>
);

export const HomePage = () => (
  <PagePanel
    eyebrow="Home"
    title="今日の条文へ進む"
    description="最近開いた条文、保存済み法令、今日の復習へ戻るための入口です。"
  />
);

export const LawsPage = ({
  storageRepository = defaultStorageRepository,
}: {
  storageRepository?: StorageRepository;
}) => {
  const [savedLaws, setSavedLaws] = useState<SavedLawSummary[]>([]);
  const [savedLawsError, setSavedLawsError] = useState<string | undefined>();
  const savedLawUseCase = useMemo(
    () => createSavedLawUseCase(storageRepository),
    [storageRepository],
  );

  useEffect(() => {
    let isCurrent = true;

    void savedLawUseCase
      .list()
      .then((nextSavedLaws) => {
        if (isCurrent) {
          setSavedLaws(nextSavedLaws);
          setSavedLawsError(undefined);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSavedLaws([]);
          setSavedLawsError("保存済み法令を読み込めませんでした。");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [savedLawUseCase]);

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-8 px-5 py-8 md:px-6">
      <div className="grid gap-3">
        <p className="text-sm font-medium text-primary">Laws</p>
        <h1 className="text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
          法令を探す
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          法令名、略称、法令番号から目的の法令へ進むための入口です。
        </p>
      </div>

      <section aria-labelledby="saved-laws-heading" className="grid gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpenCheck className="size-4 text-primary" aria-hidden="true" />
          <h2 id="saved-laws-heading" className="text-lg font-semibold text-foreground">
            保存済み法令
          </h2>
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
                      className="text-base font-semibold text-foreground underline-offset-4 hover:underline"
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

const formatSavedLawFetchedDate = (savedLaw: SavedLawSummary): string => {
  const fetchedAt = savedLaw.revision.fetchedAt;

  return typeof fetchedAt === "string" && fetchedAt.length >= 10 ? fetchedAt.slice(0, 10) : "不明";
};

export const JumpPage = () => (
  <PagePanel
    eyebrow="Jump"
    title="条文参照を開く"
    description="国賠法1条や民709のような参照表記を入力して、該当条文へ進むための入口です。"
  />
);

export const ScannerPage = () => (
  <PagePanel
    eyebrow="Scanner"
    title="条文参照を撮る"
    description="画像やカメラから条文参照を検出する将来機能の入口です。"
  />
);

export const StudyPage = () => (
  <PagePanel
    eyebrow="Study"
    title="復習を始める"
    description="保存した条文や苦手な論点を復習するための入口です。"
  />
);

export const SettingsPage = () => (
  <PagePanel
    eyebrow="Settings"
    title="設定を調整する"
    description="表示、基準日、オフライン保存、学習設定を調整するための入口です。"
  />
);

export { LawViewerPage } from "./law-viewer-page";
