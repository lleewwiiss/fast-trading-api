export type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

export type ObjectPaths<T> = T extends object
  ? {
      [K in keyof T & (string | number)]: T[K] extends object
        ? `${K}` | `${K}.${ObjectPaths<T[K]>}`
        : `${K}`;
    }[keyof T & (string | number)]
  : never;

export type Split<
  S extends string,
  D extends string,
> = S extends `${infer T}${D}${infer U}` ? [T, ...Split<U, D>] : [S];

export type ValueAtPath<T, Parts extends readonly string[]> = Parts extends [
  infer Head,
  ...infer Tail,
]
  ? Head extends keyof T
    ? ValueAtPath<T[Head], Tail extends string[] ? Tail : []>
    : Head extends string
      ? T extends Record<string, any>
        ? ValueAtPath<T[Head & string], Tail extends string[] ? Tail : []>
        : T extends Array<infer U>
          ? Head extends `${number}`
            ? ValueAtPath<U, Tail extends string[] ? Tail : []>
            : never
          : never
      : never
  : T;

export type ObjectChangeCommand<T, P extends ObjectPaths<T>> =
  | { type: "update"; path: P; value: ValueAtPath<T, Split<P, ".">> }
  | {
      type: "removeArrayElement";
      path: P & (ValueAtPath<T, Split<P, ".">> extends any[] ? unknown : never);
      index: number;
    };
