import { describe, expect, it } from "vitest";

import { readabilityTransformFixtures } from "./readability";

describe("readability transform fixtures", () => {
  it("keeps each readability fixture named and explicit about the target mode", () => {
    const names = new Set<string>();

    readabilityTransformFixtures.forEach((fixture) => {
      expect(fixture.name).not.toBe("");
      expect(names.has(fixture.name)).toBe(false);
      names.add(fixture.name);
      expect(fixture.input).not.toBe("");
      expect(fixture.mode).toMatch(/^(article-number|date|law-number|parentheses|unchanged)$/);
      expect(fixture.expected).not.toBe("");

      if (fixture.mode === "unchanged") {
        expect(fixture.input).toBe(fixture.expected);
      } else {
        expect(fixture.input).not.toBe(fixture.expected);
      }
    });
  });
});
