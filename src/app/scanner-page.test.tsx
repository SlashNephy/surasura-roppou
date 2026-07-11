import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScannerPage } from "./scanner-page";

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
    // mock implementation
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScannerPage アップロード", () => {
  it("shows the privacy note on the idle screen", () => {
    render(<ScannerPage />);
    expect(screen.getByText(/保存・送信されません/)).toBeInTheDocument();
  });

  it("previews a selected image file", () => {
    render(<ScannerPage />);

    const input = screen.getByLabelText("画像を選ぶ", { selector: "input" });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    const preview = screen.getByRole("img", { name: /プレビュー/ });
    expect(preview).toHaveAttribute("src", "blob:mock");
  });

  it("returns to idle when retaking", () => {
    render(<ScannerPage />);

    const input = screen.getByLabelText("画像を選ぶ", { selector: "input" });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: "選び直す" }));

    expect(screen.queryByRole("img", { name: /プレビュー/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /画像を選ぶ/ })).toBeInTheDocument();
  });
});
