import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createEgovLawRepository } from "@/core/egov";
import { createJsonFetchStub, fixedTestNow as now, lawDataFixture } from "@/test/fixtures/egov";
import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";
import { setupScrollMocks } from "@/test/scrollMocks";

import { sampleLawViewerDocument } from "./law-viewer-sample";
import { createAppRouter } from "./router";

setupScrollMocks();

const routes = [
  ["/", "今日の条文へ進む"],
  ["/laws", "法令を探す"],
  ["/laws/129AC0000000089", "民法"],
  ["/laws/129AC0000000089/articles/1", "民法"],
  ["/saved", "保存リスト"],
  ["/jump", "条文参照を開く"],
  ["/scanner", "条文参照を撮る"],
  ["/study", "復習を始める"],
  ["/settings", "設定を調整する"],
] as const;

describe("app router", () => {
  it.each(routes)("renders %s", async (path, heading) => {
    const history = createMemoryHistory({ initialEntries: [path] });
    const { fetcher } = createJsonFetchStub(lawDataFixture);
    const lawRepository = createEgovLawRepository({ fetcher, now });
    const storageRepository = createMemoryStorageRepository().repository;

    render(
      <RouterProvider router={createAppRouter({ history, lawRepository, storageRepository })} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    });
  });

  it("uses theme-aware text classes on route placeholder content", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    await waitFor(() => {
      expect(screen.getByText("Laws")).toHaveClass("text-primary");
      expect(screen.getByRole("heading", { name: "法令を探す" })).toHaveClass("text-foreground");
      expect(
        screen.getByText("法令名、略称、法令番号から目的の法令へ進むための入口です。"),
      ).toHaveClass("text-muted-foreground");
    });
  });

  it("renders saved laws from storage on the laws route", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storage = createMemoryStorageRepository(
      createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    );

    render(
      <RouterProvider
        router={createAppRouter({ history, storageRepository: storage.repository })}
      />,
    );

    expect(await screen.findByRole("link", { name: "民法" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089",
    );
    expect(screen.getByText("最終取得: 2026-07-05")).toBeInTheDocument();
    expect(screen.getByText("6 ノード")).toBeInTheDocument();
  });

  it("keeps saved laws list rendering when fetchedAt is missing at runtime", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = {
      ...createMemoryStorageRepository().repository,
      listSavedLaws: () =>
        Promise.resolve([
          {
            law: sampleLawViewerDocument.law,
            revision: {
              ...sampleLawViewerDocument.revision,
              fetchedAt: undefined as never,
            },
            nodeCount: sampleLawViewerDocument.nodes.length,
            savedAt: "2026-07-06T00:00:00.000Z",
            updatedAt: "2026-07-06T00:00:00.000Z",
          },
        ]),
    };

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    expect(await screen.findByRole("link", { name: "民法" })).toBeInTheDocument();
    expect(screen.getByText("最終取得: 不明")).toBeInTheDocument();
  });

  it("renders an empty saved laws placeholder on the laws route", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = createMemoryStorageRepository().repository;

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    expect(await screen.findByRole("heading", { name: "法令を探す" })).toBeInTheDocument();
    expect(screen.getByText("保存済み法令はまだありません。")).toBeInTheDocument();
  });

  it("keeps the laws route usable when saved law storage fails", async () => {
    const history = createMemoryHistory({ initialEntries: ["/laws"] });
    const storageRepository = {
      ...createMemoryStorageRepository().repository,
      listSavedLaws: () => Promise.reject(new Error("IndexedDB is unavailable")),
    };

    render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);

    expect(await screen.findByRole("heading", { name: "法令を探す" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("保存済み法令を読み込めませんでした。");
  });
});
