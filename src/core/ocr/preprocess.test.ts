import { describe, expect, it } from "vitest";

import { computeResizeDimensions } from "./preprocess";

describe("computeResizeDimensions", () => {
  it("長辺が上限以下なら原寸を返す", () => {
    expect(computeResizeDimensions(1600, 1200, 2000)).toEqual({ width: 1600, height: 1200 });
  });

  it("横長は幅を上限に合わせて縦横比を保つ", () => {
    expect(computeResizeDimensions(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
  });

  it("縦長は高さを上限に合わせて縦横比を保つ", () => {
    expect(computeResizeDimensions(1000, 5000, 2000)).toEqual({ width: 400, height: 2000 });
  });

  it("端数は整数へ丸める", () => {
    expect(computeResizeDimensions(3000, 1999, 2000)).toEqual({ width: 2000, height: 1333 });
  });

  it("上限ちょうどは原寸のまま", () => {
    expect(computeResizeDimensions(2000, 800, 2000)).toEqual({ width: 2000, height: 800 });
  });
});
