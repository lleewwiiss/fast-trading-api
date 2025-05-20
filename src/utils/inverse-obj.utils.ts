export function inverseObj<K extends PropertyKey, V extends PropertyKey>(
  obj: Record<K, V>,
): Record<V, K> {
  const result = {} as Record<V, K>;

  for (const key in obj) {
    result[obj[key]] = key;
  }

  return result;
}
