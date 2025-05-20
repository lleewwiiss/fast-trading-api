export const stringify = (obj: Record<string, any>): string => {
  if (!obj) return "";

  const parts: string[] = [];

  for (const key in obj) {
    const value = obj[key];

    if (value === null || value === undefined) {
      parts.push(key);
      continue;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`,
        );
      }
      continue;
    }

    // Handle objects (simple nesting with brackets)
    if (typeof value === "object") {
      for (const subKey in value) {
        parts.push(
          `${encodeURIComponent(key)}[${encodeURIComponent(subKey)}]=${encodeURIComponent(String(value[subKey]))}`,
        );
      }
      continue;
    }

    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }

  return parts.join("&");
};

export const parse = (str: string): Record<string, any> => {
  if (!str || typeof str !== "string") return {};

  // Remove leading ? if present
  const queryString = str.startsWith("?") ? str.slice(1) : str;

  if (!queryString) return {};

  return queryString.split("&").reduce(
    (result, param) => {
      // Handle key without value (flag parameter)
      if (!param.includes("=")) {
        result[decodeURIComponent(param)] = true;
        return result;
      }

      const [key, value] = param.split("=").map(decodeURIComponent);

      // Handle nested objects with bracket notation
      if (key.includes("[") && key.includes("]")) {
        const mainKey = key.slice(0, key.indexOf("["));
        const subKey = key.slice(key.indexOf("[") + 1, key.indexOf("]"));

        if (!result[mainKey]) {
          result[mainKey] = {};
        }

        result[mainKey][subKey] = value;
        return result;
      }

      // Handle array parameters (same key multiple times)
      if (result[key] !== undefined) {
        if (!Array.isArray(result[key])) {
          result[key] = [result[key]];
        }
        result[key].push(value);
      } else {
        result[key] = value;
      }

      return result;
    },
    {} as Record<string, any>,
  );
};
