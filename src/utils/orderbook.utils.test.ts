import { describe, test, expect } from "bun:test";

import { type OrderBook } from "../types/lib.types";

import {
  sortOrderBook,
  calcOrderBookTotal,
  precisionGroup,
  toDollars,
} from "./orderbook.utils";

describe("orderbook", () => {
  test("sortOrderBook should sort asks ascending and bids descending", () => {
    // Arrange
    const orderBook: OrderBook = {
      asks: [
        { price: 200, amount: 5, total: 0 },
        { price: 100, amount: 10, total: 0 },
        { price: 150, amount: 7, total: 0 },
      ],
      bids: [
        { price: 80, amount: 8, total: 0 },
        { price: 95, amount: 3, total: 0 },
        { price: 90, amount: 12, total: 0 },
      ],
    };

    // Act
    sortOrderBook(orderBook);

    // Assert
    expect(orderBook.asks[0].price).toBe(100);
    expect(orderBook.asks[1].price).toBe(150);
    expect(orderBook.asks[2].price).toBe(200);

    expect(orderBook.bids[0].price).toBe(95);
    expect(orderBook.bids[1].price).toBe(90);
    expect(orderBook.bids[2].price).toBe(80);
  });

  test("calcOrderBookTotal should calculate running totals", () => {
    // Arrange
    const orderBook: OrderBook = {
      asks: [
        { price: 100, amount: 10, total: 0 },
        { price: 150, amount: 5, total: 0 },
        { price: 200, amount: 3, total: 0 },
      ],
      bids: [
        { price: 95, amount: 8, total: 0 },
        { price: 90, amount: 7, total: 0 },
        { price: 85, amount: 4, total: 0 },
      ],
    };

    // Act
    calcOrderBookTotal(orderBook);

    // Assert
    expect(orderBook.asks[0].total).toBe(10);
    expect(orderBook.asks[1].total).toBe(15);
    expect(orderBook.asks[2].total).toBe(18);

    expect(orderBook.bids[0].total).toBe(8);
    expect(orderBook.bids[1].total).toBe(15);
    expect(orderBook.bids[2].total).toBe(19);
  });

  test("calcOrderBookTotal should handle empty orderbook", () => {
    // Arrange
    const orderBook: OrderBook = {
      asks: [],
      bids: [],
    };

    // Act & Assert
    expect(() => calcOrderBookTotal(orderBook)).not.toThrow();
  });

  test("sortOrderBook and calcOrderBookTotal work together", () => {
    // Arrange
    const orderBook: OrderBook = {
      asks: [
        { price: 200, amount: 3, total: 0 },
        { price: 100, amount: 10, total: 0 },
        { price: 150, amount: 5, total: 0 },
      ],
      bids: [
        { price: 80, amount: 4, total: 0 },
        { price: 95, amount: 8, total: 0 },
        { price: 90, amount: 7, total: 0 },
      ],
    };

    // Act
    sortOrderBook(orderBook);
    calcOrderBookTotal(orderBook);

    // Assert
    // Check sorting
    expect(orderBook.asks[0].price).toBe(100);
    expect(orderBook.asks[1].price).toBe(150);
    expect(orderBook.asks[2].price).toBe(200);

    expect(orderBook.bids[0].price).toBe(95);
    expect(orderBook.bids[1].price).toBe(90);
    expect(orderBook.bids[2].price).toBe(80);

    // Check totals after sorting
    expect(orderBook.asks[0].total).toBe(10);
    expect(orderBook.asks[1].total).toBe(15);
    expect(orderBook.asks[2].total).toBe(18);

    expect(orderBook.bids[0].total).toBe(8);
    expect(orderBook.bids[1].total).toBe(15);
    expect(orderBook.bids[2].total).toBe(19);
  });

  describe("precisionGroup", () => {
    test("groups orders by price bucket and sums amounts", () => {
      const orders = [
        { price: 101, amount: 2, total: 5 },
        { price: 109, amount: 3, total: 8 },
        { price: 115, amount: 1, total: 1 },
      ];
      const result = precisionGroup(10, orders);
      // Two buckets: 100 and 110
      expect(result).toHaveLength(2);

      const bucket100 = result.find((o) => o.price === 100)!;
      expect(bucket100.amount).toBe(5); // 2 + 3
      expect(bucket100.total).toBe(8); // last total in bucket

      const bucket110 = result.find((o) => o.price === 110)!;
      expect(bucket110.amount).toBe(1);
      expect(bucket110.total).toBe(1);
    });

    test("returns empty array when no orders", () => {
      expect(precisionGroup(5, [])).toEqual([]);
    });
  });

  describe("toDollars", () => {
    test("converts amounts to dollar values rounded to two decimals", () => {
      const orderBook = {
        bids: [
          { price: 50.123, amount: 1.234, total: 0 },
          { price: 2, amount: 3.3333, total: 0 },
        ],
        asks: [{ price: 10, amount: 0.555, total: 0 }],
      };
      toDollars(orderBook);
      // 1.234 * 50.123 = 61.851782 -> 61.85
      expect(orderBook.bids[0].amount).toBe(61.85);
      // 3.3333 * 2 = 6.6666 -> 6.67
      expect(orderBook.bids[1].amount).toBe(6.67);
      // 0.555 * 10 = 5.55 -> 5.55
      expect(orderBook.asks[0].amount).toBe(5.55);
      // totals untouched
      expect(orderBook.bids[0].total).toBe(0);
      expect(orderBook.asks[0].total).toBe(0);
    });

    test("handles empty orderbook without errors", () => {
      const empty: OrderBook = { bids: [], asks: [] };
      expect(() => toDollars(empty)).not.toThrow();
    });
  });
});
