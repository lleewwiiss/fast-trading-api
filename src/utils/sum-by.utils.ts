export const sumBy = <T>(
  arr: T[],
  iteratee: keyof T | ((item: T) => number),
): number => {
  return arr.reduce((acc, obj) => {
    const val = typeof iteratee === "function" ? iteratee(obj) : obj[iteratee];
    return typeof val !== "number" || isNaN(val) ? acc : acc + val;
  }, 0);
};
