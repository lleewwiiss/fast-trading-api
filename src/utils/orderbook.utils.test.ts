import { describe, test, expect } from "bun:test";

import { type OrderBook } from "../types/lib.types";

import { sortOrderBook, calcOrderBookTotal } from "./orderbook.utils";

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
});
