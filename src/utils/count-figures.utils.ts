export const countFigures = (value: string | number) => {
  const asString = value.toString().replace(".", "");
  const withoutZeros = asString.replace(/^0+|0+$/, "");
  return withoutZeros.length;
};
