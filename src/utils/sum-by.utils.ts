export const sumBy = <T>(arr: T[], key: keyof T): number => {
  return arr.reduce((acc, obj) => {
    const value = obj[key];
    if (typeof value === "number") {
      return acc + value;
    }
    return acc;
  }, 0);
};
