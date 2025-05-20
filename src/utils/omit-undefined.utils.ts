export const omitUndefined = <T extends Record<string, any>>(obj: T): T => {
  const result = {} as T;

  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key as keyof T] = obj[key];
    }
  }

  return result;
};
