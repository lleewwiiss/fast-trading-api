import { describe, test, expect } from "bun:test";

import { genId } from "./gen-id.utils";

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
