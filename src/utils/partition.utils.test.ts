import { describe, test, expect } from "bun:test";

import { partition } from "./partition.utils";

describe("partition utility", () => {
  test("should partition numbers by even/odd", () => {
    const numbers = [1, 2, 3, 4, 5, 6];
    const [evens, odds] = partition(numbers, (n) => n % 2 === 0);

    expect(evens).toEqual([2, 4, 6]);
    expect(odds).toEqual([1, 3, 5]);
  });

  test("should handle empty arrays", () => {
    const emptyArray: number[] = [];
    const [truthy, falsy] = partition(emptyArray, Boolean);

    expect(truthy).toEqual([]);
    expect(falsy).toEqual([]);
  });

  test("should handle arrays where all items satisfy predicate", () => {
    const positiveNumbers = [1, 2, 3, 4, 5];
    const [positive, negative] = partition(positiveNumbers, (n) => n > 0);

    expect(positive).toEqual([1, 2, 3, 4, 5]);
    expect(negative).toEqual([]);
  });

  test("should handle arrays where no items satisfy predicate", () => {
    const positiveNumbers = [1, 2, 3, 4, 5];
    const [negative, positive] = partition(positiveNumbers, (n) => n < 0);

    expect(negative).toEqual([]);
    expect(positive).toEqual([1, 2, 3, 4, 5]);
  });

  test("should work with arrays of objects", () => {
    const users = [
      { name: "Alice", age: 25 },
      { name: "Bob", age: 17 },
      { name: "Charlie", age: 30 },
      { name: "Dave", age: 15 },
    ];

    const [adults, minors] = partition(users, (user) => user.age >= 18);

    expect(adults).toEqual([
      { name: "Alice", age: 25 },
      { name: "Charlie", age: 30 },
    ]);
    expect(minors).toEqual([
      { name: "Bob", age: 17 },
      { name: "Dave", age: 15 },
    ]);
  });

  test("should work with arrays of strings", () => {
    const words = ["apple", "banana", "cherry", "date", "elderberry"];
    const [longWords, shortWords] = partition(words, (word) => word.length > 5);

    expect(longWords).toEqual(["banana", "cherry", "elderberry"]);
    expect(shortWords).toEqual(["apple", "date"]);
  });
});
