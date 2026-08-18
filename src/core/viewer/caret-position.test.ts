import { describe, expect, it } from "vitest";

import { caretPositionAt } from "./caret-position";

describe("caretPositionAt", () => {
  const node = { nodeName: "#text" } as unknown as Node;

  it("caretPositionFromPoint があればそれを使う", () => {
    const document = {
      caretPositionFromPoint: () => ({ offsetNode: node, offset: 3 }),
    } as unknown as Document;

    expect(caretPositionAt(document, 10, 20)).toEqual({ node, offset: 3 });
  });

  it("caretPositionFromPoint が無ければ caretRangeFromPoint を使う", () => {
    const document = {
      caretRangeFromPoint: () => ({ startContainer: node, startOffset: 5 }),
    } as unknown as Document;

    expect(caretPositionAt(document, 10, 20)).toEqual({ node, offset: 5 });
  });

  it("どちらも無ければ undefined", () => {
    expect(caretPositionAt({} as unknown as Document, 10, 20)).toBeUndefined();
  });

  it("要素外を指して null が返れば undefined", () => {
    const document = { caretPositionFromPoint: () => null } as unknown as Document;

    expect(caretPositionAt(document, 10, 20)).toBeUndefined();
  });

  it("caretPositionFromPoint が使えても null を返したら caretRangeFromPoint にフォールバックしない", () => {
    const document = {
      caretPositionFromPoint: () => null,
      caretRangeFromPoint: () => ({ startContainer: node, startOffset: 5 }),
    } as unknown as Document;

    expect(caretPositionAt(document, 10, 20)).toBeUndefined();
  });
});
