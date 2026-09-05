import { describe, expect, it } from "vitest";

import { supplementaryProvisionHeadingSuffix } from "./supplementary-provision";

describe("supplementaryProvisionHeadingSuffix", () => {
  // 制定時の附則には改正法令番号が付かない。e-Gov と同じく「附則」のままにして区別する。
  it.each([
    {
      name: "shows the amending law number so each supplementary provision is distinguishable",
      source: { amendLawNumber: "平成一一年一二月八日法律第一五一号" },
      expected: "（平成一一年一二月八日法律第一五一号）",
    },
    {
      name: "appends 抄 for an extracted supplementary provision",
      source: { amendLawNumber: "平成一一年一二月八日法律第一五一号", isExtract: true },
      expected: "（平成一一年一二月八日法律第一五一号）　抄",
    },
    {
      name: "shows 抄 alone when the extracted provision has no amending law number",
      source: { isExtract: true },
      expected: "抄",
    },
    {
      name: "keeps the amending law number alone when the provision is not an extract",
      source: { amendLawNumber: "平成一一年一二月八日法律第一五一号", isExtract: false },
      expected: "（平成一一年一二月八日法律第一五一号）",
    },
    {
      name: "adds nothing to the supplementary provision of the original enactment",
      source: {},
      expected: undefined,
    },
  ])("$name", ({ expected, source }) => {
    expect(supplementaryProvisionHeadingSuffix(source)).toBe(expected);
  });
});
