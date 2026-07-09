import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { setBaseDate as setBaseDateStore } from "@/core/settings";

import { useBaseDate } from "./use-base-date";

afterEach(() => {
  localStorage.clear();
});

describe("useBaseDate", () => {
  it("returns undefined when no base date is stored", () => {
    const { result } = renderHook(() => useBaseDate());

    expect(result.current.baseDate).toBeUndefined();
  });

  it("reflects a stored base date", () => {
    setBaseDateStore("2020-06-01");

    const { result } = renderHook(() => useBaseDate());

    expect(result.current.baseDate).toBe("2020-06-01");
  });

  it("updates when setBaseDate is called through the hook", () => {
    const { result } = renderHook(() => useBaseDate());

    act(() => {
      result.current.setBaseDate("2021-04-01");
    });

    expect(result.current.baseDate).toBe("2021-04-01");
  });
});
