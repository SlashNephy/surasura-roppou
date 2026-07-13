import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DetectedLawReference } from "@/core/domain";

import { OcrReferenceResults } from "./OcrReferenceResults";

const resolvedReference: DetectedLawReference = {
  id: "ref-1",
  rawText: "民法709条",
  normalizedText: "民法709条",
  lawNameCandidate: "民法",
  article: "709",
  confidence: 0.9,
  source: { type: "ocr" },
  candidates: [
    {
      lawId: "129AC0000000089",
      lawTitle: "民法",
      article: "709",
      score: 0.9,
      reason: ["正式名称『民法』に一致", "第709条"],
    },
  ],
};

const unresolvedReference: DetectedLawReference = {
  id: "ref-2",
  rawText: "前条",
  normalizedText: "前条",
  confidence: 0.4,
  source: { type: "ocr" },
  candidates: [],
};

describe("OcrReferenceResults", () => {
  it("解決済み候補を表示し、開くで候補を渡す", async () => {
    const onOpenCandidate = vi.fn();
    render(
      <OcrReferenceResults
        references={[resolvedReference]}
        sourceText="民法709条"
        onOpenCandidate={onOpenCandidate}
        onAddToReview={vi.fn()}
      />,
    );

    expect(screen.getByText("民法 第709条")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "民法 第709条を開く" }));
    expect(onOpenCandidate).toHaveBeenCalledWith(resolvedReference.candidates[0]);
  });

  it("復習に追加で候補を渡す", async () => {
    const onAddToReview = vi.fn();
    render(
      <OcrReferenceResults
        references={[resolvedReference]}
        sourceText="民法709条"
        onOpenCandidate={vi.fn()}
        onAddToReview={onAddToReview}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "民法 第709条を復習に追加" }));
    expect(onAddToReview).toHaveBeenCalledWith(resolvedReference.candidates[0]);
  });

  it("無視で参照を一覧から隠す", async () => {
    render(
      <OcrReferenceResults
        references={[resolvedReference]}
        sourceText="民法709条"
        onOpenCandidate={vi.fn()}
        onAddToReview={vi.fn()}
      />,
    );

    expect(screen.getByText("民法709条")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "民法709条を無視" }));
    expect(screen.queryByText("民法 第709条")).not.toBeInTheDocument();
  });

  it("未解決参照は理由を示しアクションを出さない", () => {
    render(
      <OcrReferenceResults
        references={[unresolvedReference]}
        sourceText="前条"
        onOpenCandidate={vi.fn()}
        onAddToReview={vi.fn()}
      />,
    );

    expect(screen.getByText(/法令を特定できません/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /を開く/ })).not.toBeInTheDocument();
  });

  it("検出0件では案内と生テキストを表示する", () => {
    render(
      <OcrReferenceResults
        references={[]}
        sourceText="これはただの文章です"
        onOpenCandidate={vi.fn()}
        onAddToReview={vi.fn()}
      />,
    );

    expect(screen.getByText(/条文参照が見つかりませんでした/)).toBeInTheDocument();
    expect(screen.getByText("これはただの文章です")).toBeInTheDocument();
  });
});
