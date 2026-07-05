import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("merges conditional class names and resolves Tailwind conflicts", () => {
    const shouldHide = (): boolean => false;

    expect(cn("px-2 text-zinc-900", shouldHide() && "hidden", "px-4")).toBe("text-zinc-900 px-4");
  });
});
