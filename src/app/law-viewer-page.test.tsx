import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createAppRouter } from "./router";

const renderLawViewerRoute = (path: string) => {
  const history = createMemoryHistory({ initialEntries: [path] });

  render(<RouterProvider router={createAppRouter({ history })} />);
};

describe("LawViewerPageContent", () => {
  it("renders an error state with a return link to law search", async () => {
    renderLawViewerRoute("/laws/not-found");

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
});
