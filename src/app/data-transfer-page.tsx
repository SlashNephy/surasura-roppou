import { type ChangeEvent, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, Upload } from "lucide-react";

import {
  applySavedDataImport,
  createSavedDataFile,
  prepareSavedDataImportFile,
} from "@/core/native-integration";
import {
  SavedDataImportError,
  createStorageRepository,
  type PreparedSavedDataImport,
  type SavedDataCounts,
  type SavedDataImportErrorCode,
  type StorageRepository,
} from "@/core/storage";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

import { downloadTextFile } from "./download-text-file";

const defaultStorageRepository = createStorageRepository();

const dataCountDefinitions: readonly {
  key: keyof SavedDataCounts;
  label: string;
}[] = [
  { key: "savedLaws", label: "保存法令本文" },
  { key: "bookmarks", label: "ブックマーク" },
  { key: "collections", label: "コレクション" },
  { key: "annotations", label: "メモ" },
  { key: "studyCards", label: "学習カード" },
  { key: "reviewLogs", label: "回答ログ" },
  { key: "studySessions", label: "学習セッション" },
];

type BusyState = "reading" | "exporting" | "importing" | undefined;

const busyMessages: Record<Exclude<BusyState, undefined>, string> = {
  reading: "JSONファイルを確認中…",
  exporting: "エクスポート中…",
  importing: "インポート中…",
};

const importErrorMessages: Record<SavedDataImportErrorCode, string> = {
  "invalid-json": "ファイルをJSONとして読み取れません。内容を確認してください。",
  "unsupported-version":
    "このファイルには対応していません。export version 2 のJSONを選択してください。",
  "invalid-schema":
    "JSONがexport version 2の形式と一致しません。元のアプリでデータを書き出し直してください。",
  "duplicate-id": "同じIDのデータが重複しています。元のアプリでデータを書き出し直してください。",
  "invalid-reference":
    "関連するデータが不足しています。元のアプリでデータを書き出し直してください。",
};

const exportedAtFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "medium",
});
const countFormatter = new Intl.NumberFormat("ja-JP");

const importErrorMessage = (error: unknown): string =>
  error instanceof SavedDataImportError
    ? importErrorMessages[error.code]
    : "JSONファイルを検証できませんでした。別のファイルを選択してください。";

const formatExportedAt = (exportedAt: string): string | undefined => {
  const timestamp = Date.parse(exportedAt);

  return Number.isNaN(timestamp) ? undefined : exportedAtFormatter.format(new Date(timestamp));
};

interface DataTransferPageProps {
  storageRepository?: StorageRepository;
}

