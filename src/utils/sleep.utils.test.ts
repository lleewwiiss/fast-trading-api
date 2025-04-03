import { describe, test, expect } from "bun:test";

import { sleep } from "./sleep.utils";

describe("sleep utility", () => {
  test("should return a promise", () => {
    const result = sleep(10);
    expect(result).toBeInstanceOf(Promise);
  });

  test("should delay execution for the specified time", async () => {
    const startTime = performance.now();
    const delayMs = 100;

    await sleep(delayMs);

    const endTime = performance.now();
    const elapsedTime = endTime - startTime;

    // Allow for some timing variance, but ensure we waited at least close to the expected time
    expect(elapsedTime).toBeGreaterThanOrEqual(delayMs - 10);
  });

  test("should handle zero milliseconds", async () => {
    const result = await sleep(0);
    expect(result).toBeUndefined();
  });

  test("should handle very small delays", async () => {
    const startTime = performance.now();

    await sleep(1);

    const endTime = performance.now();
    const elapsedTime = endTime - startTime;

    expect(elapsedTime).toBeGreaterThan(0);
  });
});
