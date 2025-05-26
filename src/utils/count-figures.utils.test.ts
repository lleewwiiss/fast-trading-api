import { describe, test, expect } from "bun:test";

import { countFigures } from "./count-figures.utils";

describe("countFigures", () => {
  test("should handle numbers", () => {
    expect(countFigures(123)).toBe(3);
    expect(countFigures(123.5)).toBe(4);
    expect(countFigures(123.52)).toBe(5);
    expect(countFigures(112.252)).toBe(6);
  });

  test("should handle string numbers", () => {
    expect(countFigures("123")).toBe(3);
    expect(countFigures("123.5")).toBe(4);
    expect(countFigures("123.52")).toBe(5);
    expect(countFigures("112.252")).toBe(6);
  });

  test("should not count leading zeros", () => {
    expect(countFigures(0.001)).toBe(1);
    expect(countFigures("0.001")).toBe(1);
    expect(countFigures(0.001231)).toBe(4);
    expect(countFigures("0.001231")).toBe(4);
  });

  test("should not count trailing zeros", () => {
    expect(countFigures(1.0)).toBe(1);
    expect(countFigures("1.0")).toBe(1);
    expect(countFigures("1.00")).toBe(1);
    expect(countFigures("1.000")).toBe(1);
    expect(countFigures("1.0000")).toBe(1);
  });
});
