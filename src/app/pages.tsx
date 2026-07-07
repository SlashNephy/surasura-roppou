import { Link } from "@tanstack/react-router";
import { BookOpenCheck, Camera } from "lucide-react";

import { createStorageRepository } from "@/core/storage";
import type { SavedLawSummary, StorageRepository } from "@/core/storage";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
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

export const ScannerPage = () => (
  <section className="mx-auto grid w-full max-w-md gap-4 px-5 py-12 text-center">
    <h1 className="font-serif text-2xl font-semibold text-foreground">
      問題集や資料から条文を開く
    </h1>
    <p className="text-xs text-muted-foreground">
      <span aria-hidden="true">🔒 </span>画像は端末内で処理され、保存・送信されません
    </p>
    <Button disabled type="button" className="h-auto w-full flex-col gap-1 py-8">
      <Camera className="size-6" aria-hidden="true" />
      <span className="font-semibold">撮る・画像を選ぶ（準備中）</span>
      <span className="text-xs opacity-75">カメラかライブラリを選択できます</span>
    </Button>
    <Button disabled type="button" variant="outline" className="w-full">
      クリップボードから貼り付け（準備中）
    </Button>
  </section>
);

export const StudyPage = () => (
  <section className="mx-auto grid w-full max-w-2xl gap-4 px-5 py-10">
    <h1 className="font-serif text-2xl font-semibold text-foreground">復習</h1>
    <div className="rounded-md bg-primary p-4 text-primary-foreground">
      <p className="font-semibold">今日の復習</p>
      <p className="mt-1 text-xs opacity-75">復習カード機能は準備中です</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {(["苦手な条文", "カードの内訳", "科目別プリセット"] as const).map((title) => (
        <section key={title} className="rounded-md border bg-card p-4">
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">準備中</p>
        </section>
      ))}
    </div>
  </section>
);

interface SettingsRow {
  label: string;
  value: string;
}

interface SettingsGroup {
  heading: string;
  rows: SettingsRow[];
}

const settingsGroups: SettingsGroup[] = [
  {
    heading: "表示",
    rows: [
      { label: "文字サイズ", value: "標準" },
      { label: "行間", value: "ゆったり" },
      { label: "テーマ", value: "自動" },
      { label: "既定の表示", value: "読みやすい表示" },
    ],
  },
  {
    heading: "学習",
    rows: [
      { label: "学習年度の基準日", value: "未設定" },
      { label: "科目プリセット", value: "未設定" },
    ],
  },
  {
    heading: "データ",
    rows: [
      { label: "オフライン保存の管理", value: "準備中" },
      { label: "エクスポート / インポート", value: "準備中" },
      { label: "ときどき六法と連携", value: "未接続" },
    ],
  },
];

export const SettingsPage = () => (
  <section className="mx-auto grid w-full max-w-2xl gap-6 px-5 py-10">
    <h1 className="font-serif text-2xl font-semibold text-foreground">設定</h1>
    {settingsGroups.map((group) => (
      <section key={group.heading} className="grid gap-2">
        <h2 className="text-xs font-medium tracking-widest text-muted-foreground">
          {group.heading}
        </h2>
        <div className="divide-y rounded-md border bg-card">
          {group.rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-foreground">{row.label}</span>
              <span className="text-muted-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      </section>
    ))}
    <p className="text-center text-xs text-muted-foreground">
      すらすら六法 ・ 法令データ: e-Gov 法令検索
      <br />
      本アプリは学習補助であり、法的助言を提供するものではありません
    </p>
  </section>
);

export { HomePage } from "./home-page";
export { LawViewerPage } from "./law-viewer-page";
