import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createMemoryStorageRepository, createSavedLawDocument } from "@/test/fixtures/storage";

import { sampleLawViewerDocument } from "./law-viewer-sample";
import { createAppRouter } from "./router";

const renderHome = (storageRepository = createMemoryStorageRepository().repository) => {
  const history = createMemoryHistory({ initialEntries: ["/"] });

  render(<RouterProvider router={createAppRouter({ history, storageRepository })} />);
};

describe("HomePage", () => {
  it("renders the launcher with featured law chips when no data is saved", async () => {
    renderHome();

    expect(
      await screen.findByRole("heading", { name: "撮って、開いて、すらすら読める。" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "日本国憲法" })).toHaveAttribute(
      "href",
      "/laws/321CONSTITUTION",
    );
    expect(screen.getByRole("link", { name: "刑法" })).toHaveAttribute(
      "href",
      "/laws/140AC0000000045",
    );
    expect(screen.queryByRole("heading", { name: "オフライン保存済み" })).not.toBeInTheDocument();
  });

  it("renders the dashboard with saved laws when data exists", async () => {
    const storage = createMemoryStorageRepository(
      createSavedLawDocument({
        law: sampleLawViewerDocument.law,
        revision: sampleLawViewerDocument.revision,
        nodes: sampleLawViewerDocument.nodes,
      }),
    );

    renderHome(storage.repository);

    expect(await screen.findByRole("heading", { name: "オフライン保存済み" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "すべて表示" })).toHaveAttribute("href", "/saved");
    expect(screen.getByRole("link", { name: "民法" })).toHaveAttribute(
      "href",
      "/laws/129AC0000000089",
    );
  });

  it("keeps the launcher usable and shows an error message when storage fails", async () => {
    const storageRepository = {
      ...createMemoryStorageRepository().repository,
      listSavedLaws: () => Promise.reject(new Error("IndexedDB is unavailable")),
    };

    renderHome(storageRepository);

    expect(
      await screen.findByRole("heading", { name: "撮って、開いて、すらすら読める。" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "保存済み法令を読み込めませんでした。",
    );
    expect(screen.queryByRole("link", { name: "日本国憲法" })).not.toBeInTheDocument();
  });
});
