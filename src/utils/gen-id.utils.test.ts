import { describe, test, expect } from "bun:test";

import { genId, genIntId } from "./gen-id.utils";

describe("genId", () => {
  test("generates a string with length of at least 16 characters", () => {
    const id = genId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThanOrEqual(16);
  });

  test("generates lowercase letters and numbers only", () => {
    const id = genId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  test("generates unique IDs", () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      ids.add(genId());
    }
    // If all IDs are unique, the Set size will equal the number of generations
    expect(ids.size).toBe(1000);
  });
});

describe("genIntId", () => {
  test("generates unique IDs", () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      ids.add(genIntId());
    }
    expect(ids.size).toBe(1000);
  });

  test("generates a positive integer", () => {
    const id = genIntId();
    expect(typeof id).toBe("number");
    expect(Number.isInteger(id)).toBe(true);
    expect(id).toBeGreaterThan(0);
  });

  test("generates monotonically increasing IDs when called rapidly", () => {
    const ids = [];
    for (let i = 0; i < 100; i++) {
      ids.push(genIntId());
    }

    // Check that IDs are generally increasing (accounting for timestamp progression)
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThanOrEqual(ids[i - 1]);
    }
  });

  test("handles multiple calls in the same millisecond", () => {
    // This test ensures the counter works for same-millisecond calls
    const ids = [];
    const startTime = Date.now();

    // Generate IDs as fast as possible to potentially hit same millisecond
    while (Date.now() === startTime && ids.length < 10) {
      ids.push(genIntId());
    }

    // All IDs should be unique even if generated in same millisecond
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
