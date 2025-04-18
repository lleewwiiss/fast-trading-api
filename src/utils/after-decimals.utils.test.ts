import { describe, test, expect } from "bun:test";

import { afterDecimals } from "./after-decimals.utils";

describe("afterDecimals", () => {
  test("should return 0 for integers", () => {
    expect(afterDecimals(5)).toBe(0);
    expect(afterDecimals(100)).toBe(0);
    expect(afterDecimals(0)).toBe(0);
    expect(afterDecimals(-42)).toBe(0);
  });

  test("should return the number of digits after decimal", () => {
    expect(afterDecimals(5.25)).toBe(2);
    expect(afterDecimals(3.14159)).toBe(5);
    expect(afterDecimals(0.1)).toBe(1);
    expect(afterDecimals(-3.75)).toBe(2);
  });

  test("should handle string inputs", () => {
    expect(afterDecimals("5")).toBe(0);
    expect(afterDecimals("5.25")).toBe(2);
    expect(afterDecimals("0.00001")).toBe(5);
  });

  test("should handle scientific notation", () => {
    expect(afterDecimals(1e-5)).toBe(5);
    expect(afterDecimals(1.23e-7)).toBe(7);
    expect(afterDecimals("1e-3")).toBe(3);
    expect(afterDecimals("5.6e-8")).toBe(8);
  });
});
