import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeArticleFingerprint } from "@/core/domain";
import type { Bookmark } from "@/core/domain";
import { createEgovLawRepository } from "@/core/egov";
import type { LawDocument, LawListResult, LawMetadata, LawRepository } from "@/core/egov";
import {
  DISPLAY_PREFERENCES_STORAGE_KEYS,
  STORAGE_LIMIT_STORAGE_KEY,
  setBaseDate,
} from "@/core/settings";
import { createJsonFetchStub, fixedTestNow as now, lawDataFixture } from "@/test/fixtures/egov";
import { PERSISTENCE_REQUESTED_STORAGE_KEY, createSavedLawUseCase } from "@/core/storage";
import type { SavedLawDocument, StorageRepository } from "@/core/storage";
import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { DisplayPreferencesProvider } from "./display-preferences";
import { LawViewerPage, LawViewerPageContent } from "./law-viewer-page";
import { sampleLawViewerDocument } from "./law-viewer-sample";
import { createAppRouter } from "./router";
import type { LawViewerState } from "./law-viewer-page";

// 上限を超えさせるテスト（本ファイル末尾の "evicts an older law..." のみ）用に、
// getCurrentStorageLimitBytes をこの箱経由で差し替え可能にする。他のテストは override が
// 未設定のまま実装へ委譲されるため、通常の（実 localStorage 由来の）上限で動く。
const storageLimitMockState = vi.hoisted(() => ({
  actual: undefined as unknown as () => number,
  override: undefined as (() => number) | undefined,
}));

vi.mock("./use-storage-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./use-storage-limit")>();
  storageLimitMockState.actual = actual.getCurrentStorageLimitBytes;

  return {
    ...actual,
    getCurrentStorageLimitBytes: () =>
      (storageLimitMockState.override ?? storageLimitMockState.actual)(),
  };
});

const scrollMocks = setupScrollMocks();

const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();

const matchMedia = (query: string): MediaQueryList =>
  ({
    media: query,
    matches: false,
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      mediaListeners.delete(listener);
    },
    addListener: (listener: ((event: MediaQueryListEvent) => void) | null) => {
      if (listener !== null) {
        mediaListeners.add(listener);
      }
    },
    removeListener: (listener: ((event: MediaQueryListEvent) => void) | null) => {
      if (listener !== null) {
        mediaListeners.delete(listener);
      }
    },
    dispatchEvent: () => true,
  }) as MediaQueryList;

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  mediaListeners.clear();
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-font-size");
  document.documentElement.removeAttribute("data-line-spacing");
});

const createFixtureRepository = () => {
  const { calls, fetcher } = createJsonFetchStub(lawDataFixture);

  return {
    calls,
    repository: createEgovLawRepository({ fetcher, now }),
  };
};

const createMissingRepository = (): LawRepository => {
  const { fetcher } = createJsonFetchStub(
    {
      code: "400001",
      message: "指定された法令IDが存在しません。",
    },
    404,
  );

  return createEgovLawRepository({ fetcher, now });
};

const pendingRepository = {
  listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
  getLaw: (): Promise<LawDocument> =>
    new Promise((resolve) => {
      void resolve;
    }),
  getLawMetadata: (): Promise<LawMetadata> => Promise.reject(new Error("Not used in this test")),
} satisfies LawRepository;

const renderLawViewerRoute = (
  path: string,
  repository = createFixtureRepository().repository,
  storageRepository = createMemoryStorageRepository().repository,
) => {
  const LawViewerRoute = () => (
    <LawViewerPage repository={repository} storageRepository={storageRepository} />
  );
  const history = createMemoryHistory({ initialEntries: [path] });
  const rootRoute = createRootRoute({
    component: Outlet,
  });
  const baseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws/$lawId",
    component: LawViewerRoute,
  });
  const articleRoute = createRoute({
    getParentRoute: () => baseRoute,
    path: "articles/$article",
    component: LawViewerRoute,
  });

  render(
    <RouterProvider
      router={createRouter({
        history,
        routeTree: rootRoute.addChildren([baseRoute.addChildren([articleRoute])]),
      })}
    />,
  );

  return {
    history,
    user: userEvent.setup(),
  };
};

const renderLawViewerContentRoute = (
  path: string,
  state: LawViewerState,
  // 既定はメモリ実装。テスト環境に IndexedDB が無いため、アンカー検証フックが
  // 既定の実ストレージへ問い合わせて未処理拒否を出すのを避ける。
  storageRepository: StorageRepository = createMemoryStorageRepository().repository,
  // 見比べダイアログの作成時版取得を含め、既定の実 e-Gov リポジトリへ通信させないための注入口。
  repository?: LawRepository,
  withDisplayPreferences = false,
) => {
  // LawViewerPageContent は savedLawUseCase を必須 prop として要求する（無音の上限なし
  // フォールバックを避けるため）。本番の Loader 経路を模し、ここで明示的に組み立てて渡す。
  const savedLawUseCase = createSavedLawUseCase(storageRepository);
  const BaseLawViewerRoute = () => {
    const { lawId } = useParams({ from: "/laws/$lawId" });

    return (
      <LawViewerPageContent
        lawId={lawId}
        repository={repository}
        savedLawUseCase={savedLawUseCase}
        state={state}
        storageRepository={storageRepository}
      />
    );
  };
  const ArticleLawViewerRoute = () => {
    const { article, lawId } = useParams({ from: "/laws/$lawId/articles/$article" });

    return (
      <LawViewerPageContent
        activeArticleNumber={article}
        lawId={lawId}
        repository={repository}
        savedLawUseCase={savedLawUseCase}
        state={state}
        storageRepository={storageRepository}
      />
    );
  };
  const rootRoute = createRootRoute({
    component: Outlet,
  });
  const baseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws/$lawId",
    component: BaseLawViewerRoute,
  });
  const articleRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "laws/$lawId/articles/$article",
    component: ArticleLawViewerRoute,
  });
  const history = createMemoryHistory({ initialEntries: [path] });
  const content = (
    <RouterProvider
      router={createRouter({
        history,
        routeTree: rootRoute.addChildren([baseRoute, articleRoute]),
      })}
    />
  );

  render(
    withDisplayPreferences ? (
      <DisplayPreferencesProvider>{content}</DisplayPreferencesProvider>
    ) : (
      content
    ),
  );

  return {
    history,
    user: userEvent.setup(),
  };
};

