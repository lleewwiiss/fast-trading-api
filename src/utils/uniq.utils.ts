export const uniq = <T>(arr: T[]): T[] => {
  const set = new Set<T>();
  arr.forEach((item) => set.add(item));
  return Array.from(set);
};
