import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Bookmark, Collection } from "@/core/domain";
import type { SavedDataExport, StorageRepository } from "@/core/storage";
import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { sampleLawViewerDocument } from "./law-viewer-sample";
import { createAppRouter } from "./router";
import { parseTags } from "./saved-page-utils";

setupScrollMocks();

describe("SavedPage", () => {
  it("shows empty states when saved lists have no items", async () => {
    renderSavedRoute("/saved");

    expect(await screen.findByRole("heading", { name: "保存リスト" })).toBeInTheDocument();
    expect(screen.getByText("保存済み法令はまだありません。")).toBeInTheDocument();
    expect(screen.getByText("保存項目はまだありません。")).toBeInTheDocument();
    expect(screen.getByText("コレクションはまだありません。")).toBeInTheDocument();
  });

  it("renders preloaded saved laws, bookmarks, and collections on initial load", async () => {
    const bookmark = createBookmark();
    const collection = createCollection(bookmark.id);
    const storage = createMemoryStorageRepository({
      bookmarks: [bookmark],
      collections: [collection],
      savedLawDocument: createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    });

    renderSavedRoute("/saved", storage.repository);

    expect(await screen.findByRole("heading", { name: "保存リスト" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "民法" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089",
    );
    expect(screen.getByRole("link", { name: "民法1条" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089/articles/1",
    );
    expect(screen.getByRole("link", { name: "民法総則" })).toHaveAttribute(
      "href",
      "/saved/collections/collection-1",
    );
  });

  it("exports saved data as a JSON download", async () => {
    const bookmark = createBookmark();
    const collection = createCollection(bookmark.id);
    const storage = createMemoryStorageRepository({
      bookmarks: [bookmark],
      collections: [collection],
      savedLawDocument: createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    });
    const user = userEvent.setup();
    let exportedBlob: Blob | undefined;
    const createObjectURL = vi.fn<(blob: Blob) => string>((blob) => {
      exportedBlob = blob;
      return "blob:saved-data";
    });
    const revokeObjectURL = vi.fn<(url: string) => void>();
    let downloadedFileName: string | undefined;
    let downloadedHref: string | undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFileName = this.download;
      downloadedHref = this.href;
      // jsdom does not perform downloads; the generated Blob is asserted below.
    });

    try {
      await withObjectUrl(createObjectURL, revokeObjectURL, async () => {
        renderSavedRoute("/saved", storage.repository);

        await screen.findByRole("heading", { name: "保存リスト" });
        await user.click(screen.getByRole("button", { name: "JSONをエクスポート" }));

        expect(await screen.findByRole("status")).toHaveTextContent("JSONを書き出しました。");
      });

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(downloadedFileName).toMatch(/^surasura-roppou-export-\d{4}-\d{2}-\d{2}\.json$/);
      expect(downloadedHref).toBe("blob:saved-data");
      await waitFor(() => {
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:saved-data");
      });

      if (exportedBlob === undefined) {
        throw new Error("Expected export blob to be created");
      }

      const payload = JSON.parse(await exportedBlob.text()) as SavedDataExport;

      expect(payload.bookmarks).toEqual([bookmark]);
      expect(payload.collections).toEqual([collection]);
      expect(payload.version).toBe(2);
      expect(payload.savedLaws).toHaveLength(1);
      expect(payload.savedLaws[0]).toMatchObject({
        law: { lawId: "129AC0000000089", title: "民法" },
        revision: { fetchedAt: "2026-07-05T00:00:00.000Z" },
        savedAt: "2026-07-06T00:00:00.000Z",
      });
      expect(payload).toHaveProperty("exportedAt", expect.any(String));
      expect(
        payload.savedLaws[0]?.nodes.some((node) => node.type === "Article" && node.number === "1"),
      ).toBe(true);
    } finally {
      click.mockRestore();
    }
  });

  it("revokes the export object URL when the download click fails", async () => {
    const storage = createMemoryStorageRepository({
      savedLawDocument: createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    });
    const user = userEvent.setup();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:saved-data");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("download blocked");
    });

    try {
      await withObjectUrl(createObjectURL, revokeObjectURL, async () => {
        renderSavedRoute("/saved", storage.repository);

        await screen.findByRole("heading", { name: "保存リスト" });
        await user.click(screen.getByRole("button", { name: "JSONをエクスポート" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("JSONを書き出せませんでした。");
      });

      await waitFor(() => {
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:saved-data");
      });
    } finally {
      click.mockRestore();
    }
  });

  it("does not download or report success when a saved law body is unavailable", async () => {
    const document = createSavedLawDocument({
      law: sampleLawViewerDocument.law,
      revision: sampleLawViewerDocument.revision,
      nodes: sampleLawViewerDocument.nodes,
    });
    const baseRepository = createMemoryStorageRepository({ savedLawDocument: document }).repository;
    const repository: StorageRepository = {
      ...baseRepository,
      getLawDocument: vi.fn(() => Promise.resolve(undefined)),
    };
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:incomplete-export");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    const user = userEvent.setup();

    await withObjectUrl(createObjectURL, revokeObjectURL, async () => {
      renderSavedRoute("/saved", repository);

      await screen.findByRole("heading", { name: "保存リスト" });
      await user.click(screen.getByRole("button", { name: "JSONをエクスポート" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("JSONを書き出せませんでした");
    });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryByText("JSONを書き出しました。")).not.toBeInTheDocument();
  });

  it("creates a tagged bookmark with a memo from the saved list", async () => {
    const storage = createMemoryStorageRepository({
      savedLawDocument: createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    });
    const user = userEvent.setup();

    renderSavedRoute("/saved", storage.repository);

    expect(await screen.findByRole("heading", { name: "保存リスト" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "民法" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089",
    );

    await user.type(screen.getByLabelText("保存タイトル"), "民法1条");
    await user.type(screen.getByLabelText("法令ID"), "129AC0000000089");
    await user.type(screen.getByLabelText("条番号"), "1");
    await user.type(screen.getByLabelText("タグ"), "民法、総則");
    await user.type(screen.getByLabelText("メモ"), "基本原則として確認する");
    await user.click(screen.getByRole("button", { name: "保存項目を追加" }));

    const bookmarkLink = await screen.findByRole("link", { name: "民法1条" });
    const bookmark = bookmarkLink.closest("li");

    expect(bookmark).not.toBeNull();
    expect(within(bookmark as HTMLElement).getByRole("link", { name: "民法1条" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089/articles/1",
    );
    expect(within(bookmark as HTMLElement).getByText("法令: 民法")).toBeInTheDocument();
    expect(within(bookmark as HTMLElement).getByText("民法")).toBeInTheDocument();
    expect(within(bookmark as HTMLElement).getByText("総則")).toBeInTheDocument();
    expect(within(bookmark as HTMLElement).getByText("基本原則として確認する")).toBeInTheDocument();
    expect(storage.getBookmarks()).toEqual([
      expect.objectContaining({
        title: "民法1条",
        note: "基本原則として確認する",
        tags: ["民法", "総則"],
        target: { lawId: "129AC0000000089", article: "1" },
      }),
    ]);
  });

  it("creates a collection and opens its detail page", async () => {
    const bookmark = createBookmark();
    const storage = createMemoryStorageRepository({
      bookmarks: [bookmark],
    });
    const user = userEvent.setup();

    renderSavedRoute("/saved", storage.repository);

    await screen.findByRole("heading", { name: "保存リスト" });
    await user.type(screen.getByLabelText("コレクション名"), "民法総則");
    await user.type(screen.getByLabelText("説明"), "総則の重要条文");
    await user.click(screen.getByRole("checkbox", { name: "民法1条" }));
    await user.click(screen.getByRole("button", { name: "コレクションを作成" }));

    const collectionLink = await screen.findByRole("link", { name: "民法総則" });

    expect(collectionLink).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/saved\/collections\//),
    );
    expect(storage.getCollections()).toEqual([
      expect.objectContaining({
        title: "民法総則",
        description: "総則の重要条文",
        bookmarkIds: [bookmark.id],
      }),
    ]);

    await user.click(collectionLink);

    expect(await screen.findByRole("heading", { name: "民法総則" })).toBeInTheDocument();
    expect(screen.getByText("総則の重要条文")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "保存リストへ戻る" })).toHaveAttribute(
      "href",
      "/saved",
    );
    expect(screen.getByRole("link", { name: "民法1条" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089/articles/1",
    );
  });

  it("opens a collection detail route directly", async () => {
    const bookmark = createBookmark();
    const collection = createCollection(bookmark.id);
    const storage = createMemoryStorageRepository({
      bookmarks: [bookmark],
      collections: [collection],
      savedLawDocument: createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    });

    renderSavedRoute(`/saved/collections/${collection.id}`, storage.repository);

    expect(await screen.findByRole("heading", { name: "民法総則" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "保存リストへ戻る" })).toHaveAttribute(
      "href",
      "/saved",
    );
    expect(screen.getByRole("link", { name: "民法1条" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089/articles/1",
    );
    expect(screen.getByText("法令: 民法")).toBeInTheDocument();
  });

  it("shows an empty collection state", async () => {
    const collection = createCollection("missing-bookmark");
    const storage = createMemoryStorageRepository({
      collections: [collection],
    });

    renderSavedRoute(`/saved/collections/${collection.id}`, storage.repository);

    expect(await screen.findByRole("heading", { name: "民法総則" })).toBeInTheDocument();
    expect(screen.getByText("このコレクションは空です。")).toBeInTheDocument();
  });

  it("shows a not found state for an unknown collection", async () => {
    const storage = createMemoryStorageRepository();

    renderSavedRoute("/saved/collections/missing", storage.repository);

    expect(
      await screen.findByRole("heading", { name: "コレクションが見つかりません" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "保存リストへ戻る" })).toHaveAttribute(
      "href",
      "/saved",
    );
  });

  it("shows a storage error state on the saved list", async () => {
    const repository = createRejectingStorageRepository({
      listBookmarks: vi.fn(() => Promise.reject(new Error("storage unavailable"))),
    });

    renderSavedRoute("/saved", repository);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "保存リストを読み込めませんでした。",
    );
  });

  it("shows a storage error state on the collection detail", async () => {
    const repository = createRejectingStorageRepository({
      listCollections: vi.fn(() => Promise.reject(new Error("storage unavailable"))),
    });

    renderSavedRoute("/saved/collections/collection-1", repository);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "コレクションを読み込めませんでした。",
    );
    expect(screen.getByRole("link", { name: "保存リストへ戻る" })).toHaveAttribute(
      "href",
      "/saved",
    );
  });

  it("shows a form error when bookmark creation fails", async () => {
    const repository = createRejectingStorageRepository({
      putBookmark: vi.fn(() => Promise.reject(new Error("storage unavailable"))),
    });
    const user = userEvent.setup();

    renderSavedRoute("/saved", repository);

    await screen.findByRole("heading", { name: "保存リスト" });
    await user.type(screen.getByLabelText("保存タイトル"), "民法1条");
    await user.type(screen.getByLabelText("法令ID"), "129AC0000000089");
    await user.click(screen.getByRole("button", { name: "保存項目を追加" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存項目を追加できませんでした。");
  });

  it("does not create a bookmark when required fields are blank", async () => {
    const putBookmark = vi.fn<StorageRepository["putBookmark"]>();
    const repository = createRejectingStorageRepository({ putBookmark });
    const user = userEvent.setup();

    renderSavedRoute("/saved", repository);

    await screen.findByRole("heading", { name: "保存リスト" });
    await user.type(screen.getByLabelText("保存タイトル"), " ");
    await user.type(screen.getByLabelText("法令ID"), " ");
    await user.click(screen.getByRole("button", { name: "保存項目を追加" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "保存タイトルと法令IDを入力してください。",
    );
    expect(putBookmark).not.toHaveBeenCalled();
  });

  it("prevents duplicate bookmark submissions while saving", async () => {
    const deferred = createDeferred();
    const putBookmark = vi.fn<StorageRepository["putBookmark"]>(() => deferred.promise);
    const repository = createRejectingStorageRepository({ putBookmark });
    const user = userEvent.setup();

    renderSavedRoute("/saved", repository);

    await screen.findByRole("heading", { name: "保存リスト" });
    await user.type(screen.getByLabelText("保存タイトル"), "民法1条");
    await user.type(screen.getByLabelText("法令ID"), "129AC0000000089");

    const button = screen.getByRole("button", { name: "保存項目を追加" });
    await user.click(button);

    expect(button).toBeDisabled();
    await user.click(button);
    expect(putBookmark).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it("shows a form error when collection creation fails", async () => {
    const repository = createRejectingStorageRepository({
      putCollection: vi.fn(() => Promise.reject(new Error("storage unavailable"))),
    });
    const user = userEvent.setup();

    renderSavedRoute("/saved", repository);

    await screen.findByRole("heading", { name: "保存リスト" });
    await user.type(screen.getByLabelText("コレクション名"), "民法総則");
    await user.click(screen.getByRole("button", { name: "コレクションを作成" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "コレクションを作成できませんでした。",
    );
  });

  it("does not create a collection when the title is blank", async () => {
    const putCollection = vi.fn<StorageRepository["putCollection"]>();
    const repository = createRejectingStorageRepository({ putCollection });
    const user = userEvent.setup();

    renderSavedRoute("/saved", repository);

    await screen.findByRole("heading", { name: "保存リスト" });
    await user.type(screen.getByLabelText("コレクション名"), " ");
    await user.click(screen.getByRole("button", { name: "コレクションを作成" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "コレクション名を入力してください。",
    );
    expect(putCollection).not.toHaveBeenCalled();
  });

  it("prevents duplicate collection submissions while saving", async () => {
    const deferred = createDeferred();
    const putCollection = vi.fn<StorageRepository["putCollection"]>(() => deferred.promise);
    const repository = createRejectingStorageRepository({ putCollection });
    const user = userEvent.setup();

    renderSavedRoute("/saved", repository);

    await screen.findByRole("heading", { name: "保存リスト" });
    await user.type(screen.getByLabelText("コレクション名"), "民法総則");

    const button = screen.getByRole("button", { name: "コレクションを作成" });
    await user.click(button);

    expect(button).toBeDisabled();
    await user.click(button);
    expect(putCollection).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it("creates a bookmark with the fallback ID generator when crypto is unavailable", async () => {
    const storage = createMemoryStorageRepository();
    const user = userEvent.setup();

    renderSavedRoute("/saved", storage.repository);

    await screen.findByRole("heading", { name: "保存リスト" });
    await user.type(screen.getByLabelText("保存タイトル"), "民法1条");
    await user.type(screen.getByLabelText("法令ID"), "129AC0000000089");

    await withUnavailableCrypto(async () => {
      await user.click(screen.getByRole("button", { name: "保存項目を追加" }));
    });

    expect(await screen.findByRole("link", { name: "民法1条" })).toBeInTheDocument();
    const [bookmark] = storage.getBookmarks();

    expect(bookmark.id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    expect(bookmark.title).toBe("民法1条");
  });
});

describe("parseTags", () => {
  it.each([
    ["民法,総則", ["民法", "総則"]],
    ["民法，総則", ["民法", "総則"]],
    ["民法、総則", ["民法", "総則"]],
    [" 民法 ,  総則 ", ["民法", "総則"]],
    ["民法,,，、総則", ["民法", "総則"]],
    [",，、", []],
  ] as const)("normalizes %s", (input, expected) => {
    expect(parseTags(input)).toEqual(expected);
  });
});

const renderSavedRoute = (
  path: string,
  storageRepository = createMemoryStorageRepository().repository,
) => {
  const history = createMemoryHistory({ initialEntries: [path] });

  render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);
};

const createBookmark = (): Bookmark => ({
  id: "bookmark-1",
  target: { lawId: "129AC0000000089", article: "1" },
  title: "民法1条",
  note: "基本原則として確認する",
  tags: ["民法", "総則"],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
});

const createCollection = (bookmarkId: string): Collection => ({
  id: "collection-1",
  title: "民法総則",
  description: "総則の重要条文",
  bookmarkIds: [bookmarkId],
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
});

const createRejectingStorageRepository = (
  overrides: Partial<StorageRepository>,
): StorageRepository => ({
  ...createMemoryStorageRepository().repository,
  ...overrides,
});

const createDeferred = () => {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = () => {
      promiseResolve();
    };
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

const withUnavailableCrypto = async (callback: () => Promise<void>) => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: undefined,
  });

  try {
    await callback();
  } finally {
    if (originalDescriptor === undefined) {
      Reflect.deleteProperty(globalThis, "crypto");
    } else {
      Object.defineProperty(globalThis, "crypto", originalDescriptor);
    }
  }
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