export const DataTransferPage = ({
  storageRepository = defaultStorageRepository,
}: DataTransferPageProps) => {
  const fileInputId = useId();
  const previewHeadingId = useId();
  const [busy, setBusy] = useState<BusyState>();
  const [prepared, setPrepared] = useState<PreparedSavedDataImport | undefined>();
  const [successMessage, setSuccessMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const isBusy = busy !== undefined;
  const busyMessage = busy === undefined ? undefined : busyMessages[busy];
  const formattedExportedAt =
    prepared === undefined ? undefined : formatExportedAt(prepared.preview.exportedAt);
  const countRows =
    prepared === undefined
      ? []
      : dataCountDefinitions.map(({ key, label }) => ({
          formattedCount: countFormatter.format(prepared.preview.counts[key]),
          key,
          label,
        }));

  const handleExport = async () => {
    if (isBusy) {
      return;
    }

    setBusy("exporting");
    setSuccessMessage(undefined);
    setError(undefined);

    try {
      const file = await createSavedDataFile(storageRepository, new Date());
      downloadTextFile(file);
      setSuccessMessage("JSONを書き出しました。");
    } catch {
      setError("JSONを書き出せませんでした。保存データを読み込める状態で再試行してください。");
    } finally {
      setBusy(undefined);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (file === undefined || isBusy) {
      return;
    }

    setBusy("reading");
    setPrepared(undefined);
    setSuccessMessage(undefined);
    setError(undefined);

    let contents: string;
    try {
      contents = await file.text();
    } catch {
      setError("JSONファイルを読み込めませんでした。ファイルを確認して再試行してください。");
      setBusy(undefined);
      return;
    }

    try {
      setPrepared(prepareSavedDataImportFile(contents));
    } catch (validationError) {
      setError(importErrorMessage(validationError));
    } finally {
      setBusy(undefined);
    }
  };

  const handleImport = async () => {
    if (prepared === undefined || isBusy) {
      return;
    }

    setBusy("importing");
    setSuccessMessage(undefined);
    setError(undefined);

    try {
      const result = await applySavedDataImport(storageRepository, prepared);
      const totalCount = dataCountDefinitions.reduce(
        (total, { key }) => total + result.counts[key],
        0,
      );

      setPrepared(undefined);
      setSuccessMessage(
        `7分類、合計${totalCount.toLocaleString("ja-JP")}件のデータを取り込みました。`,
      );
    } catch {
      setError(
        "データを取り込めませんでした。データは変更されていません。内容を確認して再試行してください。",
      );
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6 px-5 py-8 md:px-6 md:py-10">
      <div className="grid gap-3">
        <Link
          className="w-fit rounded-sm text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          to="/settings"
        >
          設定へ戻る
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          データのエクスポート / インポート
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          保存した法令本文と学習データをJSONファイルで別の端末へ移せます。JSONは端末内で処理し、外部へ送信しません。
        </p>
      </div>

      {busy !== undefined || successMessage === undefined ? null : (
        <p
          aria-live="polite"
          className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          {successMessage}
        </p>
      )}
      {error === undefined ? null : (
        <p
          className="break-words rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-6 text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      {busyMessage === undefined ? null : (
        <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
          {busyMessage}
        </p>
      )}

      <section
        aria-busy={busy === "exporting"}
        className="grid gap-4 rounded-lg border bg-card p-4 sm:p-5"
      >
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-foreground">エクスポート</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            現在の7分類の保存データをversion 2のJSONとして書き出します。
          </p>
        </div>
        <Button
          aria-busy={busy === "exporting"}
          className="w-full gap-2 sm:w-fit"
          disabled={isBusy}
          onClick={() => {
            void handleExport();
          }}
          type="button"
          variant="outline"
        >
          <Download aria-hidden="true" className="size-4" />
          {busy === "exporting" ? "エクスポート中…" : "JSONをエクスポート"}
        </Button>
      </section>

      <section
        aria-busy={busy === "reading" || busy === "importing"}
        className="grid gap-4 rounded-lg border bg-card p-4 sm:p-5"
      >
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold text-foreground">インポート</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            version 2のJSONを選択し、内容を確認してから取り込みます。
          </p>
        </div>
        <div className="grid gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor={fileInputId}>
            インポートするJSONファイル
          </label>
          <Input
            accept=".json,application/json"
            className="h-auto min-h-10 py-1.5"
            autoComplete="off"
            disabled={isBusy}
            id={fileInputId}
            name="saved-data-import"
            onChange={(event) => {
              void handleFileChange(event);
            }}
            type="file"
          />
        </div>

        {prepared === undefined ? null : (
          <section
            aria-labelledby={previewHeadingId}
            className="grid gap-4 rounded-md border bg-background p-4"
          >
            <div className="grid gap-2">
              <h3 className="font-semibold text-foreground" id={previewHeadingId}>
                インポート内容の確認
              </h3>
              <dl className="grid gap-1 text-sm sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-x-4">
                <dt className="text-muted-foreground">形式</dt>
                <dd className="break-all text-foreground">version {prepared.preview.version}</dd>
                <dt className="text-muted-foreground">出力日時</dt>
                <dd className="break-words text-foreground">
                  {formattedExportedAt === undefined ? (
                    "日時不明"
                  ) : (
                    <time dateTime={prepared.preview.exportedAt}>{formattedExportedAt}</time>
                  )}
                </dd>
              </dl>
            </div>
            <dl className="divide-y rounded-md border">
              {countRows.map((row) => (
                <div
                  className="flex min-w-0 items-center justify-between gap-4 px-3 py-2 text-sm"
                  key={row.key}
                >
                  <dt className="min-w-0 break-words text-foreground">{row.label}</dt>
                  <dd className="shrink-0 tabular-nums text-muted-foreground">
                    {row.formattedCount}件
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs leading-5 text-muted-foreground">
              同じIDのデータは上書きされ、このファイルに含まれないデータはそのまま残ります。
            </p>
            <Button
              aria-busy={busy === "importing"}
              className="w-full gap-2 sm:w-fit"
              disabled={isBusy}
              onClick={() => {
                void handleImport();
              }}
              type="button"
            >
              <Upload aria-hidden="true" className="size-4" />
              {busy === "importing" ? "インポート中…" : "この内容をインポート"}
            </Button>
          </section>
        )}
      </section>
    </section>
  );
};
