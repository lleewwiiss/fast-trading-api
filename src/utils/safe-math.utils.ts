import { afterDecimals } from "./after-decimals.utils";

export const adjust = (value: number, step: number | string) => {
  const multiplier = 1 / Number(step);
  const adjusted = Math.round(value * multiplier) / multiplier;
  const decimals = afterDecimals(step);
  return Math.round(adjusted * 10 ** decimals) / 10 ** decimals;
};

export const add = (a: number, b: number) => {
  const aDecimals = afterDecimals(a);
  const bDecimals = afterDecimals(b);
  const decimals = Math.max(aDecimals, bDecimals);
  return Math.round((a + b) * 10 ** decimals) / 10 ** decimals;
};

export const subtract = (a: number, b: number) => {
  const aDecimals = afterDecimals(a);
  const bDecimals = afterDecimals(b);
  const decimals = Math.max(aDecimals, bDecimals);
  return Math.round((a - b) * 10 ** decimals) / 10 ** decimals;
};

export const multiply = (a: number, b: number) => {
  const aDecimals = afterDecimals(a);
  const bDecimals = afterDecimals(b);
  const decimals = aDecimals + bDecimals;
  return Math.round(a * b * 10 ** decimals) / 10 ** decimals;
};

export const divide = (a: number, b: number) => {
  const aDecimals = afterDecimals(a);
  const bDecimals = afterDecimals(b);
  const decimals = Math.max(aDecimals, bDecimals);
  return Math.round((a / b) * 10 ** decimals) / 10 ** decimals;
};
