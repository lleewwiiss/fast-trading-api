import type { DeepPartial } from "~/types/misc.types";

export const deepMerge = <T>(target: T, source?: DeepPartial<T>): T => {
  // If source is not a non-null object, return target as is
  if (typeof source !== "object" || source === null) {
    return target;
  }
  // If target is not a non-null object, return source casted
  if (typeof target !== "object" || target === null) {
    return source as T;
  }
  // If both target and source are arrays, always keep source array (do not merge arrays)
  if (Array.isArray(target) && Array.isArray(source)) {
    return source as T;
  }

  // Merge objects
  const result = structuredClone(target) as any;

  for (const key of Object.keys(source)) {
    const srcValue = (source as any)[key];
    const tgtValue = (result as any)[key];
    // If target value is an array, always keep target array
    if (Array.isArray(tgtValue) || Array.isArray(srcValue)) {
      result[key] = srcValue;
    }
    // Deep merge objects
    else if (
      typeof srcValue === "object" &&
      srcValue !== null &&
      typeof tgtValue === "object" &&
      tgtValue !== null
    ) {
      result[key] = deepMerge(tgtValue, srcValue);
    } else {
      result[key] = srcValue;
    }
  }

  return result as T;
};
