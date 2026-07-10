import type { LawReferenceTarget } from "@/core/domain";
import { describe, expect, it } from "vitest";

import { pinAnchor, repathAnchor } from "./anchor-repair";

const target: LawReferenceTarget = {
  lawId: "322AC0000000125",
  article: "1",
  revisionId: "old-rev",
  fingerprint: "oldfingerprint00",
  pinned: false,
};

describe("repathAnchor", () => {
  it("fingerprint と revisionId を現在の解決先へ更新し pinned を false にする", () => {
    const next = repathAnchor(target, { revisionId: "new-rev", fingerprint: "newfingerprint00" });

    expect(next).toEqual({
      ...target,
      revisionId: "new-rev",
      fingerprint: "newfingerprint00",
      pinned: false,
    });
  });

  it("元の target を変更しない（純粋）", () => {
    repathAnchor(target, { revisionId: "new-rev", fingerprint: "newfingerprint00" });
    expect(target.revisionId).toBe("old-rev");
  });
});

describe("pinAnchor", () => {
  it("pinned を true にし revisionId/fingerprint を保つ", () => {
    expect(pinAnchor(target)).toEqual({ ...target, pinned: true });
  });
});
