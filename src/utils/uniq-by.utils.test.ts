import { describe, test, expect } from "bun:test";

import { uniqBy } from "./uniq-by.utils";

describe("uniqBy utility function", () => {
  test("should return empty array for empty input", () => {
    expect(uniqBy([], (x) => x)).toEqual([]);
  });

  test("should return all items when no duplicates", () => {
    const items = [1, 2, 3];
    expect(uniqBy(items, (x) => x)).toEqual([1, 2, 3]);
  });

  test("should remove duplicates based on key", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "a" }];
    expect(uniqBy(items, (item) => item.id)).toEqual([
      { id: "a" },
      { id: "b" },
    ]);
  });

  test("should preserve first occurrence order", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 1 }, { id: 2 }, { id: 3 }];
    const result = uniqBy(items, (item) => item.id);
    expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  test("should handle mixed key types and values", () => {
    const items = [
      { key: 0 },
      { key: -1 },
      { key: 0 },
      { key: "0" },
      { key: -1 },
    ];
    const result = uniqBy(items, (item) => item.key);
    expect(result).toEqual([{ key: 0 }, { key: -1 }, { key: "0" }]);
  });
});
