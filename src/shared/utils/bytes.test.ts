import { describe, expect, it } from "vitest";

import { formatByteSize } from "./bytes";

describe("formatByteSize", () => {
  it("uses KB below one megabyte", () => {
    expect(formatByteSize(394_240)).toBe("385 KB");
  });

  it("keeps one decimal place for megabytes", () => {
    expect(formatByteSize(1_677_722)).toBe("1.6 MB");
  });

  it("shows zero without a fractional part", () => {
    expect(formatByteSize(0)).toBe("0 KB");
  });
});
