export const stringify = (obj: Record<string, any>): string => {
  if (!obj) return "";

  return Object.entries(obj)
    .map(([key, value]) => {
      if (value === null || value === undefined) return key;

      // Handle arrays
      if (Array.isArray(value)) {
        return value
          .map(
            (item) =>
              `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`,
          )
          .join("&");
      }

      // Handle objects (simple nesting with brackets)
      if (typeof value === "object") {
        return Object.entries(value)
          .map(
            ([subKey, subValue]) =>
              `${encodeURIComponent(key)}[${encodeURIComponent(subKey)}]=${encodeURIComponent(String(subValue))}`,
          )
          .join("&");
      }

      return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
    })
    .filter(Boolean)
    .join("&");
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
