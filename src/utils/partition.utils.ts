export const partition = <T>(array: T[], predicate: (item: T) => boolean) => {
  return array.reduce(
    (acc, item) => {
      acc[predicate(item) ? 0 : 1].push(item);
      return acc;
    },
    [[], []] as T[][],
  );
};
