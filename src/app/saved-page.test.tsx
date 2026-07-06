import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Bookmark, Collection } from "@/core/domain";
import type { StorageRepository } from "@/core/storage";
import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { sampleLawViewerDocument } from "./law-viewer-sample";
import { createAppRouter } from "./router";

setupScrollMocks();

describe("SavedPage", () => {
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
    });

    renderSavedRoute(`/saved/collections/${collection.id}`, storage.repository);

    expect(await screen.findByRole("heading", { name: "民法総則" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "民法1条" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089/articles/1",
    );
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

    expect(await screen.findByRole("status")).toHaveTextContent(
      "保存リストを読み込めませんでした。",
    );
  });

  it("shows a storage error state on the collection detail", async () => {
    const repository = createRejectingStorageRepository({
      listCollections: vi.fn(() => Promise.reject(new Error("storage unavailable"))),
    });

    renderSavedRoute("/saved/collections/collection-1", repository);

    expect(await screen.findByRole("status")).toHaveTextContent(
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

    expect(await screen.findByRole("status")).toHaveTextContent("保存項目を追加できませんでした。");
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

    expect(await screen.findByRole("status")).toHaveTextContent(
      "コレクションを作成できませんでした。",
    );
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
