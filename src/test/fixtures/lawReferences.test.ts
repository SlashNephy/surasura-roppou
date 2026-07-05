import { describe, expect, it } from "vitest";

import { lawReferenceParseFixtures } from "./lawReferences";

describe("law reference parser fixtures", () => {
  it("keeps each parser fixture named and structurally coherent", () => {
    const names = new Set<string>();

    lawReferenceParseFixtures.forEach((fixture) => {
      expect(fixture.name).not.toBe("");
      expect(names.has(fixture.name)).toBe(false);
      names.add(fixture.name);
      expect(fixture.input).not.toBe("");
      expect(fixture.expected.confidenceFloor).toBeGreaterThanOrEqual(0);
      expect(fixture.expected.confidenceFloor).toBeLessThanOrEqual(1);

      if (fixture.kind === "absolute" && fixture.expected.item !== undefined) {
        expect(fixture.expected.article).toBeDefined();
      }

      if (fixture.kind === "absolute" && fixture.expected.paragraph !== undefined) {
        expect(fixture.expected.article).toBeDefined();
      }
    });
  });
});
