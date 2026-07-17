import { describe, expect, it } from "vitest";

import { formatIsoDateLabel } from "./dates";

describe("formatIsoDateLabel", () => {
  it.each([
    { value: "2026-07-05", expected: "2026/07/05" },
    { value: "2026-07-05T12:34:56Z", expected: "2026/07/05" },
    { value: "2020-04-01", expected: "2020/04/01" },
  ])("$value を $expected に整形する", ({ value, expected }) => {
    expect(formatIsoDateLabel(value)).toBe(expected);
  });

  it.each([{ value: undefined }, { value: "" }, { value: "2026" }])(
    "壊れた値 $value は不明にする",
    ({ value }) => {
      expect(formatIsoDateLabel(value)).toBe("不明");
    },
  );
});
