import { describe, test, expect } from "bun:test";

import { deepMerge } from "./deep-merge.utils";

describe("deepMerge", () => {
  test("returns target when source is undefined", () => {
    const target: any = { a: 1 };
    const result = deepMerge(target, undefined);
    expect(result).toEqual({ a: 1 });
    expect(result).toBe(target);
  });

  test("returns target when source is not an object", () => {
    const target: any = { a: 1 };
    const result = deepMerge<any>(target, 42 as any);
    expect(result).toEqual({ a: 1 });
  });

  test("returns source when target is not an object", () => {
    const source: any = { a: 1 };
    const result = deepMerge<any>(42 as any, source);
    expect(result).toEqual({ a: 1 });
  });

  test("keeps source array when both target and source are arrays", () => {
    const target: any = [1, 2, 3];
    const source: any = [4, 5];
    const result = deepMerge(target, source);
    expect(result).toEqual(source);
  });

  test("nested keeps source array when both nested arrays exist", () => {
    const targetArr = [1, 2, 3];
    const sourceArr = [4, 5];
    const target: any = { a: targetArr };
    const source: any = { a: sourceArr };
    const result = deepMerge(target, source);
    expect(result.a).toBe(sourceArr);
  });

  test("merges nested objects and adds new properties", () => {
    const target: any = { a: 1, b: { c: 2 } };
    const source: any = { b: { d: 3 }, e: 4 };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
  });

  test("overwrites primitive values in objects", () => {
    const target: any = { a: 1, b: 2 };
    const source: any = { b: 3 };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: 1, b: 3 });
  });

  test("deeply merges multiple nested levels", () => {
    const target: any = { a: { b: { c: 1 } }, d: 2 };
    const source: any = { a: { b: { e: 2 } } };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: { b: { c: 1, e: 2 } }, d: 2 });
  });

  test("nested array in source overwrites object in target", () => {
    const target: any = { a: { b: { c: 1 } } };
    const source: any = { a: { b: [10, 20] } };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: { b: [10, 20] } });
  });

  test("does not mutate original target or source", () => {
    const target: any = { a: { b: 1 } };
    const source: any = { a: { c: 2 } };
    const targetClone = JSON.parse(JSON.stringify(target));
    const sourceClone = JSON.parse(JSON.stringify(source));
    deepMerge(target, source);
    expect(target).toEqual(targetClone);
    expect(source).toEqual(sourceClone);
  });
});

// End of tests
