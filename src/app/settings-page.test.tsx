import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getBaseDate, setBaseDate } from "@/core/settings";

import { SettingsPage } from "./settings-page";

afterEach(() => {
  localStorage.clear();
});

describe("SettingsPage 基準日", () => {
  it("persists a valid base date", () => {
    render(<SettingsPage />);

    fireEvent.change(screen.getByLabelText("学習年度の基準日"), {
      target: { value: "2020-06-01" },
    });

    expect(getBaseDate()).toBe("2020-06-01");
  });

  it("rejects a base date before the e-Gov lower bound", () => {
    render(<SettingsPage />);

    fireEvent.change(screen.getByLabelText("学習年度の基準日"), {
      target: { value: "2016-01-01" },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("2017-04-01 以降");
    expect(getBaseDate()).toBeUndefined();
  });

  it("clears the base date when emptied", () => {
    setBaseDate("2020-06-01");
    render(<SettingsPage />);

    fireEvent.change(screen.getByLabelText("学習年度の基準日"), {
      target: { value: "" },
    });

    expect(getBaseDate()).toBeUndefined();
  });

  it("keeps an out-of-range value visible in the input while showing the error", () => {
    render(<SettingsPage />);

    const input = screen.getByLabelText("学習年度の基準日");
    fireEvent.change(input, { target: { value: "2016-01-01" } });

    // 無効値でも入力欄は巻き戻らずユーザーの入力を保持する。
    expect(input).toHaveValue("2016-01-01");
    expect(screen.getByRole("alert")).toHaveTextContent("2017-04-01 以降");
    expect(getBaseDate()).toBeUndefined();
  });
});
