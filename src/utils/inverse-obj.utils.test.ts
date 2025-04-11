import { test, expect, describe } from "bun:test";

import { inverseObj } from "./inverse-obj.utils";

describe("inverseObj", () => {
  test("should invert an object with string keys and values", () => {
    const obj = { a: "x", b: "y", c: "z" } as const;
    const expected = { x: "a", y: "b", z: "c" } as const;
    expect(inverseObj(obj)).toEqual(expected);
  });

  test("should invert an object with string keys and number values", () => {
    const obj = { one: 1, two: 2, three: 3 } as const;
    const expected = { 1: "one", 2: "two", 3: "three" } as const;
    expect(inverseObj(obj)).toEqual(expected);
  });

  test("should handle empty objects", () => {
    expect(inverseObj({})).toEqual({});
  });

  test("should override duplicate values in the original object", () => {
    const obj = { a: "x", b: "x", c: "y" } as const;
    const expected = { x: "b", y: "c" } as const;
    expect(inverseObj(obj)).toEqual(expected);
  });
});
