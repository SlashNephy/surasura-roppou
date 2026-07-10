import { describe, expect, it } from "vitest";

import { generateStorageId } from "./id";

describe("generateStorageId", () => {
  it("空でない文字列を返す", () => {
    expect(generateStorageId()).not.toBe("");
  });

  it("2 回呼び出すと異なる値を返す", () => {
    const a = generateStorageId();
    const b = generateStorageId();
    expect(a).not.toBe(b);
  });
});
