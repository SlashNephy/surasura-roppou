import { describe, expect, it } from "vitest";

import { classifyCameraError } from "./camera";

const domException = (name: string): DOMException => new DOMException("x", name);

describe("classifyCameraError", () => {
  it("maps permission errors", () => {
    expect(classifyCameraError(domException("NotAllowedError"))).toBe("permission-denied");
    expect(classifyCameraError(domException("SecurityError"))).toBe("permission-denied");
  });

  it("maps device-not-found errors", () => {
    expect(classifyCameraError(domException("NotFoundError"))).toBe("not-found");
    expect(classifyCameraError(domException("OverconstrainedError"))).toBe("not-found");
  });

  it("maps unsupported errors", () => {
    expect(classifyCameraError(domException("NotSupportedError"))).toBe("not-supported");
  });

  it("maps non-DOMException errors carrying a name (Chrome の OverconstrainedError 等)", () => {
    // getUserMedia が DOMException 以外の name 付きオブジェクトで reject する場合も分類する。
    expect(classifyCameraError({ name: "OverconstrainedError" })).toBe("not-found");
    // Error の name は "Error"。message が名前らしくても分類は name のみで行う。
    expect(classifyCameraError(new Error("NotAllowedError"))).toBe("unknown");
    expect(classifyCameraError({ name: "NotAllowedError" })).toBe("permission-denied");
  });

  it("falls back to unknown for other DOMExceptions and non-errors", () => {
    expect(classifyCameraError(domException("AbortError"))).toBe("unknown");
    expect(classifyCameraError("boom")).toBe("unknown");
    expect(classifyCameraError(undefined)).toBe("unknown");
  });
});
