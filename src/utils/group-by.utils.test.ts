import { describe, test, expect } from "bun:test";

import { groupBy } from "./group-by.utils";

describe("groupBy utility function", () => {
  test("should return empty object for empty array", () => {
    const result = groupBy([], () => "key") as Record<string, any[]>;
    expect(result).toEqual({});
  });

  test("should group numbers into even and odd", () => {
    const data = [1, 2, 3, 4, 5];
    const result = groupBy(data, (n) => (n % 2 === 0 ? "even" : "odd"));
    expect(result).toEqual({
      even: [2, 4],
      odd: [1, 3, 5],
    });
  });

  test("should group objects by a specified property", () => {
    const items = [
      { type: "fruit", name: "apple" },
      { type: "fruit", name: "banana" },
      { type: "vegetable", name: "carrot" },
    ];
    const result = groupBy(items, (item) => item.type);
    expect(result).toEqual({
      fruit: [
        { type: "fruit", name: "apple" },
        { type: "fruit", name: "banana" },
      ],
      vegetable: [{ type: "vegetable", name: "carrot" }],
    });
  });

  test("should handle grouping strings by identity", () => {
    const data = ["a", "b", "a"];
    const result = groupBy(data, (s) => s);
    expect(result).toEqual({
      a: ["a", "a"],
      b: ["b"],
    });
  });
});
