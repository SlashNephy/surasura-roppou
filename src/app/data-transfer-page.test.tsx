import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SavedDataImportResult, StorageRepository } from "@/core/storage";
import { createSavedDataExportFixture } from "@/test/fixtures/saved-data";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { createAppRouter } from "./router";

setupScrollMocks();

const allDataCounts = {
  annotations: 1,
  bookmarks: 1,
  collections: 1,
  reviewLogs: 1,
  savedLaws: 1,
  studyCards: 1,
  studySessions: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DataTransferPage", () => {
  it("previews all seven version 2 categories before importing the exact selected data", async () => {
    const data = createSavedDataExportFixture();
    const result: SavedDataImportResult = {
      counts: allDataCounts,
      importedAt: "2026-07-15T00:01:00.000Z",
    };
    const importSavedData = vi.fn<StorageRepository["importSavedData"]>(() =>
      Promise.resolve(result),
    );
    const repository = createRepository({ importSavedData });
    const user = userEvent.setup();

    renderDataTransferRoute(repository);

    await user.upload(
      await screen.findByLabelText("インポートするJSONファイル"),
      createJsonFile(data),
    );

    const preview = await screen.findByRole("region", { name: "インポート内容の確認" });
    expect(within(preview).getByText("version 2")).toBeInTheDocument();
    const expectedExportedAt = new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(data.exportedAt));
    expect(within(preview).getByText(expectedExportedAt)).toHaveAttribute(
      "datetime",
      data.exportedAt,
    );
    expect(preview).not.toHaveTextContent(data.exportedAt);
    for (const label of [
      "保存法令本文",
      "ブックマーク",
      "コレクション",
      "メモ",
      "学習カード",
      "回答ログ",
      "学習セッション",
    ]) {
      expect(within(preview).getByText(label)).toBeInTheDocument();
    }
    expect(within(preview).getAllByText("1件")).toHaveLength(7);
    expect(importSavedData).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "この内容をインポート" }));

    expect(importSavedData).toHaveBeenCalledExactlyOnceWith(data);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "7分類、合計7件のデータを取り込みました。",
    );
  });

  it("rejects a version 1 file without importing it", async () => {
    const data = { ...createSavedDataExportFixture(), version: 1 };
    const importSavedData = vi.fn<StorageRepository["importSavedData"]>();
    const user = userEvent.setup();

    renderDataTransferRoute(createRepository({ importSavedData }));

    await user.upload(
      await screen.findByLabelText("インポートするJSONファイル"),
      createJsonFile(data),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/export version 2/);
    expect(screen.queryByRole("region", { name: "インポート内容の確認" })).not.toBeInTheDocument();
    expect(importSavedData).not.toHaveBeenCalled();
  });

  it("describes an invalid schema without exposing raw validator details", async () => {
    const data = { ...createSavedDataExportFixture(), unknownField: true };
    const user = userEvent.setup();

    renderDataTransferRoute();

    await user.upload(
      await screen.findByLabelText("インポートするJSONファイル"),
      createJsonFile(data),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("export version 2の形式と一致しません");
    expect(alert).not.toHaveTextContent("must NOT");
    expect(alert).not.toHaveTextContent("unknownField");
  });

  it("describes duplicate IDs without exposing the internal ID", async () => {
    const data = createSavedDataExportFixture();
    const bookmark = data.bookmarks[0];
    const duplicateId = bookmark.id;
    data.bookmarks.push({ ...bookmark });
    const user = userEvent.setup();

    renderDataTransferRoute();

    await user.upload(
      await screen.findByLabelText("インポートするJSONファイル"),
      createJsonFile(data),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("同じIDのデータが重複");
    expect(alert).toHaveTextContent("元のアプリでデータを書き出し直");
    expect(alert).not.toHaveTextContent("Duplicate");
    expect(alert).not.toHaveTextContent(duplicateId);
  });

  it("describes missing related data without exposing internal references", async () => {
    const data = createSavedDataExportFixture();
    const missingCardId = "missing-study-card-id";
    data.reviewLogs[0] = { ...data.reviewLogs[0], cardId: missingCardId };
    const user = userEvent.setup();

    renderDataTransferRoute();

    await user.upload(
      await screen.findByLabelText("インポートするJSONファイル"),
      createJsonFile(data),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("関連するデータが不足");
    expect(alert).toHaveTextContent("元のアプリでデータを書き出し直");
    expect(alert).not.toHaveTextContent("Review log");
    expect(alert).not.toHaveTextContent(missingCardId);
  });

  it("keeps the preview and reports that data is unchanged when repository import fails", async () => {
    const data = createSavedDataExportFixture();
    const importSavedData = vi.fn<StorageRepository["importSavedData"]>(() =>
      Promise.reject(new Error("IndexedDB transaction aborted")),
    );
    const user = userEvent.setup();

    renderDataTransferRoute(createRepository({ importSavedData }));

    await user.upload(
      await screen.findByLabelText("インポートするJSONファイル"),
      createJsonFile(data),
    );
    await user.click(screen.getByRole("button", { name: "この内容をインポート" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("データは変更されていません");
    expect(screen.getByRole("region", { name: "インポート内容の確認" })).toBeInTheDocument();
  });

  it("announces reading and disables every data action while file text is pending", async () => {
    const data = createSavedDataExportFixture();
    const deferred = createDeferred<string>();
    const file = createJsonFile(data);
    Object.defineProperty(file, "text", { value: () => deferred.promise });
    const user = userEvent.setup();

    renderDataTransferRoute();

    const fileInput = await screen.findByLabelText("インポートするJSONファイル");
    await user.upload(fileInput, file);

    expect(fileInput).toBeDisabled();
    expect(fileInput).toHaveAttribute("name", "saved-data-import");
    expect(fileInput).toHaveAttribute("autocomplete", "off");
    expect(screen.getByRole("button", { name: "JSONをエクスポート" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("JSONファイルを確認中…");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "インポート" }).closest("section")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    deferred.resolve(JSON.stringify(data));
    expect(await screen.findByRole("region", { name: "インポート内容の確認" })).toBeInTheDocument();
  });

  it("announces exporting and disables every data action while export is pending", async () => {
    const data = createSavedDataExportFixture();
    const deferred = createDeferred<typeof data.bookmarks>();
    const repository = createRepository({ listBookmarks: () => deferred.promise });
    const user = userEvent.setup();

    renderDataTransferRoute(repository);

    const fileInput = await screen.findByLabelText("インポートするJSONファイル");
    await user.upload(fileInput, createJsonFile(data));
    await user.click(screen.getByRole("button", { name: "JSONをエクスポート" }));

    expect(fileInput).toBeDisabled();
    expect(screen.getByRole("button", { name: "エクスポート中…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("button", { name: "この内容をインポート" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("エクスポート中…");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "エクスポート" }).closest("section"),
    ).toHaveAttribute("aria-busy", "true");

    deferred.reject(new Error("export stopped after busy-state assertion"));
    expect(await screen.findByRole("alert")).toHaveTextContent("JSONを書き出せませんでした");
  });

  it("announces importing and disables every data action while import is pending", async () => {
    const data = createSavedDataExportFixture();
    const deferred = createDeferred<SavedDataImportResult>();
    const importSavedData = vi.fn<StorageRepository["importSavedData"]>(() => deferred.promise);
    const user = userEvent.setup();

    renderDataTransferRoute(createRepository({ importSavedData }));

    const fileInput = await screen.findByLabelText("インポートするJSONファイル");
    await user.upload(fileInput, createJsonFile(data));
    await user.click(screen.getByRole("button", { name: "この内容をインポート" }));

    expect(fileInput).toBeDisabled();
    expect(screen.getByRole("button", { name: "JSONをエクスポート" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "インポート中…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("インポート中…");
    expect(screen.getByRole("heading", { name: "インポート" }).closest("section")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    deferred.resolve({
      counts: allDataCounts,
      importedAt: "2026-07-15T00:01:00.000Z",
    });

    await screen.findByText("7分類、合計7件のデータを取り込みました。");
    expect(screen.getByRole("status")).toHaveTextContent(
      "7分類、合計7件のデータを取り込みました。",
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(fileInput).toBeEnabled();
    expect(screen.getByRole("button", { name: "JSONをエクスポート" })).toBeEnabled();
  });

  it("downloads a version 2 JSON file and reports export success", async () => {
    const data = createSavedDataExportFixture();
    const repository = createMemoryStorageRepository({
      annotations: data.annotations,
      bookmarks: data.bookmarks,
      collections: data.collections,
      reviewLogs: data.reviewLogs,
      savedLawDocument: data.savedLaws[0],
      studyCards: data.studyCards,
      studySessions: data.studySessions,
    }).repository;
    const user = userEvent.setup();
    let exportedBlob: Blob | undefined;
    let downloadedFileName: string | undefined;
    let downloadedHref: string | undefined;
    const createObjectURL = vi.fn<(blob: Blob) => string>((blob) => {
      exportedBlob = blob;
      return "blob:data-transfer";
    });
    const revokeObjectURL = vi.fn<(url: string) => void>();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFileName = this.download;
      downloadedHref = this.href;
    });

    await withObjectUrl(createObjectURL, revokeObjectURL, async () => {
      renderDataTransferRoute(repository);

      await user.click(await screen.findByRole("button", { name: "JSONをエクスポート" }));

      expect(await screen.findByRole("status")).toHaveTextContent("JSONを書き出しました。");
    });

    expect(downloadedFileName).toMatch(/^surasura-roppou-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(downloadedHref).toBe("blob:data-transfer");
    expect(createObjectURL).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:data-transfer");
    });
    if (exportedBlob === undefined) {
      throw new Error("Expected export blob to be created");
    }
    expect(JSON.parse(await exportedBlob.text()) as unknown).toMatchObject({ version: 2 });
  });

  it("clears an old preview when a newly selected file is invalid JSON", async () => {
    const user = userEvent.setup();

    renderDataTransferRoute();

    const input = await screen.findByLabelText("インポートするJSONファイル");
    await user.upload(input, createJsonFile(createSavedDataExportFixture()));
    expect(await screen.findByRole("region", { name: "インポート内容の確認" })).toBeInTheDocument();

    await user.upload(input, new File(["{"], "broken.json", { type: "application/json" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("JSONとして読み取れません");
    expect(screen.queryByRole("region", { name: "インポート内容の確認" })).not.toBeInTheDocument();
  });

  it("shows an unknown-date fallback without creating an invalid time element", async () => {
    const data = { ...createSavedDataExportFixture(), exportedAt: "not-a-date" };
    const user = userEvent.setup();

    renderDataTransferRoute();

    await user.upload(
      await screen.findByLabelText("インポートするJSONファイル"),
      createJsonFile(data),
    );

    const preview = await screen.findByRole("region", { name: "インポート内容の確認" });
    expect(within(preview).getByText("日時不明")).toBeInTheDocument();
    expect(within(preview).queryByText("not-a-date")).not.toBeInTheDocument();
    expect(preview.querySelector("time")).not.toBeInTheDocument();
  });

  it.each(["0", "2026/07/15"])(
    "rejects the non-canonical exportedAt value %s without creating a time element",
    async (exportedAt) => {
      const data = { ...createSavedDataExportFixture(), exportedAt };
      const user = userEvent.setup();

      renderDataTransferRoute();

      await user.upload(
        await screen.findByLabelText("インポートするJSONファイル"),
        createJsonFile(data),
      );

      const preview = await screen.findByRole("region", { name: "インポート内容の確認" });
      expect(within(preview).getByText("日時不明")).toBeInTheDocument();
      expect(within(preview).queryByText(exportedAt)).not.toBeInTheDocument();
      expect(preview.querySelector("time")).not.toBeInTheDocument();
    },
  );

  it("formats four-digit category counts for Japanese readers", async () => {
    const data = createSavedDataExportFixture();
    const bookmark = data.bookmarks[0];
    data.bookmarks = [
      bookmark,
      ...Array.from({ length: 1233 }, (_, index) => ({
        ...bookmark,
        id: `bookmark-${(index + 2).toLocaleString("en-US", { useGrouping: false })}`,
      })),
    ];
    const user = userEvent.setup();

    renderDataTransferRoute();

    await user.upload(
      await screen.findByLabelText("インポートするJSONファイル"),
      createJsonFile(data),
    );

    const preview = await screen.findByRole("region", { name: "インポート内容の確認" });
    expect(within(preview).getByText("1,234件")).toBeInTheDocument();
  });
});

const renderDataTransferRoute = (
  storageRepository = createMemoryStorageRepository().repository,
) => {
  const history = createMemoryHistory({ initialEntries: ["/settings/data-transfer"] });

  render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);
};

const createRepository = (overrides: Partial<StorageRepository>): StorageRepository => ({
  ...createMemoryStorageRepository().repository,
  ...overrides,
});

const createJsonFile = (data: unknown): File =>
  new File([JSON.stringify(data)], "surasura-roppou.json", { type: "application/json" });

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

const withObjectUrl = async (
  createObjectURL: (blob: Blob) => string,
  revokeObjectURL: (url: string) => void,
  callback: () => Promise<void>,
) => {
  const originalCreateDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const originalRevokeDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });

  try {
    await callback();
  } finally {
    if (originalCreateDescriptor === undefined) {
      Reflect.deleteProperty(URL, "createObjectURL");
    } else {
      Object.defineProperty(URL, "createObjectURL", originalCreateDescriptor);
    }

    if (originalRevokeDescriptor === undefined) {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    } else {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeDescriptor);
    }
  }
};
