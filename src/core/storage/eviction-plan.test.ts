import { describe, expect, it } from "vitest";

import { planEviction, type EvictionCandidate } from "./eviction-plan";

const candidate = (
  overrides: Partial<EvictionCandidate> & Pick<EvictionCandidate, "lawId" | "revisionId">,
): EvictionCandidate => ({
  isCurrent: true,
  byteSize: 100,
  updatedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

describe("planEviction", () => {
  it("deletes nothing when the total is within the limit", () => {
    const plan = planEviction([candidate({ lawId: "a", revisionId: "a1" })], new Set(), 1_000);

    expect(plan).toEqual({ revisions: [], lawIds: [] });
  });

  it("drops history revisions first, oldest first, regardless of the download flag", () => {
    // ダウンロード指定が守るのは現行版だけ。履歴版は指定済みの法令でも消える。
    const plan = planEviction(
      [
        candidate({ lawId: "a", revisionId: "a-old", isCurrent: false, updatedAt: "2026-08-01" }),
        candidate({ lawId: "b", revisionId: "b-old", isCurrent: false, updatedAt: "2026-08-02" }),
        candidate({ lawId: "a", revisionId: "a1", updatedAt: "2026-08-03" }),
      ],
      new Set(["a"]),
      250,
    );

    expect(plan).toEqual({ revisions: [{ lawId: "a", revisionId: "a-old" }], lawIds: [] });
  });

  it("removes whole laws only after history is exhausted, skipping downloaded ones", () => {
    const plan = planEviction(
      [
        candidate({ lawId: "a", revisionId: "a1", updatedAt: "2026-08-01" }),
        candidate({ lawId: "b", revisionId: "b1", updatedAt: "2026-08-02" }),
        candidate({ lawId: "c", revisionId: "c1", updatedAt: "2026-08-03" }),
      ],
      new Set(["a"]),
      250,
    );

    // a はダウンロード指定済みなので飛ばし、古い順に b を消す。250 を下回るのでそこで止める。
    expect(plan).toEqual({ revisions: [], lawIds: ["b"] });
  });

  it("subtracts every remaining revision of a law when the law is removed", () => {
    const plan = planEviction(
      [
        candidate({ lawId: "b", revisionId: "b-old", isCurrent: false, updatedAt: "2026-08-02" }),
        candidate({ lawId: "b", revisionId: "b1", updatedAt: "2026-08-03" }),
        candidate({ lawId: "c", revisionId: "c1", updatedAt: "2026-08-04" }),
      ],
      new Set(),
      150,
    );

    // 第 1 段で b-old を消して 200。まだ超えるので b を丸ごと消し、残りは c1 の 100。
    // 法令を消すときは第 1 段で消していない版だけを差し引く（二重に引かない）。
    expect(plan).toEqual({ revisions: [{ lawId: "b", revisionId: "b-old" }], lawIds: ["b"] });
  });

  it("stops without reaching the limit when every law is downloaded", () => {
    // 上限はユーザーの意図に優先しない。消せるものが無ければ超過を許す。
    const plan = planEviction(
      [candidate({ lawId: "a", revisionId: "a1" }), candidate({ lawId: "b", revisionId: "b1" })],
      new Set(["a", "b"]),
      50,
    );

    expect(plan).toEqual({ revisions: [], lawIds: [] });
  });
});
