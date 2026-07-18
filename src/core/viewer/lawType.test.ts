import { describe, expect, it } from "vitest";

import { formatLawTypeLabel } from "./lawType";

describe("formatLawTypeLabel", () => {
  it.each([
    { lawType: "Constitution", expected: "憲法" },
    { lawType: "Act", expected: "法律" },
    { lawType: "CabinetOrder", expected: "政令" },
    { lawType: "ImperialOrder", expected: "勅令" },
    { lawType: "MinisterialOrdinance", expected: "府省令" },
    { lawType: "Rule", expected: "規則" },
    { lawType: "Misc", expected: "その他" },
  ])("$lawType を $expected に変換する", ({ lawType, expected }) => {
    expect(formatLawTypeLabel(lawType)).toBe(expected);
  });

  it("未定義は undefined を返す", () => {
    expect(formatLawTypeLabel(undefined)).toBeUndefined();
  });

  it("未知の種別は生の値をそのまま返す", () => {
    expect(formatLawTypeLabel("SomethingNew")).toBe("SomethingNew");
  });
});
