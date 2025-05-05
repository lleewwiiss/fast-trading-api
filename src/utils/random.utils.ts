export const random = (min: number, max: number) => {
  if (min > max) throw new Error("Min value cannot be greater than max value");
  if (min === max) return min;
  return Math.random() * (max - min) + min;
};
