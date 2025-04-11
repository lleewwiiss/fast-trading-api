export const omit = <T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> => {
  const result: Partial<T> = {};
  Object.keys(obj).forEach((key) => {
    if (!keys.includes(key as K)) {
      result[key as keyof T] = obj[key];
    }
  });
  return result as Omit<T, K>;
};
