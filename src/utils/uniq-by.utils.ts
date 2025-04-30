export const uniqBy = <T>(arr: T[], fn: (item: T) => string | number): T[] => {
  const seen = new Set<string | number>();

  return arr.filter((item) => {
    const key = fn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
