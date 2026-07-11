import { afterEach, describe, expect, it } from "vitest";

import { getOcrModelConsent, setOcrModelConsent } from "./ocr-consent";

afterEach(() => {
  localStorage.clear();
});

describe("ocr model consent", () => {
  it("初期状態は未同意", () => {
    expect(getOcrModelConsent()).toBe(false);
  });

  it("同意を保存すると true を返す", () => {
    setOcrModelConsent(true);
    expect(getOcrModelConsent()).toBe(true);
  });

  it("同意を取り消すと false を返す", () => {
    setOcrModelConsent(true);
    setOcrModelConsent(false);
    expect(getOcrModelConsent()).toBe(false);
  });
});
