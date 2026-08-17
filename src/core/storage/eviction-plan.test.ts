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
        candidate({ lawId: "b", revisionId: "b-old", isCurrent: false, updatedAt: "2026-08-01" }),
        candidate({ lawId: "b", revisionId: "b1", updatedAt: "2026-08-02" }),
        candidate({ lawId: "c", revisionId: "c1", updatedAt: "2026-08-03" }),
        candidate({ lawId: "d", revisionId: "d1", updatedAt: "2026-08-04" }),
      ],
      new Set(),
      150,
    );

    // 第 1 段で b-old を消して 300。まだ超えるので法令 b を消すとき、既に消した b-old を
    // 除いて b1 の 100 だけ差し引き 200。まだ超えるので c も消して 100 で停止する。
    // ここで b-old の分まで重ねて差し引くバグが入ると、b を消した時点で 100 まで落ちて
    // c の前で止まり lawIds が ["b"] になってしまう。d1 まで消さず ["b", "c"] で
    // 止まることが、二重差し引きをしていない証拠になる。
    expect(plan).toEqual({
      revisions: [{ lawId: "b", revisionId: "b-old" }],
      lawIds: ["b", "c"],
    });
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
