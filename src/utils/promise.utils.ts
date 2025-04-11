export const mapPromise = async <T, R>(
  arr: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];

  for (const item of arr) {
    const result = await fn(item);
    results.push(result);
  }

  return results;
};
