import { describe, test, expect } from "bun:test";

import { retry } from "./retry.utils";

describe("retry", () => {
  test("should resolve immediately if the function succeeds on first attempt", async () => {
    const mockFn = () => Promise.resolve("success");
    const result = await retry(mockFn);
    expect(result).toBe("success");
  });

  test("should retry and succeed if function fails but succeeds before max retries", async () => {
    let attempts = 0;
    const mockFn = () => {
      attempts++;
      if (attempts < 3) {
        return Promise.reject(new Error("temporary failure"));
      }
      return Promise.resolve("success after retry");
    };

    const result = await retry(mockFn);
    expect(result).toBe("success after retry");
    expect(attempts).toBe(3);
  });

  test("should throw if max retries are exhausted", async () => {
    let attempts = 0;
    const mockFn = () => {
      attempts++;
      return Promise.reject(new Error("persistent failure"));
    };

    expect(retry(mockFn, 3)).rejects.toThrow("persistent failure");
    expect(attempts).toBe(4); // Initial attempt + 3 retries
  });

  test("should respect custom retry count", async () => {
    let attempts = 0;
    const mockFn = () => {
      attempts++;
      return Promise.reject(new Error("failure"));
    };

    expect(retry(mockFn, 5)).rejects.toThrow("failure");
    expect(attempts).toBe(6); // Initial attempt + 5 retries
  });
});
