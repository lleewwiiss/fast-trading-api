export const times = <T>(count: number, mapFn: (index: number) => T): T[] => {
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    result.push(mapFn(i));
  }
  return result;
};
