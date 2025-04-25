import { describe, test, expect } from "bun:test";

import { sumBy } from "./sum-by.utils";

describe("sumBy utility function", () => {
  test("should return 0 for empty array", () => {
    expect(sumBy([], "value")).toBe(0);
  });

  test("should sum numeric values by specified key", () => {
    const data = [{ value: 1 }, { value: 2 }, { value: 3 }];
    expect(sumBy(data, "value")).toBe(6);
  });

  test("should ignore non-numeric values", () => {
    const data = [{ value: 1 }, { value: "2" }, { value: 3 as any }];
    expect(sumBy(data as Array<{ value: number | string }>, "value")).toBe(4);
  });

  test("should ignore objects missing the specified key or undefined key", () => {
    const data = [{ a: 10 }, {} as any, { a: 5 }];
    expect(sumBy(data as Array<{ a?: number }>, "a")).toBe(15);
  });

  test("should work with different keys", () => {
    const items = [
      { x: 2, y: 1 },
      { x: -3, y: 5 },
      { x: 5, y: -2 },
    ];
    expect(sumBy(items, "y")).toBe(4);
  });
});
