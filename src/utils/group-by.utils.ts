export const groupBy = <T, K extends string>(
  arr: T[],
  predicate: (item: T) => K,
): Record<K, T[]> => {
  return arr.reduce(
    (acc, item) => {
      const key = predicate(item);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
};
