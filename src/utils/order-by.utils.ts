export const orderBy = <T>(
  arr: T[],
  iteratees: Array<keyof T | ((item: T) => any)> = [],
  orders: Array<"asc" | "desc"> = [],
): T[] => {
  const len = arr.length;
  if (len < 2) return arr.slice();

  const cc = iteratees.length || 1;
  const mul: number[] = new Array(cc);
  const fns: ((item: T) => any)[] = new Array(cc);

  // build multipliers and functions
  if (cc === 1 && iteratees.length === 0) {
    mul[0] = orders[0] === "desc" ? -1 : 1;
    fns[0] = (x: any) => x;
  } else {
    for (let i = 0; i < cc; i++) {
      mul[i] = orders[i] === "desc" ? -1 : 1;
      const it = iteratees[i];
      fns[i] =
        typeof it === "function" ? (it as (item: T) => any) : (x: any) => x[it];
    }
  }

  // Single-criteria fast path
  if (cc === 1) {
    const fn = fns[0];
    const m = mul[0];

    return arr.slice().sort((a, b) => {
      const A = fn(a);
      const B = fn(b);
      if (A == null && B != null) return -1 * m;
      if (B == null && A != null) return 1 * m;
      return (A > B ? 1 : A < B ? -1 : 0) * m;
    });
  }

  // Two-criteria fast path
  if (cc === 2) {
    const fn0 = fns[0];
    const fn1 = fns[1];
    const m0 = mul[0];
    const m1 = mul[1];

    // decorate
    const nodes = new Array<{ i: number; k0: any; k1: any; v: T }>(len);
    for (let i = 0; i < len; i++) {
      const v = arr[i];
      const a = fn0(v);
      const b = fn1(v);
      nodes[i] = {
        i,
        k0: a == null ? -Infinity : a,
        k1: b == null ? -Infinity : b,
        v,
      };
    }

    // sort
    nodes.sort((x, y) => {
      if (x.k0 > y.k0) return 1 * m0;
      if (x.k0 < y.k0) return -1 * m0;
      if (x.k1 > y.k1) return 1 * m1;
      if (x.k1 < y.k1) return -1 * m1;
      return x.i - y.i;
    });

    // undecorate
    const res = new Array<T>(len);
    for (let i = 0; i < len; i++) res[i] = nodes[i].v;
    return res;
  }

  // Generic multi-criteria path
  type Node = { idx: number; keys: any[]; v: T };
  const nodes: Node[] = new Array(len);

  for (let i = 0; i < len; i++) {
    const v = arr[i];
    const keys = new Array(cc);

    for (let j = 0; j < cc; j++) {
      const k = fns[j](v);
      keys[j] = k == null ? -Infinity : k;
    }

    nodes[i] = { idx: i, keys, v };
  }

  nodes.sort((a, b) => {
    for (let j = 0; j < cc; j++) {
      const A = a.keys[j];
      const B = b.keys[j];
      if (A !== B) return (A > B ? 1 : -1) * mul[j];
    }

    return a.idx - b.idx;
  });

  const res = new Array<T>(len);
  for (let i = 0; i < len; i++) res[i] = nodes[i].v;
  return res;
};
