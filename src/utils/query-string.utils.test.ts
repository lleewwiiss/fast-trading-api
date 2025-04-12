import { describe, test, expect } from "bun:test";

import { stringify, parse } from "./query-string.utils";

describe("stringify", () => {
  test("should convert simple object to query string", () => {
    const obj = { a: 1, b: "2", c: true };
    expect(stringify(obj)).toBe("a=1&b=2&c=true");
  });

  test("should handle arrays", () => {
    const obj = { a: [1, 2, 3] };
    expect(stringify(obj)).toBe("a=1&a=2&a=3");
  });

  test("should handle nested objects", () => {
    const obj = { user: { name: "John", age: 30 } };
    expect(stringify(obj)).toBe("user[name]=John&user[age]=30");
  });

  test("should handle null and undefined values", () => {
    const obj = { a: null, b: undefined, c: "value" };
    expect(stringify(obj)).toBe("a&b&c=value");
  });

  test("should properly encode special characters", () => {
    const obj = { "key with spaces": "value with &=?" };
    expect(stringify(obj)).toBe("key%20with%20spaces=value%20with%20%26%3D%3F");
  });

  test("should return empty string for empty or invalid input", () => {
    expect(stringify({})).toBe("");
    expect(stringify(null as any)).toBe("");
    expect(stringify(undefined as any)).toBe("");
  });
});

describe("parse", () => {
  test("should convert query string to object", () => {
    const str = "a=1&b=2&c=true";
    expect(parse(str)).toEqual({ a: "1", b: "2", c: "true" });
  });

  test("should handle repeated keys as arrays", () => {
    const str = "a=1&a=2&a=3";
    expect(parse(str)).toEqual({ a: ["1", "2", "3"] });
  });

  test("should handle nested objects with bracket notation", () => {
    const str = "user[name]=John&user[age]=30";
    expect(parse(str)).toEqual({ user: { name: "John", age: "30" } });
  });

  test("should handle keys without values", () => {
    const str = "a&b&c=value";
    expect(parse(str)).toEqual({ a: true, b: true, c: "value" });
  });

  test("should decode URL encoded characters", () => {
    const str = "key%20with%20spaces=value%20with%20%26%3D%3F";
    expect(parse(str)).toEqual({ "key with spaces": "value with &=?" });
  });

  test("should handle query string with leading question mark", () => {
    const str = "?a=1&b=2";
    expect(parse(str)).toEqual({ a: "1", b: "2" });
  });

  test("should return empty object for empty or invalid input", () => {
    expect(parse("")).toEqual({});
    expect(parse("?")).toEqual({});
    expect(parse(null as any)).toEqual({});
    expect(parse(undefined as any)).toEqual({});
  });
});
