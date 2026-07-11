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

  it("falls back to unknown for other DOMExceptions and non-errors", () => {
    expect(classifyCameraError(domException("AbortError"))).toBe("unknown");
    expect(classifyCameraError("boom")).toBe("unknown");
    expect(classifyCameraError(undefined)).toBe("unknown");
  });
});
