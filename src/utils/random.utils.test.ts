import { describe, test, expect } from "bun:test";

import { random } from "./random.utils";

describe("rand", () => {
  test("throws error if min > max", () => {
    expect(() => random(5, 1)).toThrow(
      "Min value cannot be greater than max value",
    );
  });

  test("returns min if min === max", () => {
    expect(random(3, 3)).toBe(3);
  });

  test("returns value within range [min, max)", () => {
    for (let i = 0; i < 100; i++) {
      const r = random(1, 5);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThan(5);
    }
  });
});
