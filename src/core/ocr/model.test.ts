import { describe, expect, it } from "vitest";

import { formatModelSizeLabel, MODEL_LANG, MODEL_SIZE_BYTES } from "./model";

describe("formatModelSizeLabel", () => {
  it("バイト数を約N.NMB表記にする", () => {
    expect(formatModelSizeLabel(2_411_724)).toBe("約2.3MB");
  });

  it("MODEL_SIZE_BYTES は fast/jpn の実サイズで約2.4MBになる", () => {
    // tessdata_fast/jpn.traineddata の実測（2.4MB）を単一の出所として持つ。
    expect(formatModelSizeLabel(MODEL_SIZE_BYTES)).toBe("約2.4MB");
    expect(MODEL_LANG).toBe("jpn");
  });
});
