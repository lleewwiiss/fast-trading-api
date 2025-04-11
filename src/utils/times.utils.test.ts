import { describe, test, expect } from "bun:test";

import { times } from "./times.utils";

describe("times utility function", () => {
  test("should execute the function n times and return an array of the results", () => {
    const result = times(3, (i) => i * 2);
    expect(result).toEqual([0, 2, 4]);
  });

  test("should return an empty array when count is 0", () => {
    const result = times(0, (i) => i);
    expect(result).toEqual([]);
  });

  test("should handle string return values", () => {
    const result = times(3, (i) => `item-${i}`);
    expect(result).toEqual(["item-0", "item-1", "item-2"]);
  });

  test("should handle object return values", () => {
    const result = times(2, (i) => ({ id: i, value: i * 10 }));
    expect(result).toEqual([
      { id: 0, value: 0 },
      { id: 1, value: 10 },
    ]);
  });

  test("should handle a large number of iterations", () => {
    const count = 1000;
    const result = times(count, (i) => i);
    expect(result.length).toBe(count);
    expect(result[0]).toBe(0);
    expect(result[count - 1]).toBe(count - 1);
  });
});
