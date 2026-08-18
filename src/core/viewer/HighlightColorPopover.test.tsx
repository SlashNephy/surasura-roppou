import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HighlightColorPopover } from "./HighlightColorPopover";

const anchorRect = { top: 100, bottom: 120, left: 50, width: 80 };

describe("HighlightColorPopover", () => {
  it("4 色すべてを名前付きのボタンとして出す", () => {
    render(
      <HighlightColorPopover anchorRect={anchorRect} onDismiss={vi.fn()} onSelect={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "黄でハイライト" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "水色でハイライト" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ピンクでハイライト" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "オレンジでハイライト" })).toBeInTheDocument();
  });

  it("色を押すと onSelect にその色が渡る", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <HighlightColorPopover anchorRect={anchorRect} onDismiss={vi.fn()} onSelect={onSelect} />,
    );

    await user.click(screen.getByRole("button", { name: "ピンクでハイライト" }));

    expect(onSelect).toHaveBeenCalledWith("pink");
  });

  it("現在の色は押された状態として示す", () => {
    render(
      <HighlightColorPopover
        anchorRect={anchorRect}
        onDismiss={vi.fn()}
        onSelect={vi.fn()}
        selectedColor="cyan"
      />,
    );

    expect(screen.getByRole("button", { name: "水色でハイライト" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "黄でハイライト" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("onDelete があるときだけ削除ボタンを出す", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <HighlightColorPopover anchorRect={anchorRect} onDismiss={vi.fn()} onSelect={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "ハイライトを削除" })).not.toBeInTheDocument();

    rerender(
      <HighlightColorPopover
        anchorRect={anchorRect}
        onDelete={onDelete}
        onDismiss={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "ハイライトを削除" }));

    expect(onDelete).toHaveBeenCalled();
  });

  it("Escape で onDismiss を呼ぶ", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <HighlightColorPopover anchorRect={anchorRect} onDismiss={onDismiss} onSelect={vi.fn()} />,
    );

    await user.keyboard("{Escape}");

    expect(onDismiss).toHaveBeenCalled();
  });
});
