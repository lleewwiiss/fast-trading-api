export const mapObj = <T extends Record<string, any>, R>(
  obj: T,
  fn: (key: string, value: T[keyof T]) => R,
): R[] => {
  const result: R[] = [];
  for (const key in obj) result.push(fn(key, obj[key]));
  return result;
};
