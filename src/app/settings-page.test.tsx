import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getBaseDate } from "@/core/settings";

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
    localStorage.setItem("surasura:base-date", "2020-06-01");
    render(<SettingsPage />);

    fireEvent.change(screen.getByLabelText("学習年度の基準日"), {
      target: { value: "" },
    });

    expect(getBaseDate()).toBeUndefined();
  });
});
