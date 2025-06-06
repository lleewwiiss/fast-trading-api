import { describe, expect, test } from "bun:test";

import { tryParse } from "./try-parse.utils";

describe("tryParse", () => {
  test("should return undefined if the json is invalid", () => {
    const json = "invalid";
    const result = tryParse<{ a: number }>(json);
    expect(result).toBeUndefined();
  });

  test("should return the parsed object if the json is valid", () => {
    const json = '{"a": 1}';
    const result = tryParse<{ a: number }>(json);
    expect(result).toEqual({ a: 1 });
  });
});