// 表示中の版とは別の revisionId を pinned アンカーとして固定するシナリオの共通セットアップ。
// 差分は「現行版が既に保存済みか」だけなので、初期保存状態を引数に取り、
// 呼び出し側は自分のテストが検証したい最後の表明だけを書けばよい。
const setupPinnedRevisionScenario = (
  initialOptions: { savedLawDocument?: SavedLawDocument } = {},
): { pinnedRevisionId: string; storageRepository: StorageRepository } => {
  const pinnedRevisionId = "129AC0000000089_20200401_501AC0000000034";
  const pinnedDocument = {
    law: sampleLawViewerDocument.law,
    revision: {
      ...sampleLawViewerDocument.revision,
      revisionId: pinnedRevisionId,
      effectiveDate: "2020-04-01",
    },
    nodes: sampleLawViewerDocument.nodes,
    raw: {},
  } satisfies LawDocument;
  const pinnedBookmark: Bookmark = {
    id: "bookmark-pinned",
    target: {
      lawId: sampleLawViewerDocument.law.lawId,
      article: "1",
      revisionId: pinnedRevisionId,
      pinned: true,
      fingerprint: "deadbeefdeadbeef",
    },
    title: "第一条",
    tags: [],
    createdAt: "2026-07-06T00:00:00.000Z",
    updatedAt: "2026-07-06T00:00:00.000Z",
  };
  const { repository: storageRepository } = createMemoryStorageRepository({
    ...initialOptions,
    bookmarks: [pinnedBookmark],
  });
  // pinned 解決先の版取得を実 e-Gov ではなくスタブへ向ける。
  const pinnedRepository = {
    listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
    getLaw: (): Promise<LawDocument> => Promise.resolve(pinnedDocument),
    getLawMetadata: (): Promise<LawMetadata> => Promise.reject(new Error("Not used in this test")),
  } satisfies LawRepository;

  renderLawViewerContentRoute(
    "/laws/129AC0000000089/articles/1",
    { status: "ready", ...sampleLawViewerDocument },
    storageRepository,
    pinnedRepository,
  );

  return { pinnedRevisionId, storageRepository };
};

const nonNumericArticleState = {
  status: "ready",
  law: {
    lawId: "custom-law",
    title: "条番号テスト法",
    aliases: [],
    source: "egov",
  },
  revision: {
    lawId: "custom-law",
    revisionId: "custom-law_revision",
    fetchedAt: "2026-07-05T00:00:00.000Z",
  },
  nodes: [
    {
      id: "article:709-2",
      lawId: "custom-law",
      revisionId: "custom-law_revision",
      type: "Article",
      path: "article:709-2",
      number: "709の2",
      title: "第七百九条の二",
      rawText: "第七百九条の二　条番号の枝番を確認する。",
      plainText: "第七百九条の二 条番号の枝番を確認する。",
      children: [],
    },
  ],
  isPinned: false,
  loadedFromStorage: false,
} satisfies LawViewerState;

