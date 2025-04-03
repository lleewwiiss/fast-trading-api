export const orderBy = <T>(
  arr: T[],
  keys: Array<keyof T>,
  orders: Array<"asc" | "desc">,
): T[] => {
  return arr.sort((a, b) => {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const order = orders[i] || "asc";

      if (a[key] < b[key]) return order === "asc" ? -1 : 1;
      if (a[key] > b[key]) return order === "asc" ? 1 : -1;
    }

    return 0;
  });
};
