import { describe, expect, it } from "vitest";

import { findSubject, gyoseishoshiSubjects, isLawInSubject } from "./subjects";

describe("gyoseishoshiSubjects", () => {
  it("法令に紐づく 4 科目で構成される", () => {
    expect(gyoseishoshiSubjects.map((subject) => subject.id)).toEqual([
      "constitution",
      "civil",
      "administrative",
      "commercial",
    ]);
  });

  it("すべての科目が 1 つ以上の法令を持つ", () => {
    for (const subject of gyoseishoshiSubjects) {
      expect(subject.lawIds.length).toBeGreaterThan(0);
    }
  });
});

describe("findSubject", () => {
  it.each([
    { id: "constitution", expectedLabel: "憲法" },
    { id: "civil", expectedLabel: "民法" },
    { id: "administrative", expectedLabel: "行政法" },
    { id: "commercial", expectedLabel: "商法/会社法" },
  ])("$id を科目に解決する", ({ id, expectedLabel }) => {
    expect(findSubject(id)?.label).toBe(expectedLabel);
  });

  it.each([{ id: "" }, { id: "unknown" }, { id: "基礎法学" }])(
    "不明な id ($id) には undefined を返す",
    ({ id }) => {
      expect(findSubject(id)).toBeUndefined();
    },
  );
});

describe("isLawInSubject", () => {
  it.each([
    // 科目に属する法令
    { subjectId: "constitution", lawId: "321CONSTITUTION", expected: true },
    { subjectId: "civil", lawId: "129AC0000000089", expected: true },
    { subjectId: "administrative", lawId: "405AC0000000088", expected: true }, // 行政手続法
    { subjectId: "administrative", lawId: "322AC0000000067", expected: true }, // 地方自治法
    { subjectId: "commercial", lawId: "417AC0000000086", expected: true }, // 会社法
    // 科目に属さない法令
    { subjectId: "administrative", lawId: "129AC0000000089", expected: false }, // 民法
    { subjectId: "constitution", lawId: "322AC0000000125", expected: false }, // 国家賠償法
    { subjectId: "civil", lawId: "unknown-law", expected: false },
  ] as const)("$subjectId × $lawId は $expected", ({ subjectId, lawId, expected }) => {
    expect(isLawInSubject(subjectId, lawId)).toBe(expected);
  });
});
