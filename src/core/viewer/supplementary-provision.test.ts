import { describe, expect, it } from "vitest";

import { supplementaryProvisionHeadingSuffix } from "./supplementary-provision";

describe("supplementaryProvisionHeadingSuffix", () => {
  it("shows the amending law number so each supplementary provision is distinguishable", () => {
    expect(
      supplementaryProvisionHeadingSuffix({ amendLawNumber: "平成一一年一二月八日法律第一五一号" }),
    ).toBe("（平成一一年一二月八日法律第一五一号）");
  });

  it("appends 抄 for an extracted supplementary provision", () => {
    expect(
      supplementaryProvisionHeadingSuffix({
        amendLawNumber: "平成一一年一二月八日法律第一五一号",
        isExtract: true,
      }),
    ).toBe("（平成一一年一二月八日法律第一五一号）　抄");
  });

  it("shows 抄 alone when the extracted provision has no amending law number", () => {
    expect(supplementaryProvisionHeadingSuffix({ isExtract: true })).toBe("抄");
  });

  // 制定時の附則には改正法令番号が付かない。e-Gov と同じく「附則」のままにして区別する。
  it("adds nothing to the supplementary provision of the original enactment", () => {
    expect(supplementaryProvisionHeadingSuffix({})).toBeUndefined();
  });
});
