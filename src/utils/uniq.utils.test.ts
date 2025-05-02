import { describe, test, expect } from "bun:test";

import { uniq } from "./uniq.utils";

describe("uniq utility function", () => {
  test("should return empty array for empty input", () => {
    expect(uniq([])).toEqual([]);
  });

  test("should return all items when no duplicates", () => {
    const items = [1, 2, 3];
    expect(uniq(items)).toEqual([1, 2, 3]);
  });

  test("should remove duplicate primitives", () => {
    const items = [1, 2, 1, 3, 2];
    expect(uniq(items)).toEqual([1, 2, 3]);
  });

  test("should handle strings", () => {
    const items = ["a", "b", "a", "c"];
    expect(uniq(items)).toEqual(["a", "b", "c"]);
  });

  test("should dedupe by reference for objects", () => {
    const a = { x: 1 };
    const b = { x: 1 };
    const items = [a, b, a];
    expect(uniq(items)).toEqual([a, b]);
  });

  test("should treat distinct but identical objects as unique", () => {
    const items = [{ x: 1 }, { x: 1 }];
    expect(uniq(items)).toEqual([{ x: 1 }, { x: 1 }]);
  });

  test("should handle nested arrays by reference", () => {
    const arr = [1, 2];
    const arrCopy = [...arr];
    const items = [arr, arrCopy, arr, arrCopy];
    expect(uniq(items)).toEqual([arr, arrCopy]);
  });
});
