import { describe, expect, it } from "vitest";

import { toBigrams } from "./bigram";

describe("toBigrams", () => {
  it.each([
    { name: "隣接 2-gram を列挙する", input: "abcd", expected: ["ab", "bc", "cd"] },
    { name: "重複を除く", input: "aaa", expected: ["aa"] },
    { name: "1 文字は空", input: "a", expected: [] },
    { name: "空文字は空", input: "", expected: [] },
    { name: "日本語も 2-gram にする", input: "秘密を", expected: ["秘密", "密を"] },
  ])("$name", ({ input, expected }) => {
    expect([...toBigrams(input)]).toEqual(expected);
  });
});
