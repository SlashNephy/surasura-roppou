import { describe, expect, it } from "vitest";

import { baseDateToStudyYear, listSelectableStudyYears, studyYearToBaseDate } from "./study-year";

describe("studyYearToBaseDate", () => {
  it.each([
    { year: 2017, expected: "2017-04-01" },
    { year: 2026, expected: "2026-04-01" },
  ])("$year 年度 → $expected", ({ year, expected }) => {
    expect(studyYearToBaseDate(year)).toBe(expected);
  });
});

describe("baseDateToStudyYear", () => {
  it.each([
    { baseDate: "2017-04-01", expected: 2017 },
    { baseDate: "2026-04-01", expected: 2026 },
  ])("$baseDate → $expected 年度", ({ baseDate, expected }) => {
    expect(baseDateToStudyYear(baseDate)).toBe(expected);
  });

  it.each([
    { baseDate: undefined, reason: "未設定" },
    { baseDate: "2026-05-01", reason: "4/1 でない日付" },
    { baseDate: "2016-04-01", reason: "e-Gov 下限より前" },
    { baseDate: "invalid", reason: "不正な形式" },
  ])("$reason ($baseDate) は undefined", ({ baseDate }) => {
    expect(baseDateToStudyYear(baseDate)).toBeUndefined();
  });

  it("年度 → 基準日 → 年度の往復が一致する", () => {
    expect(baseDateToStudyYear(studyYearToBaseDate(2026))).toBe(2026);
  });
});

describe("listSelectableStudyYears", () => {
  it("2017 年度から「今日の年 + 1」年度まで降順で列挙する", () => {
    const years = listSelectableStudyYears(new Date("2026-07-14T00:00:00Z"));

    expect(years[0]).toBe(2027);
    expect(years[years.length - 1]).toBe(2017);
    expect(years).toHaveLength(11);
    // 降順であること。
    expect([...years].sort((left, right) => right - left)).toEqual(years);
  });
});
