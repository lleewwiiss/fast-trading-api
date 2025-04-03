import { describe, test, expect } from "bun:test";

import { omitUndefined } from "./omit-undefined.utils";

describe("omitUndefined", () => {
  test("should remove undefined values from object", () => {
    const input = { a: 1, b: undefined, c: "test" };
    const result = omitUndefined(input);
    expect(result).toMatchObject({ a: 1, c: "test" });
    expect(Object.keys(result).length).toBe(2);
  });

  test("should return same object if no undefined values", () => {
    const input = { a: 1, b: 2, c: "test" };
    const result = omitUndefined(input);
    expect(result).toEqual(input);
  });

  test("should handle empty object", () => {
    const input: Record<string, any> = {};
    const result = omitUndefined(input);
    expect(result).toEqual({});
  });

  test("should handle object with all undefined values", () => {
    const input: Record<string, any> = { a: undefined, b: undefined };
    const result = omitUndefined(input);
    expect(result).toEqual({});
    expect(Object.keys(result).length).toBe(0);
  });

  test("should keep null values", () => {
    const input = { a: null, b: undefined, c: 0 };
    const result = omitUndefined(input);
    expect(result).toMatchObject({ a: null, c: 0 });
    expect(Object.keys(result).length).toBe(2);
  });

  test("should keep falsy values except undefined", () => {
    const input = { a: false, b: "", c: 0, d: undefined };
    const result = omitUndefined(input);
    expect(result).toMatchObject({ a: false, b: "", c: 0 });
    expect(Object.keys(result).length).toBe(3);
  });
});
