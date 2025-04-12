export const omitUndefined = <T extends Record<string, any>>(obj: T): T => {
  const result = {} as T;

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key as keyof T] = value;
    }
  }

  return result;
};
