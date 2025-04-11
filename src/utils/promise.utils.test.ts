import { describe, test, expect } from "bun:test";

import { mapPromise } from "./promise.utils";

describe("mapPromise", () => {
  test("should map array elements with async function", async () => {
    const input = [1, 2, 3, 4, 5];
    const result = await mapPromise(input, async (num) => num * 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
  });

  test("should handle empty array", async () => {
    const result = await mapPromise([], async (item) => item);
    expect(result).toEqual([]);
  });

  test("should maintain order of results", async () => {
    const input = [100, 50, 200, 25];
    const result = await mapPromise(input, async (ms) => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(`processed-${ms}`), ms / 10);
      });
    });
    expect(result).toEqual([
      "processed-100",
      "processed-50",
      "processed-200",
      "processed-25",
    ]);
  });

  test("should handle async functions that throw errors", async () => {
    const input = [1, 2, 3, 4, 5];

    try {
      await mapPromise(input, async (num) => {
        if (num === 3) throw new Error("Test error");
        return num * 2;
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Test error");
    }
  });

  test("should handle complex object transformations", async () => {
    const input = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, name: "Charlie" },
    ];

    const result = await mapPromise(input, async (user) => {
      return {
        userId: user.id,
        username: user.name.toLowerCase(),
        verified: true,
      };
    });

    expect(result).toEqual([
      { userId: 1, username: "alice", verified: true },
      { userId: 2, username: "bob", verified: true },
      { userId: 3, username: "charlie", verified: true },
    ]);
  });
});
