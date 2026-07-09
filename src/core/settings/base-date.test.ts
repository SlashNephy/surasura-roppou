import { afterEach, describe, expect, it, vi } from "vitest";

import {
  earliestBaseDate,
  getBaseDate,
  isValidBaseDate,
  resolveAsOf,
  setBaseDate,
  subscribe,
} from "./base-date";

afterEach(() => {
  localStorage.clear();
});

describe("isValidBaseDate", () => {
  it("accepts an in-range ISO date", () => {
    expect(isValidBaseDate("2020-06-01")).toBe(true);
    expect(isValidBaseDate(earliestBaseDate)).toBe(true);
  });

  it("rejects dates before the e-Gov lower bound", () => {
    expect(isValidBaseDate("2016-12-31")).toBe(false);
  });

  it("rejects malformed or impossible dates", () => {
    expect(isValidBaseDate("2020-6-1")).toBe(false);
    expect(isValidBaseDate("2020-02-31")).toBe(false);
    expect(isValidBaseDate("not-a-date")).toBe(false);
  });
});

describe("getBaseDate / setBaseDate", () => {
  it("persists and reads back a valid base date", () => {
    setBaseDate("2020-06-01");
    expect(getBaseDate()).toBe("2020-06-01");
  });

  it("clears the base date when set to undefined", () => {
    setBaseDate("2020-06-01");
    setBaseDate(undefined);
    expect(getBaseDate()).toBeUndefined();
  });

  it("clears the base date when set to an empty string", () => {
    setBaseDate("2020-06-01");
    setBaseDate("");
    expect(getBaseDate()).toBeUndefined();
  });

  it("does not persist an invalid base date", () => {
    setBaseDate("2016-01-01");
    expect(getBaseDate()).toBeUndefined();
  });

  it("treats a corrupted stored value as unset", () => {
    localStorage.setItem("surasura:base-date", "garbage");
    expect(getBaseDate()).toBeUndefined();
  });
});

describe("subscribe", () => {
  it("notifies listeners on change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    setBaseDate("2020-06-01");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setBaseDate("2021-04-01");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("resolveAsOf", () => {
  it("returns the base date when valid", () => {
    expect(resolveAsOf("2020-06-01")).toBe("2020-06-01");
  });

  it("returns undefined when unset (current law)", () => {
    expect(resolveAsOf(undefined)).toBeUndefined();
  });
});
