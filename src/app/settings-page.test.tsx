import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getBaseDate, setBaseDate } from "@/core/settings";

import { createAppRouter } from "./router";

afterEach(() => {
  localStorage.clear();
});

describe("SettingsPage 基準日", () => {
  it("persists a valid base date", async () => {
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度の基準日"), {
      target: { value: "2020-06-01" },
    });

    expect(getBaseDate()).toBe("2020-06-01");
  });

  it("rejects a base date before the e-Gov lower bound", async () => {
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度の基準日"), {
      target: { value: "2016-01-01" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("2017-04-01 以降");
    expect(getBaseDate()).toBeUndefined();
  });

  it("clears the base date when emptied", async () => {
    setBaseDate("2020-06-01");
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度の基準日"), {
      target: { value: "" },
    });

    expect(getBaseDate()).toBeUndefined();
  });

  it("keeps an out-of-range value visible in the input while showing the error", async () => {
    renderSettingsRoute();

    const input = await screen.findByLabelText("学習年度の基準日");
    fireEvent.change(input, { target: { value: "2016-01-01" } });

    // 無効値でも入力欄は巻き戻らずユーザーの入力を保持する。
    expect(input).toHaveValue("2016-01-01");
    expect(screen.getByRole("alert")).toHaveTextContent("2017-04-01 以降");
    expect(getBaseDate()).toBeUndefined();
  });
});

describe("SettingsPage 学習年度", () => {
  it("年度を選ぶと基準日がその年の 4/1 になり日付入力も追従する", async () => {
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度"), { target: { value: "2026" } });

    expect(getBaseDate()).toBe("2026-04-01");
    expect(screen.getByLabelText("学習年度の基準日")).toHaveValue("2026-04-01");
  });

  it("基準日が未設定のときは「未設定（現行法）」を表示する", async () => {
    renderSettingsRoute();

    expect(await screen.findByLabelText("学習年度")).toHaveValue("none");
  });

  it("「未設定（現行法）」を選ぶと基準日をクリアする", async () => {
    setBaseDate("2026-04-01");
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度"), { target: { value: "none" } });

    expect(getBaseDate()).toBeUndefined();
    expect(screen.getByLabelText("学習年度の基準日")).toHaveValue("");
  });

  it("基準日を手動編集すると年度セレクタは「カスタム」表示になる", async () => {
    setBaseDate("2026-04-01");
    renderSettingsRoute();

    expect(await screen.findByLabelText("学習年度")).toHaveValue("2026");

    fireEvent.change(screen.getByLabelText("学習年度の基準日"), {
      target: { value: "2026-05-01" },
    });

    expect(screen.getByLabelText("学習年度")).toHaveValue("custom");
  });

  it("「カスタム」の選択は基準日を変更しない", async () => {
    setBaseDate("2026-04-01");
    renderSettingsRoute();

    fireEvent.change(await screen.findByLabelText("学習年度"), { target: { value: "custom" } });

    expect(getBaseDate()).toBe("2026-04-01");
  });

  it("科目プリセットに行政書士プリセットを表示する", async () => {
    renderSettingsRoute();

    expect(await screen.findByText("行政書士（4 科目）")).toBeInTheDocument();
  });
});

describe("SettingsPage データ", () => {
  it("opens the export and import page from an accessible whole-row link", async () => {
    renderSettingsRoute();

    expect(await screen.findByRole("link", { name: /エクスポート \/ インポート/ })).toHaveAttribute(
      "href",
      "/settings/data-transfer",
    );
  });
});

const renderSettingsRoute = () => {
  const history = createMemoryHistory({ initialEntries: ["/settings"] });

  render(<RouterProvider router={createAppRouter({ history })} />);
};
