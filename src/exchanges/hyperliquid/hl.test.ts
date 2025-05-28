import { describe, test, expect } from "bun:test";

import { formatHLOrderPrice } from "./hl.utils";

import { OrderSide } from "~/types/lib.types";

const markets = {
  AAVE: { precision: { amount: 0.01, price: 0.0001 } },
} as any;

const tickers = {
  AAVE: { last: 234.55 },
} as any;

describe("formatHLOrderPrice", () => {
  test("should format order price", () => {
    const price = formatHLOrderPrice({
      order: { symbol: "AAVE", side: OrderSide.Buy, price: 234.554 },
      tickers,
      markets,
    });

    expect(price).toBe(234.55);
  });
});
