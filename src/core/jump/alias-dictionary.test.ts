import { describe, expect, it } from "vitest";

import { initialAliasDictionary } from "./alias-dictionary";

describe("initialAliasDictionary", () => {
  it("lawId が一意である", () => {
    const ids = initialAliasDictionary.map((entry) => entry.lawId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("officialTitle が一意である", () => {
    const titles = initialAliasDictionary.map((entry) => entry.officialTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("各 alias は空でなく前後空白を含まず、正式名称やエントリ内で重複しない", () => {
    for (const entry of initialAliasDictionary) {
      const seen = new Set<string>();
      for (const alias of entry.aliases) {
        expect(alias).not.toBe("");
        expect(alias).toBe(alias.trim());
        expect(alias).not.toBe(entry.officialTitle);
        expect(seen.has(alias)).toBe(false);
        seen.add(alias);
      }
    }
  });
});
