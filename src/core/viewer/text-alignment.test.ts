import { describe, expect, it } from "vitest";

import { alignTexts, toDisplayRange, toSourceOffset } from "./text-alignment";

describe("alignTexts", () => {
  it("同一文字列なら全体が 1 区間になる", () => {
    const alignment = alignTexts("あいうえお", "あいうえお");

    expect(alignment.segments).toEqual([{ sourceStart: 0, displayStart: 0, length: 5 }]);
  });

  it("局所置換で文字数が縮んでも前後が対応する", () => {
    // readable 変換: 「第三十三条」→「第33条」。source は 8 文字
    // （第0 三1 十2 三3 条4 の5 規6 定7）、display は 7 文字
    // （第0 3₁ 3₂ 条3 の4 規5 定6）で、置換により 1 文字縮む。
    const alignment = alignTexts("第三十三条の規定", "第33条の規定");

    expect(alignment.sourceLength).toBe(8);
    expect(alignment.displayLength).toBe(7);
    // 置換より手前は同じオフセット。
    expect(toSourceOffset(alignment, 0, "start")).toBe(0);
    // 置換より後ろは 1 文字ずれる。display 4 の「の」は source 5 の「の」。
    expect(toSourceOffset(alignment, 4, "start")).toBe(5);
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

  it("置換の隙間では bias に従って置換の外側へ寄せる", () => {
    // segments は [{source 0, display 0, 長さ 1}, {source 4, display 3, 長さ 4}]。
    // display 1..2 の「33」は source 1..3 の「三十三」を置き換えた隙間にあたる。
    const alignment = alignTexts("第三十三条の規定", "第33条の規定");

    expect(toSourceOffset(alignment, 2, "start")).toBe(1);
    expect(toSourceOffset(alignment, 2, "end")).toBe(4);
    // 区間終端ちょうど（display 1）も切れ目なので、end は次の区間先頭へ寄る。
    expect(toSourceOffset(alignment, 1, "start")).toBe(1);
    expect(toSourceOffset(alignment, 1, "end")).toBe(4);
  });

  it("ルビ挿入の隙間では bias によらず挿入位置の source を返す", () => {
    // segments は [{0,0,2}, {2,5,6}, {8,14,2}]、sourceLength 10 / displayLength 16。
    // display 11..13 の「しこう」は source では幅を持たない挿入なので、
    // 手前の区間末尾（8）と次の区間先頭（8）が一致し、bias で差が出ない。
    const alignment = alignTexts("公布の日から施行する", "公布こうふの日から施行しこうする");

    expect(toSourceOffset(alignment, 12, "start")).toBe(8);
    expect(toSourceOffset(alignment, 12, "end")).toBe(8);
    // display 2..4 の「こうふ」も同様に source 2 へ潰れる。
    expect(toSourceOffset(alignment, 3, "start")).toBe(2);
    expect(toSourceOffset(alignment, 3, "end")).toBe(2);
  });

  it("末尾の置換は end で覆う", () => {
    // segments は [{source 0, display 1, 長さ 3}]、sourceLength 5 / displayLength 6。
    // display 末尾の「ZZ」は source 末尾の「XY」を置き換えた隙間。end は中間の隙間と
    // 同じく置換の外側（＝ここでは source の終端）へ寄せ、置換語をまるごと覆う。
    const alignment = alignTexts("abcXY", "WabcZZ");

    expect(toSourceOffset(alignment, 6, "end")).toBe(5);
  });

  it("末尾の置換でも start は手前で止まる", () => {
    // start は隙間の手前、最後の一致区間の source 末尾 3 に寄る。
    const alignment = alignTexts("abcXY", "WabcZZ");

    expect(toSourceOffset(alignment, 6, "start")).toBe(3);
  });

  it("末尾を超えるオフセットは sourceLength に丸める", () => {
    const alignment = alignTexts("あいう", "あいう");

    expect(toSourceOffset(alignment, 99, "end")).toBe(3);
  });

  it("共通文字が皆無で segments が空なら undefined を返す", () => {
    // 「ノード全体が対応した」場合の 0 / sourceLength と区別できるように、
    // 対応が一切取れなかったことを undefined で明示する。
    const alignment = alignTexts("abc", "xyz");

    expect(alignment.segments).toEqual([]);
    expect(toSourceOffset(alignment, 0, "start")).toBeUndefined();
    expect(toSourceOffset(alignment, 3, "end")).toBeUndefined();
  });
});

describe("toDisplayRange", () => {
  it("source の範囲を display の範囲へ変換する", () => {
    const alignment = alignTexts("第三条の規定", "第3条の規定");

    // 「三」と「3」はどちらも1文字（source/display とも 6 文字、手で数えて確認済み）
    // なので、置換区間の外側は source/display で同じオフセットに対応する。
    expect(toDisplayRange(alignment, 3, 6)).toEqual({ start: 3, end: 6 });
  });

  it("置換された部分だけの範囲は置換後の display 範囲になる", () => {
    // source 1..3 の「三十三」はどの区間にも属さない。対応する display は
    // 手前の区間末尾（1）から次の区間先頭（3）までの「33」。
    const alignment = alignTexts("第三十三条の規定", "第33条の規定");

    expect(toDisplayRange(alignment, 1, 4)).toEqual({ start: 1, end: 3 });
  });

  it("置換された部分を含む範囲は置換全体を覆うように広げる", () => {
    // source 0..3 の「第三十三」のうち、区間に属するのは「第」だけ。
    // 残る「三十三」の分を display 側の「33」まで広げて覆う。
    const alignment = alignTexts("第三十三条の規定", "第33条の規定");

    expect(toDisplayRange(alignment, 0, 4)).toEqual({ start: 0, end: 3 });
  });

  it("末尾が置換されていれば display の末尾まで広げる", () => {
    // segments は [{source 0, display 1, 長さ 3}]。source 3..5 の「XY」は
    // display 4..6 の「ZZ」に置き換わっている。
    const alignment = alignTexts("abcXY", "WabcZZ");

    expect(toDisplayRange(alignment, 3, 5)).toEqual({ start: 4, end: 6 });
  });

  it("削除されて display に現れない範囲は undefined", () => {
    // segments は [{0,0,1}, {source 3, display 1, 長さ 1}]。source 1..2 の「bc」は
    // display 側で幅を持たないため、広げても空範囲にしかならない。
    const alignment = alignTexts("abcd", "ad");

    expect(toDisplayRange(alignment, 1, 3)).toBeUndefined();
  });

  it("対応する区間がまったく無ければ undefined", () => {
    const alignment = alignTexts("あいう", "かきく");

    expect(toDisplayRange(alignment, 0, 3)).toBeUndefined();
  });
});
