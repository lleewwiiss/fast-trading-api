export function inverseObj<K extends PropertyKey, V extends PropertyKey>(
  obj: Record<K, V>,
): Record<V, K> {
  return Object.entries(obj).reduce(
    (acc, [key, value]) => {
      const typedKey = key as unknown as K;
      const typedValue = value as unknown as V;
      acc[typedValue] = typedKey;
      return acc;
    },
    {} as Record<V, K>,
  );
}
