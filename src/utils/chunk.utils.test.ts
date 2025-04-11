import { describe, expect, test } from "bun:test";

import { chunk } from "./chunk.utils";
describe("chunk", () => {
  test("should return empty array when input array is empty", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  test("should return array with one chunk when size is larger than array length", () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
  });

  test("should return array with one chunk when size equals array length", () => {
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  test("should properly chunk array when size is smaller than array length", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("should work with different data types", () => {
    expect(chunk(["a", "b", "c", "d"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);

    const objects = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const chunkedObjects = chunk(objects, 3);
    expect(chunkedObjects).toEqual([
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      [{ id: 4 }, { id: 5 }],
    ]);
  });
});
