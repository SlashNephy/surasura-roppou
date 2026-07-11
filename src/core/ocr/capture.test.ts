import { afterEach, describe, expect, it, vi } from "vitest";

import { createCapturedImageFromFile, isImageFile, releaseCapturedImage } from "./capture";

const imageFile = (name: string, type: string): File =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isImageFile", () => {
  it("accepts image mime types", () => {
    expect(isImageFile(imageFile("a.png", "image/png"))).toBe(true);
    expect(isImageFile(imageFile("a.jpg", "image/jpeg"))).toBe(true);
  });

  it("rejects non-image or empty mime types", () => {
    expect(isImageFile(imageFile("a.pdf", "application/pdf"))).toBe(false);
    expect(isImageFile(imageFile("a.bin", ""))).toBe(false);
  });
});

describe("createCapturedImageFromFile", () => {
  it("builds a CapturedImage from an image file", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const result = createCapturedImageFromFile(imageFile("shot.png", "image/png"));
    expect(result).toEqual({
      blob: expect.any(File) as File,
      objectUrl: "blob:mock",
      source: "upload",
      fileName: "shot.png",
    });
  });

  it("returns undefined for a non-image file", () => {
    expect(createCapturedImageFromFile(imageFile("a.pdf", "application/pdf"))).toBeUndefined();
  });
});

describe("releaseCapturedImage", () => {
  it("revokes the object url", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {
      // mock implementation
    });
    releaseCapturedImage({ blob: new Blob(), objectUrl: "blob:mock", source: "upload" });
    expect(revoke).toHaveBeenCalledWith("blob:mock");
  });
});
