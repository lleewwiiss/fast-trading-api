import { describe, test, expect } from "bun:test";

import { afterDecimal } from "./after-decimals.utils";

describe("afterDecimal", () => {
  test("should return 0 for integers", () => {
    expect(afterDecimal(5)).toBe(0);
    expect(afterDecimal(100)).toBe(0);
    expect(afterDecimal(0)).toBe(0);
    expect(afterDecimal(-42)).toBe(0);
  });

  test("should return the number of digits after decimal", () => {
    expect(afterDecimal(5.25)).toBe(2);
    expect(afterDecimal(3.14159)).toBe(5);
    expect(afterDecimal(0.1)).toBe(1);
    expect(afterDecimal(-3.75)).toBe(2);
  });

  test("should handle string inputs", () => {
    expect(afterDecimal("5")).toBe(0);
    expect(afterDecimal("5.25")).toBe(2);
    expect(afterDecimal("0.00001")).toBe(5);
  });

  test("should handle scientific notation", () => {
    expect(afterDecimal(1e-5)).toBe(5);
    expect(afterDecimal(1.23e-7)).toBe(7);
    expect(afterDecimal("1e-3")).toBe(3);
    expect(afterDecimal("5.6e-8")).toBe(8);
  });
});