describe("LawViewerPageContent", () => {
  it("renders a loading state from the page state contract", () => {
    // "loading" 状態では savedLawUseCase は使われないが、必須 prop なので契約を満たす値を渡す。
    const savedLawUseCase = createSavedLawUseCase(createMemoryStorageRepository().repository);

    render(
      <LawViewerPageContent savedLawUseCase={savedLawUseCase} state={{ status: "loading" }} />,
    );

    expect(screen.getByLabelText("法令本文を読み込み中")).toBeInTheDocument();
  });

  it("renders an error state with a return link to law search", async () => {
    renderLawViewerRoute("/laws/not-found", createMissingRepository());

    expect(await screen.findByRole("alert")).toHaveTextContent("法令が見つかりません。");
    expect(screen.getByRole("link", { name: "法令検索へ戻る" })).toHaveAttribute("href", "/laws");
  });

  it("renders an offline-unavailable state with the law title", async () => {
    renderLawViewerRoute("/laws/offline-demo");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "この法令は端末に保存されていません",
    );
    expect(screen.getByText("民法")).toBeInTheDocument();
  });

  it("renders a loading state while the repository request is pending", async () => {
    renderLawViewerRoute("/laws/129AC0000000089", pendingRepository);

    expect(await screen.findByLabelText("法令本文を読み込み中")).toBeInTheDocument();
  });

  it("loads the ready law through the repository as unsaved", async () => {
    const { calls, repository } = createFixtureRepository();

    renderLawViewerRoute("/laws/129AC0000000089", repository);

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    // 未ダウンロードは左レールの操作ボタンが「ダウンロード」であることで判別する。
    expect(screen.getByRole("button", { name: "ダウンロード" })).toBeInTheDocument();
    expect(calls).toEqual([
      {
        input:
          "https://laws.e-gov.go.jp/api/2/law_data/129AC0000000089?law_full_text_format=json&response_format=json",
        init: { headers: { accept: "application/json" } },
      },
    ]);
  });

  it("pins and unpins the law from the viewer", async () => {
    const storage = createMemoryStorageRepository();
    const { user } = renderLawViewerRoute(
      "/laws/129AC0000000089",
      createFixtureRepository().repository,
      storage.repository,
    );

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));

    // pin は保存に成功してからピンを立てる契約のため、本文も保存されていること。
    // pin は save と pinLaw の 2 段の await を含むため、表示の反映は findBy で待つ。
    expect(await screen.findByRole("button", { name: "ダウンロード済み" })).toBeInTheDocument();
    expect(storage.getSavedDocument()?.law.title).toBe("民法");
    await expect(storage.repository.isLawPinned("129AC0000000089")).resolves.toBe(true);

    await user.click(screen.getByRole("button", { name: "ダウンロード済み" }));

    expect(await screen.findByRole("button", { name: "ダウンロード" })).toBeInTheDocument();
    await expect(storage.repository.isLawPinned("129AC0000000089")).resolves.toBe(false);
    // ダウンロード指定の解除は本文を消さない（LRU 対象からは外れるだけ）。
    expect(storage.getSavedDocument()).toBeDefined();
  });

  it("requests storage persistence only on the first download, not on repeated downloads", async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal("navigator", {
      storage: { persist, persisted: () => Promise.resolve(false) },
    });

    const storage = createMemoryStorageRepository();
    const { user } = renderLawViewerRoute(
      "/laws/129AC0000000089",
      createFixtureRepository().repository,
      storage.repository,
    );

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

    // 1 回目のダウンロード指定で要求が飛び、フラグが立つ。
    await user.click(screen.getByRole("button", { name: "ダウンロード" }));
    expect(await screen.findByRole("button", { name: "ダウンロード済み" })).toBeInTheDocument();
    await waitFor(() => {
      expect(persist).toHaveBeenCalledTimes(1);
    });
    expect(localStorage.getItem(PERSISTENCE_REQUESTED_STORAGE_KEY)).toBe("1");

    // 解除してから再度ダウンロード指定しても、2 回目は要求しない。
    await user.click(screen.getByRole("button", { name: "ダウンロード済み" }));
    expect(await screen.findByRole("button", { name: "ダウンロード" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));
    expect(await screen.findByRole("button", { name: "ダウンロード済み" })).toBeInTheDocument();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("succeeds without a failure banner when localStorage access throws during download", async () => {
    // Cookie を無効化した環境や Safari のプライベートブラウジングを模す。pin 自体は成功する
    // (setSavedState も走る) のに、localStorage への素のアクセスが未保護だと後続の例外が
    // catch に落ち、古い isPinned: false を見て失敗バナーを出す不整合になる回帰テスト。
    const storage = createMemoryStorageRepository();
    const { user } = renderLawViewerRoute(
      "/laws/129AC0000000089",
      createFixtureRepository().repository,
      storage.repository,
    );

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });

    try {
      await user.click(screen.getByRole("button", { name: "ダウンロード" }));

      expect(await screen.findByRole("button", { name: "ダウンロード済み" })).toBeInTheDocument();
      await expect(storage.repository.isLawPinned("129AC0000000089")).resolves.toBe(true);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      if (originalDescriptor === undefined) {
        Reflect.deleteProperty(window, "localStorage");
      } else {
        Object.defineProperty(window, "localStorage", originalDescriptor);
      }
    }
  });

  it("pins a law opened with a base date without stealing the current revision slot", async () => {
    // pin は保存と同じ isCurrent 判断を通す契約（このバグの回帰テスト）。忘れると pin が
    // 常に isCurrent: true で保存し、基準日で開いた過去版が現行版スロットを奪ってしまう。
    const olderRevision = {
      ...sampleLawViewerDocument.revision,
      revisionId: "129AC0000000089_20200401_501AC0000000034",
      effectiveDate: "2020-04-01",
    };
    const repository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (_lawId: string, query?: { asOf?: string }): Promise<LawDocument> =>
        Promise.resolve({
          law: sampleLawViewerDocument.law,
          revision: query?.asOf === "2020-04-01" ? olderRevision : sampleLawViewerDocument.revision,
          nodes: sampleLawViewerDocument.nodes,
          raw: {},
        }),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;
    const { repository: storageRepository } = createMemoryStorageRepository();
    // 現行版を先に確立しておく。奪われていないことを最後に確認できるようにするため。
    await storageRepository.saveLawDocument({
      law: sampleLawViewerDocument.law,
      revision: sampleLawViewerDocument.revision,
      nodes: sampleLawViewerDocument.nodes,
    });

    act(() => {
      setBaseDate("2020-04-01");
    });

    const { user } = renderLawViewerRoute("/laws/129AC0000000089", repository, storageRepository);

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));

    expect(await screen.findByRole("button", { name: "ダウンロード済み" })).toBeInTheDocument();
    // 基準日指定で開いた過去版をダウンロード指定しても、既存の現行版スロットは奪われない。
    await expect(
      storageRepository.getLawDocument(sampleLawViewerDocument.law.lawId),
    ).resolves.toMatchObject({ revision: sampleLawViewerDocument.revision });
  });

  it("shows an error and keeps the law unpinned when pinning fails", async () => {
    const storageRepository = {
      ...createMemoryStorageRepository().repository,
      saveLawDocument: () => Promise.reject(new Error("Quota exceeded")),
    };
    const { user } = renderLawViewerRoute(
      "/laws/129AC0000000089",
      createFixtureRepository().repository,
      storageRepository,
    );

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ダウンロード" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ダウンロードできませんでした。端末の保存領域を確認してください。",
    );
    expect(screen.getByRole("button", { name: "ダウンロード" })).toBeEnabled();
    await expect(storageRepository.isLawPinned("129AC0000000089")).resolves.toBe(false);
  });

  it("unpins a law without deleting its saved document", async () => {
    const storage = createMemoryStorageRepository(
      createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    );
    // ローダーの初期表示はダウンロード状態から決まる。保存済みでもダウンロード指定していなければ
    // 「ダウンロード済み」ボタンは表示されないため、事前にダウンロード指定しておく。
    await storage.repository.pinLaw(sampleLawViewerDocument.law.lawId);
    const { user } = renderLawViewerRoute(
      "/laws/129AC0000000089",
      createFixtureRepository().repository,
      storage.repository,
    );

    expect(await screen.findByRole("button", { name: "ダウンロード済み" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ダウンロード済み" }));

    expect(screen.getByRole("button", { name: "ダウンロード" })).toBeInTheDocument();
    // LRU（PR 3）対象から外れるだけで、本文は消えない。
    expect(storage.getSavedDocument()).toBeDefined();
  });

  it("shows the saved law body when the network is unavailable", async () => {
    const repository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (): Promise<LawDocument> => Promise.reject(new Error("network down")),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;
    const storage = createMemoryStorageRepository(
      createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    );

    renderLawViewerRoute("/laws/129AC0000000089", repository, storage.repository);

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByText("保存済み本文を表示中")).toBeInTheDocument();
    expect(screen.getByText("取得: 2026/07/05")).toBeInTheDocument();
  });

  it("auto saves the opened law as the current revision", async () => {
    const { repository: lawRepository } = createFixtureRepository();
    const storage = createMemoryStorageRepository();

    renderLawViewerRoute("/laws/129AC0000000089", lawRepository, storage.repository);

    await screen.findByRole("article", { name: "民法" });
    // 取得元は createFixtureRepository（実 e-Gov レスポンス相当）のため、法令オブジェクトの
    // 全項目は sampleLawViewerDocument と一致しない。ID と版で同一本文が書き戻されたことを確認する。
    await waitFor(() => {
      expect(storage.getSavedDocument()).toMatchObject({
        law: { lawId: sampleLawViewerDocument.law.lawId },
        revision: { revisionId: sampleLawViewerDocument.revision.revisionId },
      });
    });
    await expect(
      storage.repository.listSavedRevisions(sampleLawViewerDocument.law.lawId),
    ).resolves.toEqual([expect.objectContaining({ isCurrent: true })]);
  });

  it("auto saves a law opened with a base date as a history revision", async () => {
    // 基準日指定で取得した版は現行版とは別の revisionId を持つ想定で、履歴として積み上がる。
    const olderRevision = {
      ...sampleLawViewerDocument.revision,
      revisionId: "129AC0000000089_20200401_501AC0000000034",
      effectiveDate: "2020-04-01",
    };
    const repository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (_lawId: string, query?: { asOf?: string }): Promise<LawDocument> =>
        Promise.resolve({
          law: sampleLawViewerDocument.law,
          revision: query?.asOf === "2020-04-01" ? olderRevision : sampleLawViewerDocument.revision,
          nodes: sampleLawViewerDocument.nodes,
          raw: {},
        }),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;
    const { repository: storageRepository } = createMemoryStorageRepository();
    await storageRepository.saveLawDocument({
      law: sampleLawViewerDocument.law,
      revision: sampleLawViewerDocument.revision,
      nodes: sampleLawViewerDocument.nodes,
    });

    act(() => {
      setBaseDate("2020-04-01");
    });

    renderLawViewerRoute("/laws/129AC0000000089", repository, storageRepository);

    await screen.findByRole("article", { name: "民法" });
    await waitFor(async () => {
      await expect(
        storageRepository.listSavedRevisions(sampleLawViewerDocument.law.lawId),
      ).resolves.toHaveLength(2);
    });

    // 現行版スロットは基準日指定の取得で入れ替わらない。
    await expect(
      storageRepository.getLawDocument(sampleLawViewerDocument.law.lawId),
    ).resolves.toMatchObject({ revision: sampleLawViewerDocument.revision });
  });

  it("does not save again when the document came from storage", async () => {
    const failingLawRepository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (): Promise<LawDocument> => Promise.reject(new Error("network down")),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;
    const storage = createMemoryStorageRepository(
      createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    );
    const saveLawDocument = vi.fn(storage.repository.saveLawDocument.bind(storage.repository));

    renderLawViewerRoute("/laws/129AC0000000089", failingLawRepository, {
      ...storage.repository,
      saveLawDocument,
    });

    // e-Gov 取得が失敗し、保存済みの本文でフォールバック表示する。
    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByText("保存済み本文を表示中")).toBeInTheDocument();
    expect(saveLawDocument).not.toHaveBeenCalled();
  });

  it("keeps rendering the document when auto save fails", async () => {
    const { repository: lawRepository } = createFixtureRepository();
    const storageRepository = {
      ...createMemoryStorageRepository().repository,
      saveLawDocument: () => Promise.reject(new Error("quota exceeded")),
    };

    renderLawViewerRoute("/laws/129AC0000000089", lawRepository, storageRepository);

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

    // 自動保存はユーザーが要求した操作ではないため、失敗をバナーで知らせない。
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("evicts an older law when opening a new one exceeds the limit", async () => {
    // 上限は選択肢の最小値でも 100 MB あり、fixture の本文では届かない。
    // 上限そのものではなく「上限を超えたら古い方が落ちる」振る舞いを見たいので、
    // getCurrentStorageLimitBytes をモックして小さい上限を注入し、既存の保存を実測で超える大きさに膨らませる。
    const bulkyNodes = Array.from({ length: 200 }, (_node, index) => ({
      ...sampleLawViewerDocument.nodes[0],
      id: `bulky-${index.toString()}`,
      plainText: "あ".repeat(1_000),
    }));

    storageLimitMockState.override = () => 1_000;

    try {
      const storage = createMemoryStorageRepository();

      await storage.repository.saveLawDocument({
        law: { ...sampleLawViewerDocument.law, lawId: "000AC0000000001", title: "古い法令" },
        revision: {
          ...sampleLawViewerDocument.revision,
          lawId: "000AC0000000001",
          revisionId: "000AC0000000001_rev",
        },
        nodes: bulkyNodes,
      });

      renderLawViewerRoute(
        "/laws/129AC0000000089",
        createFixtureRepository().repository,
        storage.repository,
      );

      expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

      // 上限を超えたので、より古い法令が落ちる。
      await waitFor(async () => {
        await expect(storage.repository.getLawDocument("000AC0000000001")).resolves.toBeUndefined();
      });
    } finally {
      storageLimitMockState.override = undefined;
    }
  });

  it("does not refetch the law when the storage limit changes in another tab", async () => {
    // 容量上限は useMemo/effect の依存に入れていないため、他タブでの上限変更（storage
    // イベント）を受けても savedLawUseCase の参照は変わらず、読み込み effect は再実行されない
    // （= e-Gov への再取得が走らない）ことを検証する。バグを再注入すると（limitBytes を
    // useStorageLimit 経由で依存配列へ戻すと）、この event で effect が再実行され calls が増える。
    const { calls, repository } = createFixtureRepository();

    renderLawViewerRoute("/laws/129AC0000000089", repository);

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    const callCountAfterInitialLoad = calls.length;

    await act(async () => {
      // 他タブが容量上限を変更し、それを storage イベントで同期した状況を模す。
      localStorage.setItem(STORAGE_LIMIT_STORAGE_KEY, "100");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_LIMIT_STORAGE_KEY }));
      // 再取得が走るなら、ここまでの間に発火する余地を与える。
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls).toHaveLength(callCountAfterInitialLoad);
  });

  it("既定は読みやすい表示で本文を描画する", async () => {
    renderLawViewerRoute("/laws/129AC0000000089");

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();

    const article = screen.getByRole("article", { name: "第一条" });
    expect(within(article).getByRole("heading", { name: "第1条" })).toBeInTheDocument();
  });

  it("設定が原文表示のとき原文で描画する", async () => {
    localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.textMode, "original");
    renderLawViewerRoute("/laws/129AC0000000089");

    await screen.findByRole("article", { name: "民法" });

    const article = screen.getByRole("article", { name: "第一条" });
    expect(within(article).getByRole("heading", { name: "第一条" })).toBeInTheDocument();
  });

  it("原文表示の設定で構造見出しと目次が原文になる", async () => {
    localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.textMode, "original");
    const { user } = renderLawViewerRoute("/laws/129AC0000000089");

    await screen.findByRole("article", { name: "民法" });
    // 目次ボタンを押してシートを開き、シート内の目次が原文表示になっているか確認する。
    // シートが開くと radix Dialog がメインコンテンツに aria-hidden を設定するため、
    // シート内（role="dialog"）を within でスコープして検証する。
    await user.click(screen.getByRole("button", { name: "目次" }));

    const sheet = await screen.findByRole("dialog");
    // 第一編ラベルは非インタラクティブな span として描画されるため findByText で確認する。
    // 原文表示のときは「第一編 総則」（全角スペース区切り）、読みやすい表示のときは「第1編 総則」になる。
    expect(await within(sheet).findByText(/第一編\s+総則/u)).toBeInTheDocument();
  });

  it("copies an article in the unified format from the article hover action", async () => {
    const clipboard = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const { user } = renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
    });

    await withClipboard(clipboard, async () => {
      const article = await screen.findByRole("article", { name: "第一条" });
      const articleUrl = `${window.location.origin}/laws/129AC0000000089/articles/1`;

      await user.click(within(article).getByRole("button", { name: "第一条をコピー" }));

      expect(clipboard).toHaveBeenLastCalledWith(
        [
          "第一条",
          "",
          "私権は、公共の福祉（公共の利益を含む。）に適合しなければならない。",
          "",
          articleUrl,
        ].join("\n"),
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("表示設定を変えてもコピーする原文を変更しない", async () => {
    localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.fontSize, "extra-large");
    localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEYS.lineSpacing, "wide");
    const clipboard = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const { user } = renderLawViewerContentRoute(
      "/laws/129AC0000000089/articles/1",
      { status: "ready", ...sampleLawViewerDocument },
      createMemoryStorageRepository().repository,
      undefined,
      true,
    );

    await withClipboard(clipboard, async () => {
      const article = await screen.findByRole("article", { name: "第一条" });
      const articleUrl = `${window.location.origin}/laws/129AC0000000089/articles/1`;

      await user.click(within(article).getByRole("button", { name: "第一条をコピー" }));

      expect(clipboard).toHaveBeenLastCalledWith(
        [
          "第一条",
          "",
          "私権は、公共の福祉（公共の利益を含む。）に適合しなければならない。",
          "",
          articleUrl,
        ].join("\n"),
      );
    });
  });

  it("does not show success notifications after article or URL copy", async () => {
    const clipboard = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const { user } = renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
    });

    await withClipboard(clipboard, async () => {
      const article = await screen.findByRole("article", { name: "第一条" });

      await user.click(within(article).getByRole("button", { name: "第一条をコピー" }));

      expect(screen.queryByRole("status")).not.toBeInTheDocument();

      await user.click(within(article).getByRole("button", { name: "第一条のURLコピー" }));

      await waitFor(() => {
        expect(screen.getByRole("article", { name: "第一条" })).toHaveAttribute(
          "data-active",
          "true",
        );
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("shows a recoverable alert when clipboard is unavailable", async () => {
    const { user } = renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
    });

    await withClipboard(undefined, async () => {
      const article = await screen.findByRole("article", { name: "第一条" });

      await user.click(within(article).getByRole("button", { name: "第一条をコピー" }));

      expect(screen.getByRole("alert")).toHaveTextContent("コピー機能を利用できません。");
    });
  });

  it("activates and scrolls to the article from the URL", async () => {
    renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    expect(await screen.findByRole("article", { name: "第一条" })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByRole("button", { name: "第1条" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    await waitFor(() => {
      expect(scrollMocks.scrollIntoView).toHaveBeenCalledWith({
        block: "start",
        behavior: "smooth",
      });
    });
  });

  it("navigates to the selected article from the table of contents", async () => {
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    await user.click(await screen.findByRole("button", { name: "第2条" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/2");
    });
  });

  it("copies the article URL and selects the article from the inline URL action", async () => {
    const clipboard = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    await withClipboard(clipboard, async () => {
      await screen.findByRole("article", { name: "民法" });
      const secondArticle = screen.getByRole("article", { name: "第二条" });

      await user.click(within(secondArticle).getByRole("button", { name: "第二条のURLコピー" }));

      await waitFor(() => {
        expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/2");
        expect(screen.getByRole("article", { name: "第二条" })).toHaveAttribute(
          "data-active",
          "true",
        );
      });
      expect(clipboard).toHaveBeenLastCalledWith(
        `${window.location.origin}/laws/129AC0000000089/articles/2`,
      );
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("navigates to an article from the jump form", async () => {
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    // 左レールに絞ることで、モバイルシート内の同名要素と衝突しないようにする。
    await screen.findByRole("complementary", { name: "法令の目次" });
    const leftRail = screen.getByRole("complementary", { name: "法令の目次" });
    await user.type(within(leftRail).getByLabelText("条番号"), "2");
    await user.click(within(leftRail).getByRole("button", { name: "移動" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/2");
    });
  });

  it("navigates to a non-numeric article number from the jump form", async () => {
    const { history, user } = renderLawViewerContentRoute(
      "/laws/custom-law",
      nonNumericArticleState,
    );

    // 左レールに絞ることで、モバイルシート内の同名要素と衝突しないようにする。
    await screen.findByRole("complementary", { name: "法令の目次" });
    const leftRail = screen.getByRole("complementary", { name: "法令の目次" });
    await user.type(within(leftRail).getByLabelText("条番号"), "709の2");
    await user.click(within(leftRail).getByRole("button", { name: "移動" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/custom-law/articles/709%E3%81%AE2");
    });
  });

  it("normalizes full-width article number input before navigating", async () => {
    const { history, user } = renderLawViewerContentRoute(
      "/laws/custom-law",
      nonNumericArticleState,
    );

    // 左レールに絞ることで、モバイルシート内の同名要素と衝突しないようにする。
    await screen.findByRole("complementary", { name: "法令の目次" });
    const leftRail = screen.getByRole("complementary", { name: "法令の目次" });
    await user.type(within(leftRail).getByLabelText("条番号"), "７０９ の ２");
    await user.click(within(leftRail).getByRole("button", { name: "移動" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/custom-law/articles/709%E3%81%AE2");
    });
  });

  it("keeps the current law page and shows an alert for an unknown jump target", async () => {
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    // 左レールに絞ることで、モバイルシート内の同名要素と衝突しないようにする。
    await screen.findByRole("complementary", { name: "法令の目次" });
    const leftRail = screen.getByRole("complementary", { name: "法令の目次" });
    await user.type(within(leftRail).getByLabelText("条番号"), "999");
    await user.click(within(leftRail).getByRole("button", { name: "移動" }));

    expect(history.location.pathname).toBe("/laws/129AC0000000089");
    // 左レール内のジャンプ入力と aria 検証。id は左レール専用の article-jump-error を確認する。
    const articleInput = within(leftRail).getByLabelText("条番号");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("指定された条文が見つかりません。");
    expect(alert).toHaveAttribute("id", "article-jump-error");
    expect(articleInput).toHaveAttribute("aria-describedby", "article-jump-error");
    expect(articleInput).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps the law body visible and shows an alert for an unknown route article", async () => {
    renderLawViewerRoute("/laws/129AC0000000089/articles/999");

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("指定された条文が見つかりません。");
  });

  it("does not mark the jump input invalid for an unknown route article before form submit", async () => {
    renderLawViewerRoute("/laws/129AC0000000089/articles/999");

    // 左レールに絞ることで、モバイルシート内の同名要素と衝突しないようにする。
    await screen.findByRole("complementary", { name: "法令の目次" });
    const leftRail = screen.getByRole("complementary", { name: "法令の目次" });
    const articleInput = within(leftRail).getByLabelText("条番号");

    expect(screen.getByRole("alert")).toHaveTextContent("指定された条文が見つかりません。");
    expect(articleInput).not.toHaveAttribute("aria-describedby");
    expect(articleInput).not.toHaveAttribute("aria-invalid");
  });

  it("keeps a single article error alert when route and jump targets are both unknown", async () => {
    const { user } = renderLawViewerRoute("/laws/129AC0000000089/articles/999");

    // 左レールに絞ることで、モバイルシート内の同名要素と衝突しないようにする。
    await screen.findByRole("complementary", { name: "法令の目次" });
    const leftRail = screen.getByRole("complementary", { name: "法令の目次" });
    await user.type(within(leftRail).getByLabelText("条番号"), "998");
    await user.click(within(leftRail).getByRole("button", { name: "移動" }));

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("指定された条文が見つかりません。");
  });

  it("opens the mobile table of contents from the toggle", async () => {
    const { user } = renderLawViewerRoute("/laws/129AC0000000089");

    // サブバー内の目次ボタン（lg:hidden 親コンテナ内）を取得する。
    // jsdom ではレスポンシブ class が効かないため、サブバーとレールが DOM 共存する。
    // ボタンのコンテナは lg:hidden だが、ボタン自体はクラスを持たない。
    const tocToggle = await screen.findByRole("button", { name: "目次" });

    // シート実装では open 前はシートが DOM にないため、aria-expanded で状態を確認する。
    expect(tocToggle).toHaveAttribute("aria-expanded", "false");

    await user.click(tocToggle);

    expect(tocToggle).toHaveAttribute("aria-expanded", "true");
    // シートが開くと role="dialog" が現れ、その中に法令目次が入る。
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("navigation", { name: "法令目次" })).toBeInTheDocument();
  });

  it("closes the mobile table of contents after selecting an article", async () => {
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089");

    const tocToggle = await screen.findByRole("button", { name: "目次" });
    await user.click(tocToggle);

    // シートが開いた後、シート内の TOC から条を選択する。
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: "第2条" }));

    await waitFor(() => {
      expect(history.location.pathname).toBe("/laws/129AC0000000089/articles/2");
    });
    // navigateToArticle が setIsMobileTocOpen(false) を呼ぶためシートが閉じる。
    expect(tocToggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("scrolls again when selecting the currently active article", async () => {
    const { user } = renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    await screen.findByRole("article", { name: "第一条" });
    scrollMocks.scrollIntoView.mockClear();

    await user.click(screen.getByRole("button", { name: "第1条" }));

    expect(scrollMocks.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("keeps the article input text-friendly for branch article numbers", async () => {
    renderLawViewerRoute("/laws/129AC0000000089");

    const articleInput = await screen.findByLabelText("条番号");
    expect(articleInput).toHaveAttribute("name", "article");
    expect(articleInput).toHaveAttribute("autocomplete", "off");
    expect(articleInput).not.toHaveAttribute("inputmode", "numeric");
  });

  it("renders the study context panel", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws/129AC0000000089"] });
    const { fetcher } = createJsonFetchStub(lawDataFixture);
    const lawRepository = createEgovLawRepository({ fetcher, now });
    const storageRepository = createMemoryStorageRepository().repository;

    render(
      <RouterProvider router={createAppRouter({ history, lawRepository, storageRepository })} />,
    );

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "学習コンテキスト" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "法令の目次" })).toBeInTheDocument();
  });

  it("shows the current-law base date label when no base date is set", async () => {
    renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
    });

    // ルーターの初回マッチ解決は非同期のため、本文が描画されるまで待ってから検証する。
    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getAllByText(/基準日 未設定（現行法）/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/施行日 2026\/06\/24/).length).toBeGreaterThan(0);
  });

  it("shows the resolved base date when one is requested", async () => {
    renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
      requestedAsOf: "2020-06-01",
    });

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getAllByText(/基準日 2020\/06\/01/).length).toBeGreaterThan(0);
  });

  it("notes that the base date is not applied to an offline saved body", async () => {
    renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
      loadedFromStorage: true,
      requestedAsOf: "2020-06-01",
    });

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByText(/保存版を表示中のため基準日は未反映/)).toBeInTheDocument();
  });

  it("shows the effective date label as unknown when effectiveDate is an empty string", async () => {
    renderLawViewerContentRoute("/laws/129AC0000000089/articles/1", {
      status: "ready",
      ...sampleLawViewerDocument,
      revision: { ...sampleLawViewerDocument.revision, effectiveDate: "" },
    });

    // ルーターの初回マッチ解決は非同期のため、本文が描画されるまで待ってから検証する。
    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getAllByText(/施行日 不明/).length).toBeGreaterThan(0);
  });

  it("re-resolves the displayed revision when the base date changes", async () => {
    const currentDocument = {
      law: sampleLawViewerDocument.law,
      revision: { ...sampleLawViewerDocument.revision, effectiveDate: "2026-06-24" },
      nodes: sampleLawViewerDocument.nodes,
      raw: {},
    } satisfies LawDocument;
    const olderDocument = {
      law: sampleLawViewerDocument.law,
      revision: {
        ...sampleLawViewerDocument.revision,
        revisionId: "129AC0000000089_20200401_501AC0000000034",
        effectiveDate: "2020-04-01",
      },
      nodes: sampleLawViewerDocument.nodes,
      raw: {},
    } satisfies LawDocument;
    const repository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (_lawId: string, query?: { asOf?: string }): Promise<LawDocument> =>
        Promise.resolve(query?.asOf === "2020-06-01" ? olderDocument : currentDocument),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;

    renderLawViewerRoute("/laws/129AC0000000089", repository);

    expect(await screen.findByRole("article", { name: "民法" })).toBeInTheDocument();
    expect(screen.getAllByText(/施行日 2026\/06\/24/).length).toBeGreaterThan(0);

    act(() => {
      setBaseDate("2020-06-01");
    });

    await waitFor(() => {
      expect(screen.getAllByText(/施行日 2020\/04\/01/).length).toBeGreaterThan(0);
    });
  });

  it("アンカーが drift のとき改正の可能性バッジを表示する", async () => {
    const anchoredBookmark: Bookmark = {
      id: "bookmark-drift",
      target: {
        lawId: sampleLawViewerDocument.law.lawId,
        article: "1",
        revisionId: sampleLawViewerDocument.revision.revisionId,
        // 現在の第一条の指紋とは一致しない値。drift として検知される。
        fingerprint: "deadbeefdeadbeef",
      },
      title: "第一条",
      tags: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    };
    const { repository: storageRepository } = createMemoryStorageRepository({
      bookmarks: [anchoredBookmark],
    });

    renderLawViewerContentRoute(
      "/laws/129AC0000000089/articles/1",
      { status: "ready", ...sampleLawViewerDocument },
      storageRepository,
    );

    expect(await screen.findByText("改正の可能性")).toBeInTheDocument();
  });

  it("drift を「付け替える」で修復すると、再マウントなしに改正の可能性バッジが消える", async () => {
    const anchoredBookmark: Bookmark = {
      id: "bookmark-drift-repair",
      target: {
        lawId: sampleLawViewerDocument.law.lawId,
        article: "1",
        revisionId: sampleLawViewerDocument.revision.revisionId,
        // 現在の第一条の指紋とは一致しない値。drift として検知される。
        fingerprint: "deadbeefdeadbeef",
      },
      title: "第一条",
      tags: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    };
    const { repository: storageRepository } = createMemoryStorageRepository({
      bookmarks: [anchoredBookmark],
    });
    // 見比べダイアログの作成時版取得を実 e-Gov ではなくスタブへ向ける。
    const compareRepository = {
      listLaws: (): Promise<LawListResult> => Promise.reject(new Error("Not used in this test")),
      getLaw: (): Promise<LawDocument> =>
        Promise.resolve({
          law: sampleLawViewerDocument.law,
          revision: sampleLawViewerDocument.revision,
          nodes: sampleLawViewerDocument.nodes,
          raw: {},
        }),
      getLawMetadata: (): Promise<LawMetadata> =>
        Promise.reject(new Error("Not used in this test")),
    } satisfies LawRepository;

    const { user } = renderLawViewerContentRoute(
      "/laws/129AC0000000089/articles/1",
      { status: "ready", ...sampleLawViewerDocument },
      storageRepository,
      compareRepository,
    );

    await user.click(await screen.findByRole("button", { name: "改正の可能性を確認する" }));
    await user.click(await screen.findByRole("button", { name: "新しい条文に付け替える" }));

    // 修復後、再マウントやナビゲーションなしにバッジが消える（refreshToken による再検証）。
    await waitFor(() => {
      expect(screen.queryByText("改正の可能性")).not.toBeInTheDocument();
    });
  });

  it("アンカーの指紋が一致するとき改正の可能性バッジを表示しない", async () => {
    const currentArticle = sampleLawViewerDocument.nodes.find(
      (node) => node.type === "Article" && node.number === "1",
    );
    const fingerprint = await computeArticleFingerprint(currentArticle?.plainText ?? "");
    const anchoredBookmark: Bookmark = {
      id: "bookmark-match",
      target: {
        lawId: sampleLawViewerDocument.law.lawId,
        article: "1",
        revisionId: sampleLawViewerDocument.revision.revisionId,
        fingerprint,
      },
      title: "第一条",
      tags: [],
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
    };
    const { repository: storageRepository } = createMemoryStorageRepository({
      bookmarks: [anchoredBookmark],
    });

    renderLawViewerContentRoute(
      "/laws/129AC0000000089/articles/1",
      { status: "ready", ...sampleLawViewerDocument },
      storageRepository,
    );

    // 本文が描画されるまで待ってから、バッジが無いことを検証する。
    expect(await screen.findByRole("article", { name: "第一条" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("改正の可能性")).not.toBeInTheDocument();
    });
  });

  it("pinned アンカーで固定解決した過去版を保存しても既存の現行版スロットを奪わない", async () => {
    // 現行版が既に保存されている状態を作る。現行版が無い法令では固定解決した過去版が
    // 空いた現行版スロットを埋めるため（次のテストで検証）、ここでは「既存の現行版を
    // 奪わない」という本来の回帰対象を検証できるよう現行版を用意しておく。
    const { pinnedRevisionId, storageRepository } = setupPinnedRevisionScenario({
      savedLawDocument: createSavedLawDocument(sampleLawViewerDocument),
    });

    // pinned 解決後の版が表示されるまで待つ（施行日ラベルが固定版のものに切り替わる。
    // pinned 表示では「施行日 」と「2020/04/01 版」が別テキストノードになるため、
    // 日付部分のみで照合する）。findAllByText 自体がリトライするため二重に待つ必要はない。
    await screen.findAllByText(/2020\/04\/01/);

    // 固定解決した過去版が保存されていること。
    await waitFor(async () => {
      await expect(
        storageRepository.getLawDocumentRevision(
          sampleLawViewerDocument.law.lawId,
          pinnedRevisionId,
        ),
      ).resolves.toBeDefined();
    });

    // 現行版スロットは奪われず、固定解決した版は isCurrent: false のままであること。
    const revisions = await storageRepository.listSavedRevisions(sampleLawViewerDocument.law.lawId);
    const pinnedSummary = revisions.find(
      (summary) => summary.revision.revisionId === pinnedRevisionId,
    );
    expect(pinnedSummary).toMatchObject({ isCurrent: false });
  });

  it("pinned アンカーで固定解決した過去版しか保存が無い法令ではその版が現行版になる", async () => {
    // この法令はまだ何も保存されていない。基準日を設定したまま使うユーザーが
    // 初めてこの法令を開いた場合を再現する。
    const { pinnedRevisionId, storageRepository } = setupPinnedRevisionScenario();

    // findAllByText 自体がリトライするため二重に待つ必要はない。
    await screen.findAllByText(/2020\/04\/01/);

    // 現行版スロットが 1 件も無い法令では、isCurrent: false で保存要求された版でも
    // 空いたスロットを埋める。これが無いとオフラインフォールバック（getLawDocument）が
    // この法令を 1 件も読めない。
    await waitFor(async () => {
      const currentDocument = await storageRepository.getLawDocument(
        sampleLawViewerDocument.law.lawId,
      );

      expect(currentDocument?.revision.revisionId).toBe(pinnedRevisionId);
    });
  });

  it("文書レベル操作を左レールに、選択条操作を右レールに配置する", async () => {
    renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    await screen.findByRole("article", { name: "民法" });

    const leftRail = screen.getByRole("complementary", { name: "法令の目次" });
    // 条番号ジャンプ・ダウンロードは文書レベル操作として左レールに入る
    expect(within(leftRail).getByRole("button", { name: "移動" })).toBeInTheDocument();
    expect(
      within(leftRail).getByRole("button", { name: /^ダウンロード(済み)?$/ }),
    ).toBeInTheDocument();

    const rightRail = screen.getByRole("complementary", { name: "学習コンテキスト" });
    // 選択条があるとき、この条文の操作は右レールに入る
    expect(within(rightRail).getByRole("button", { name: "この条文を保存" })).toBeInTheDocument();
    expect(within(rightRail).getByRole("button", { name: "カードを作る" })).toBeInTheDocument();
    expect(within(rightRail).getByRole("button", { name: "クイズを生成" })).toBeInTheDocument();
  });

  it("条が未選択のとき右レールは案内文を表示し操作を出さない", async () => {
    renderLawViewerRoute("/laws/129AC0000000089");

    await screen.findByRole("article", { name: "民法" });

    const rightRail = screen.getByRole("complementary", { name: "学習コンテキスト" });
    expect(within(rightRail).getByText("条を選ぶと操作が表示されます")).toBeInTheDocument();
    expect(
      within(rightRail).queryByRole("button", { name: "この条文を保存" }),
    ).not.toBeInTheDocument();
  });

  it("モバイルの目次シートに文書操作と目次が入る", async () => {
    const { user } = renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    await screen.findByRole("article", { name: "民法" });
    await user.click(screen.getByRole("button", { name: "目次" }));

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("button", { name: "移動" })).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: /^ダウンロード(済み)?$/ }),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("navigation", { name: "法令目次" })).toBeInTheDocument();
  });

  it("モバイルのこの条文シートに条アクションが入る", async () => {
    const { user } = renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    await screen.findByRole("article", { name: "民法" });
    await user.click(screen.getByRole("button", { name: "この条文" }));

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("button", { name: "カードを作る" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "クイズを生成" })).toBeInTheDocument();
  });

  it("activeArticleNumber が undefined になった後に戻ると this-article シートが勝手に開かない", async () => {
    // 再現バグ: シートを開いた状態で activeArticleNumber が undefined になると isArticleSheetOpen
    // が true のまま残り、次に条ルートへ戻ると勝手に開く。
    // レンダー時同期（prevActiveArticleNumber）で修正されていることを確認する。
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    await screen.findByRole("article", { name: "民法" });
    await user.click(screen.getByRole("button", { name: "この条文" }));

    // シートが開いたことを確認する。
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // 条パラメータなしのルートへ遷移して activeArticleNumber を undefined にする。
    act(() => {
      history.push("/laws/129AC0000000089");
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // 再度条ルートへ戻す。
    act(() => {
      history.push("/laws/129AC0000000089/articles/1");
    });

    // シートが自動で開かないことを確認する（state リセットが効いている）。
    await screen.findByRole("article", { name: "第一条" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("条から別の条へ直接遷移すると this-article シートが閉じる", async () => {
    // 開いたシートが前の条のつもりで別の条の操作に化けたまま残るのを防ぐ。
    const { history, user } = renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    await screen.findByRole("article", { name: "民法" });
    await user.click(screen.getByRole("button", { name: "この条文" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // 別の条へ直接遷移する（undefined を経由しない）。
    act(() => {
      history.push("/laws/129AC0000000089/articles/2");
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("opens the study card dialog from the active article actions", async () => {
    const user = userEvent.setup();
    renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    const createButton = await screen.findByRole("button", { name: "カードを作る" });
    await user.click(createButton);

    expect(await screen.findByRole("heading", { name: "学習カードを作る" })).toBeInTheDocument();
  });

  it("opens the quiz generation dialog from the active article actions", async () => {
    const user = userEvent.setup();
    renderLawViewerRoute("/laws/129AC0000000089/articles/1");

    const generateButton = await screen.findByRole("button", { name: "クイズを生成" });
    await user.click(generateButton);

    expect(await screen.findByRole("heading", { name: "クイズカードを生成" })).toBeInTheDocument();
  });

  it("記事ルートに study=new で入ると学習カードダイアログを自動起動する", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/laws/129AC0000000089/articles/1?study=new"],
    });
    const { fetcher } = createJsonFetchStub(lawDataFixture);
    const lawRepository = createEgovLawRepository({ fetcher, now });
    const storageRepository = createMemoryStorageRepository().repository;

    render(
      <RouterProvider router={createAppRouter({ history, lawRepository, storageRepository })} />,
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "学習カードを作る" })).toBeInTheDocument();
  });

  it("同一法令内の別条へ study=new で再遷移すると再度ダイアログを自動起動する", async () => {
    const history = createMemoryHistory({
      initialEntries: ["/laws/129AC0000000089/articles/1?study=new"],
    });
    const { fetcher } = createJsonFetchStub(lawDataFixture);
    const lawRepository = createEgovLawRepository({ fetcher, now });
    const storageRepository = createMemoryStorageRepository().repository;
    const router = createAppRouter({ history, lawRepository, storageRepository });

    render(<RouterProvider router={router} />);

    // 1条目: 自動起動を確認 → キャンセルで閉じる
    expect(await screen.findByRole("heading", { name: "学習カードを作る" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    // ダイアログが閉じたことを確認（同一法令内で remount なし）
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "学習カードを作る" })).not.toBeInTheDocument();
    });

    // 2条目へ study=new で遷移（同一法令、LawViewerReadyState の remount なし）
    await act(async () => {
      await router.navigate({
        to: "/laws/$lawId/articles/$article",
        params: { lawId: "129AC0000000089", article: "2" },
        search: { study: "new" },
      });
    });

    // cardAutoOpenedRef がリセットされているため、再度ダイアログが自動起動する
    expect(await screen.findByRole("heading", { name: "学習カードを作る" })).toBeInTheDocument();
  });
});

const withClipboard = async (
  writeText: ((text: string) => Promise<void>) | undefined,
  callback: () => Promise<void>,
) => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  });

  try {
    await callback();
  } finally {
    if (originalDescriptor === undefined) {
      Reflect.deleteProperty(navigator, "clipboard");
    } else {
      Object.defineProperty(navigator, "clipboard", originalDescriptor);
    }
  }
};
