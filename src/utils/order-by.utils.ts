export const orderBy = <T>(
  arr: T[],
  iteratees: Array<keyof T | ((item: T) => any)> = [],
  orders: Array<"asc" | "desc"> = [],
): T[] => {
  const iterateeFns = iteratees.length
    ? iteratees.map((iter) =>
        typeof iter === "function" ? iter : (item: T) => item[iter],
      )
    : [(item: T) => item as any];

  return arr.slice().sort((a, b) => {
    for (let i = 0; i < iterateeFns.length; i++) {
      const fn = iterateeFns[i];
      const order = orders[i] || "asc";
      const valA = fn(a);
      const valB = fn(b);

      if (valA < valB) return order === "asc" ? -1 : 1;
      if (valA > valB) return order === "asc" ? 1 : -1;
    }

    return 0;
  });
};
