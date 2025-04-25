import { describe, test, expect } from "bun:test";

import { sum } from "./sum.utils";

describe("sum utility function", () => {
  test("returns 0 for an empty array", () => {
    expect(sum([])).toBe(0);
  });

  test("sums positive numbers", () => {
    expect(sum([1, 2, 3, 4])).toBe(10);
  });

  test("sums negative numbers", () => {
    expect(sum([-1, -2, -3])).toBe(-6);
  });

  test("sums mixed positive and negative numbers", () => {
    expect(sum([1, -2, 3, -4])).toBe(-2);
  });

  test("sums decimal numbers accurately", () => {
    expect(sum([1.5, 2.25, -0.75])).toBeCloseTo(3.0);
  });
});
