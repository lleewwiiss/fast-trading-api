import { describe, test, expect } from "bun:test";

import { adjust, add, subtract, multiply, divide } from "./safe-math.utils";

describe("adjust", () => {
  test("should adjust value according to step", () => {
    expect(adjust(10.123, 0.1)).toBe(10.1);
    expect(adjust(10.123, 0.01)).toBe(10.12);
    expect(adjust(10.123, 0.001)).toBe(10.123);
    expect(adjust(10.126, 0.01)).toBe(10.13);
  });

  test("should handle string step values", () => {
    expect(adjust(10.123, "0.1")).toBe(10.1);
    expect(adjust(10.123, "0.01")).toBe(10.12);
  });

  test("should handle integer step values", () => {
    expect(adjust(10.6, 1)).toBe(11);
    expect(adjust(10.4, 1)).toBe(10);
    expect(adjust(10.5, 1)).toBe(11);
  });
});

describe("add", () => {
  test("should add two numbers with correct precision", () => {
    expect(add(0.1, 0.2)).toBe(0.3);
    expect(add(0.01, 0.02)).toBe(0.03);
    expect(add(1.999, 0.001)).toBe(2);
    expect(add(0.3, 0.6)).toBe(0.9);
  });

  test("should handle numbers with different precision", () => {
    expect(add(0.1, 0.02)).toBe(0.12);
    expect(add(1, 0.001)).toBe(1.001);
    expect(add(10, 0.123)).toBe(10.123);
  });

  test("should handle large numbers", () => {
    expect(add(1000000, 0.001)).toBe(1000000.001);
  });
});

describe("subtract", () => {
  test("should subtract two numbers with correct precision", () => {
    expect(subtract(0.3, 0.1)).toBe(0.2);
    expect(subtract(0.03, 0.01)).toBe(0.02);
    expect(subtract(2, 0.001)).toBe(1.999);
  });

  test("should handle numbers with different precision", () => {
    expect(subtract(0.12, 0.1)).toBe(0.02);
    expect(subtract(1.001, 1)).toBe(0.001);
    expect(subtract(10.123, 10)).toBe(0.123);
  });

  test("should handle negative results", () => {
    expect(subtract(0.1, 0.3)).toBe(-0.2);
    expect(subtract(1, 1.5)).toBe(-0.5);
  });
});

describe("multiply", () => {
  test("should multiply two numbers with correct precision", () => {
    expect(multiply(0.1, 0.2)).toBe(0.02);
    expect(multiply(0.01, 0.02)).toBe(0.0002);
    expect(multiply(0.3, 0.3)).toBe(0.09);
  });

  test("should handle numbers with different precision", () => {
    expect(multiply(0.1, 0.02)).toBe(0.002);
    expect(multiply(2, 0.5)).toBe(1);
    expect(multiply(10, 0.123)).toBe(1.23);
  });

  test("should handle integer multiplications", () => {
    expect(multiply(2, 3)).toBe(6);
    expect(multiply(10, 10)).toBe(100);
  });
});

describe("divide", () => {
  test("should divide two numbers with correct precision", () => {
    expect(divide(0.3, 0.1)).toBe(3);
    expect(divide(0.03, 0.01)).toBe(3);
    expect(divide(1, 3)).toBe(0);
  });

  test("should handle numbers with different precision", () => {
    expect(divide(0.12, 0.1)).toBe(1.2);
    expect(divide(1, 0.5)).toBe(2);
    expect(divide(10.123, 10)).toBe(1.012);
  });

  test("should handle edge cases", () => {
    expect(divide(0, 5)).toBe(0);
  });
});
