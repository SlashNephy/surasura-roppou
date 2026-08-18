import { describe, expect, it } from "vitest";

import { alignTexts, toDisplayRange, toSourceOffset } from "./text-alignment";

describe("alignTexts", () => {
  it("同一文字列なら全体が 1 区間になる", () => {
    const alignment = alignTexts("あいうえお", "あいうえお");

    expect(alignment.segments).toEqual([{ sourceStart: 0, displayStart: 0, length: 5 }]);
  });

  it("局所置換で文字数が縮んでも前後が対応する", () => {
    // readable 変換: 「第三条」→「第3条」
    const alignment = alignTexts("第三条の規定により", "第3条の規定により");

    expect(toSourceOffset(alignment, 3, "start")).toBe(3);
    // 「三」と「3」はどちらも1文字なので、この置換では文字数は縮まない
    // （source/display とも 9 文字。手で数えて確認済み）。よって offset 8 は
    // 両区間の識別子文字上の位置に一致し、bias に関わらず 8 に対応する。
    expect(toSourceOffset(alignment, 8, "end")).toBe(8);
  });

  it("挿入（ルビ）があっても後続が対応する", () => {
    const alignment = alignTexts("公布の日から", "公布こうふの日から");

    expect(toSourceOffset(alignment, 5, "start")).toBe(2);
    expect(toSourceOffset(alignment, 8, "end")).toBe(5);
  });
});

describe("toSourceOffset", () => {
  it("対応の切れ目では bias に従って外側へ寄せる", () => {
    const alignment = alignTexts("第三条", "第3条");

    // display の 1..2 は「3」の内側。start は手前の区間末尾、end は次の区間先頭へ寄る。
    expect(toSourceOffset(alignment, 1, "start")).toBe(1);
    expect(toSourceOffset(alignment, 1, "end")).toBe(2);
  });

  it("末尾を超えるオフセットは sourceLength に丸める", () => {
    const alignment = alignTexts("あいう", "あいう");

    expect(toSourceOffset(alignment, 99, "end")).toBe(3);
  });
});

describe("toDisplayRange", () => {
  it("source の範囲を display の範囲へ変換する", () => {
    const alignment = alignTexts("第三条の規定", "第3条の規定");

    // 「三」と「3」はどちらも1文字（source/display とも 6 文字、手で数えて確認済み）
    // なので、置換区間の外側は source/display で同じオフセットに対応する。
    expect(toDisplayRange(alignment, 3, 6)).toEqual({ start: 3, end: 6 });
  });

  it("置換された部分を含む範囲は置換全体を覆うように広げる", () => {
    const alignment = alignTexts("第三条の規定", "第3条の規定");

    expect(toDisplayRange(alignment, 0, 3)).toEqual({ start: 0, end: 3 });
  });

  it("対応する区間がまったく無ければ undefined", () => {
    const alignment = alignTexts("あいう", "かきく");

    expect(toDisplayRange(alignment, 0, 3)).toBeUndefined();
  });
});
