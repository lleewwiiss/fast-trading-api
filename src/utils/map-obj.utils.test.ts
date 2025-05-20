import { test, expect, describe } from "bun:test";

import { mapObj } from "./map-obj.utils";

describe("mapObj", () => {
  test("should transform object key-value pairs into an array", () => {
    const obj = { a: 1, b: 2, c: 3 } as const;
    const expected = ["a:1", "b:2", "c:3"];
    expect(mapObj(obj, (key, value) => `${key}:${value}`)).toEqual(expected);
  });

  test("should handle empty objects", () => {
    expect(mapObj({}, (key, value) => `${key}:${value}`)).toEqual([]);
  });

  test("should work with different transformation functions", () => {
    const obj = { x: 10, y: 20, z: 30 } as const;
    const expected = [10, 20, 30];
    expect(mapObj(obj, (_, value) => value)).toEqual(expected as any);
  });

  test("should handle objects with string values", () => {
    const obj = { first: "John", last: "Doe", age: "30" } as const;
    const expected = ["FIRST:JOHN", "LAST:DOE", "AGE:30"];
    expect(
      mapObj(
        obj,
        (key, value) => `${key.toUpperCase()}:${value.toUpperCase()}`,
      ),
    ).toEqual(expected);
  });

  test("should preserve the order of keys in the resulting array", () => {
    const obj = { a: 1, b: 2, c: 3 } as const;
    const keys: string[] = [];
    mapObj(obj, (key) => {
      keys.push(key);
      return null;
    });
    expect(keys).toEqual(["a", "b", "c"]);
  });
});
