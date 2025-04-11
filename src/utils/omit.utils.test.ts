import { describe, test, expect } from "bun:test";

import { omit } from "./omit.utils";

describe("omit utility function", () => {
  test("should remove specified keys from an object", () => {
    const input = { a: 1, b: 2, c: 3, d: 4 };
    const result = omit(input, ["b", "d"]);

    expect(result).toEqual({ a: 1, c: 3 });
  });

  test("should return a new object without modifying the original", () => {
    const input = { a: 1, b: 2, c: 3 };
    const result = omit(input, ["b"]);

    expect(result).not.toBe(input);
    expect(input).toEqual({ a: 1, b: 2, c: 3 });
  });

  test("should work with empty keys array", () => {
    const input = { a: 1, b: 2, c: 3 };
    const result = omit(input, []);

    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });

  test("should handle nested objects properly", () => {
    const input = {
      a: 1,
      b: { x: 10, y: 20 },
      c: 3,
    };
    const result = omit(input, ["a"]);

    expect(result).toEqual({
      b: { x: 10, y: 20 },
      c: 3,
    });
    expect(result.b).toBe(input.b); // References to nested objects are preserved
  });

  test("should handle array values", () => {
    const input = { a: [1, 2], b: 2, c: [3, 4] };
    const result = omit(input, ["b"]);

    expect(result).toEqual({ a: [1, 2], c: [3, 4] });
    expect(result.a).toBe(input.a); // References to arrays are preserved
  });

  test("should work with non-existent keys", () => {
    const input = { a: 1, b: 2 };
    // @ts-expect-error Testing with non-existent key
    const result = omit(input, ["c"]);

    expect(result).toEqual({ a: 1, b: 2 });
  });
});
