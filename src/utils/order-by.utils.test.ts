import { describe, test, expect } from "bun:test";

import { orderBy } from "./order-by.utils";

describe("orderBy", () => {
  test("should sort array by a single key in ascending order", () => {
    const users = [
      { name: "Charlie", age: 30 },
      { name: "Alice", age: 25 },
      { name: "Bob", age: 35 },
    ];

    const result = orderBy(users, ["name"], ["asc"]);

    expect(result).toEqual([
      { name: "Alice", age: 25 },
      { name: "Bob", age: 35 },
      { name: "Charlie", age: 30 },
    ]);
  });

  test("should sort array by a single key in descending order", () => {
    const users = [
      { name: "Charlie", age: 30 },
      { name: "Alice", age: 25 },
      { name: "Bob", age: 35 },
    ];

    const result = orderBy(users, ["age"], ["desc"]);

    expect(result).toEqual([
      { name: "Bob", age: 35 },
      { name: "Charlie", age: 30 },
      { name: "Alice", age: 25 },
    ]);
  });

  test("should sort by multiple keys with different orders", () => {
    const users = [
      { name: "Alice", age: 25, active: true },
      { name: "Bob", age: 30, active: false },
      { name: "Charlie", age: 30, active: true },
      { name: "David", age: 25, active: false },
    ];

    const result = orderBy(users, ["age", "name"], ["desc", "asc"]);

    expect(result).toEqual([
      { name: "Bob", age: 30, active: false },
      { name: "Charlie", age: 30, active: true },
      { name: "Alice", age: 25, active: true },
      { name: "David", age: 25, active: false },
    ]);
  });

  test("should handle empty arrays", () => {
    const emptyArray: any[] = [];
    const result = orderBy(emptyArray, ["name"], ["asc"]);
    expect(result).toEqual([]);
  });

  test("should use 'asc' as default order if not specified", () => {
    const users = [
      { name: "Charlie", age: 30 },
      { name: "Alice", age: 25 },
    ];

    // Only specifying order for the first key
    const result = orderBy(users, ["name", "age"], ["desc"]);

    expect(result).toEqual([
      { name: "Charlie", age: 30 },
      { name: "Alice", age: 25 },
    ]);
  });

  test("should handle arrays with identical values", () => {
    const users = [
      { name: "Alice", age: 25 },
      { name: "Alice", age: 30 },
      { name: "Alice", age: 25 },
    ];

    const result = orderBy(users, ["name", "age"], ["asc", "desc"]);

    expect(result).toEqual([
      { name: "Alice", age: 30 },
      { name: "Alice", age: 25 },
      { name: "Alice", age: 25 },
    ]);
  });
});
