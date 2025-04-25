import { describe, test, expect } from "bun:test";

import { toUSD } from "./to-usd.utils";

describe("toUSD utility function", () => {
  test("should round to two decimal places for positive values", () => {
    expect(toUSD(1.234)).toBe(1.23);
    expect(toUSD(1.235)).toBe(1.24);
    expect(toUSD(123.456)).toBe(123.46);
  });

  test("should handle integer and zero values", () => {
    expect(toUSD(100)).toBe(100);
    expect(toUSD(0)).toBe(0);
  });

  test("should round correctly for negative values", () => {
    expect(toUSD(-1.234)).toBe(-1.23);
    expect(toUSD(-1.235)).toBe(-1.24);
  });

  test("should handle large numbers", () => {
    expect(toUSD(123456.789)).toBe(123456.79);
    expect(toUSD(987654321.1234)).toBe(987654321.12);
  });
});
