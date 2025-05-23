export const hexToUint8Array = (hex: string): Uint8Array => {
  return Uint8Array.from({ length: hex.length >> 1 }, (_, i) =>
    parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
};

export const stringToUint8Array = (str: string): Uint8Array => {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
};

export const uint8ArrayToHex = (uint8Array: Uint8Array): string => {
  return Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
