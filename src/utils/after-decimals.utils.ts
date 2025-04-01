export const afterDecimal = (num: number | string) => {
  if (Number.isInteger(num)) return 0;

  const str = num?.toString?.();

  if (str?.includes?.("e")) {
    const [, exponent] = str.split("e");
    return Math.abs(Number(exponent));
  }

  return str?.split?.(".")?.[1]?.length || 2;
};
