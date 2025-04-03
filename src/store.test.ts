import { describe, test, expect } from "bun:test";

import { MemoryStore } from "./store";
import { ExchangeName, OrderSide, PositionSide } from "./types/exchange.types";
import type { ExchangeTicker, ExchangePosition } from "./types/exchange.types";

describe("MemoryStore", () => {
  test("should initialize with default state", () => {
    const store = new MemoryStore();
    expect(store.memory).toEqual({
      [ExchangeName.BYBIT]: {
        public: {
          tickers: {},
          markets: {},
          orderBooks: {},
        },
        private: {},
      },
    });
  });

  describe("applyChanges", () => {
    test("should apply a simple update change", () => {
      const store = new MemoryStore();
      const ticker: ExchangeTicker = {
        id: "BTCUSDT",
        symbol: "BTCUSDT",
        cleanSymbol: "BTC/USDT",
        bid: 49900,
        ask: 50100,
        last: 50000,
        mark: 50000,
        index: 50050,
        percentage: 2.5,
        openInterest: 1000000,
        fundingRate: 0.0001,
        volume: 5000,
        quoteVolume: 250000000,
      };

      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.public.tickers.BTCUSDT`,
          value: ticker,
        },
      ]);

      expect(store.memory[ExchangeName.BYBIT].public.tickers.BTCUSDT).toEqual(
        ticker,
      );
    });

    test("should apply multiple update changes", () => {
      const store = new MemoryStore();
      const ticker1: ExchangeTicker = {
        id: "BTCUSDT",
        symbol: "BTCUSDT",
        cleanSymbol: "BTC/USDT",
        bid: 49900,
        ask: 50100,
        last: 50000,
        mark: 50000,
        index: 50050,
        percentage: 2.5,
        openInterest: 1000000,
        fundingRate: 0.0001,
        volume: 5000,
        quoteVolume: 250000000,
      };

      const ticker2: ExchangeTicker = {
        id: "ETHUSDT",
        symbol: "ETHUSDT",
        cleanSymbol: "ETH/USDT",
        bid: 2990,
        ask: 3010,
        last: 3000,
        mark: 2995,
        index: 3001,
        percentage: 1.5,
        openInterest: 500000,
        fundingRate: 0.0002,
        volume: 10000,
        quoteVolume: 30000000,
      };

      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.public.tickers.BTCUSDT`,
          value: ticker1,
        },
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.public.tickers.ETHUSDT`,
          value: ticker2,
        },
      ]);

      expect(store.memory[ExchangeName.BYBIT].public.tickers.BTCUSDT).toEqual(
        ticker1,
      );
      expect(store.memory[ExchangeName.BYBIT].public.tickers.ETHUSDT).toEqual(
        ticker2,
      );
    });

    test("should update a nested property", () => {
      const store = new MemoryStore();
      // First set up the account
      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1`,
          value: {
            balance: { used: 1000, free: 9000, total: 10000, upnl: 500 },
            positions: [],
            orders: [],
            notifications: [],
          },
        },
      ]);

      // Then update a nested property
      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1.balance.free`,
          value: 8500,
        },
      ]);

      expect(
        store.memory[ExchangeName.BYBIT].private.account1.balance.free,
      ).toBe(8500);
      expect(
        store.memory[ExchangeName.BYBIT].private.account1.balance.total,
      ).toBe(10000);
    });

    test("should handle updating arrays", () => {
      const store = new MemoryStore();
      const position: ExchangePosition = {
        symbol: "BTCUSDT",
        side: PositionSide.Long,
        entryPrice: 50000,
        notional: 10000,
        leverage: 10,
        upnl: 0,
        contracts: 0.2,
        liquidationPrice: 45000,
      };

      // Set up account with positions
      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1`,
          value: {
            balance: { used: 0, free: 0, total: 0, upnl: 0 },
            positions: [position],
            orders: [],
            notifications: [],
          },
        },
      ]);

      const newPosition: ExchangePosition = {
        symbol: "ETHUSDT",
        side: PositionSide.Short,
        entryPrice: 3000,
        notional: 6000,
        leverage: 10,
        upnl: 0,
        contracts: 2,
        liquidationPrice: 3300,
      };

      // Add a new position
      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1.positions.1`,
          value: newPosition,
        },
      ]);

      expect(
        store.memory[ExchangeName.BYBIT].private.account1.positions.length,
      ).toBe(2);
      expect(
        store.memory[ExchangeName.BYBIT].private.account1.positions[1].symbol,
      ).toBe("ETHUSDT");
    });

    test("should handle updating a specific array element", () => {
      const store = new MemoryStore();
      const position1: ExchangePosition = {
        symbol: "BTCUSDT",
        side: PositionSide.Long,
        entryPrice: 50000,
        notional: 10000,
        leverage: 10,
        upnl: 0,
        contracts: 0.2,
        liquidationPrice: 45000,
      };

      const position2: ExchangePosition = {
        symbol: "ETHUSDT",
        side: PositionSide.Short,
        entryPrice: 3000,
        notional: 6000,
        leverage: 10,
        upnl: 0,
        contracts: 2,
        liquidationPrice: 3300,
      };

      // Set up account with positions
      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1`,
          value: {
            balance: { used: 0, free: 0, total: 0, upnl: 0 },
            positions: [position1, position2],
            orders: [],
            notifications: [],
          },
        },
      ]);

      // Update upnl for the first position
      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1.positions.0.upnl`,
          value: 500,
        },
      ]);

      expect(
        store.memory[ExchangeName.BYBIT].private.account1.positions[0].upnl,
      ).toBe(500);
      expect(
        store.memory[ExchangeName.BYBIT].private.account1.positions[1].upnl,
      ).toBe(0);
    });

    test("should handle removing an array element", () => {
      const store = new MemoryStore();
      const position1: ExchangePosition = {
        symbol: "BTCUSDT",
        side: PositionSide.Long,
        entryPrice: 50000,
        notional: 10000,
        leverage: 10,
        upnl: 0,
        contracts: 0.2,
        liquidationPrice: 45000,
      };

      const position2: ExchangePosition = {
        symbol: "ETHUSDT",
        side: PositionSide.Short,
        entryPrice: 3000,
        notional: 6000,
        leverage: 10,
        upnl: 0,
        contracts: 2,
        liquidationPrice: 3300,
      };

      // Set up account with positions
      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1`,
          value: {
            balance: { used: 0, free: 0, total: 0, upnl: 0 },
            positions: [position1, position2],
            orders: [],
            notifications: [],
          },
        },
      ]);

      // Remove the first position
      store.applyChanges([
        {
          type: "removeArrayElement",
          path: `${ExchangeName.BYBIT}.private.account1.positions`,
          index: 0,
        },
      ]);

      expect(
        store.memory[ExchangeName.BYBIT].private.account1.positions.length,
      ).toBe(1);
      expect(
        store.memory[ExchangeName.BYBIT].private.account1.positions[0].symbol,
      ).toBe("ETHUSDT");
    });

    test("should handle empty changes array", () => {
      const store = new MemoryStore();
      const initialMemory = JSON.parse(JSON.stringify(store.memory));

      // Apply empty changes
      store.applyChanges([]);

      expect(store.memory).toEqual(initialMemory);
    });

    test("should handle removing multiple array elements", () => {
      const store = new MemoryStore();
      // Set up account with notifications
      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1`,
          value: {
            balance: { used: 0, free: 0, total: 0, upnl: 0 },
            positions: [],
            orders: [],
            notifications: [
              {
                type: "order_fill",
                data: {
                  side: OrderSide.Buy,
                  amount: 1,
                  symbol: "BTCUSDT",
                  price: 50000,
                },
              },
              {
                type: "order_fill",
                data: {
                  side: OrderSide.Sell,
                  amount: 0.5,
                  symbol: "BTCUSDT",
                  price: 51000,
                },
              },
              {
                type: "order_fill",
                data: {
                  side: OrderSide.Buy,
                  amount: 2,
                  symbol: "ETHUSDT",
                  price: 3000,
                },
              },
            ],
          },
        },
      ]);

      // Remove notifications in reverse order to avoid index shifting issues
      store.applyChanges([
        {
          type: "removeArrayElement",
          path: `${ExchangeName.BYBIT}.private.account1.notifications`,
          index: 2,
        },
        {
          type: "removeArrayElement",
          path: `${ExchangeName.BYBIT}.private.account1.notifications`,
          index: 0,
        },
      ]);

      expect(
        store.memory[ExchangeName.BYBIT].private.account1.notifications.length,
      ).toBe(1);
      expect(
        store.memory[ExchangeName.BYBIT].private.account1.notifications[0].data
          .side,
      ).toBe(OrderSide.Sell);
    });

    test("should handle complex mixed changes", () => {
      const store = new MemoryStore();
      const position: ExchangePosition = {
        symbol: "BTCUSDT",
        side: PositionSide.Long,
        entryPrice: 50000,
        notional: 10000,
        leverage: 10,
        upnl: 0,
        contracts: 0.2,
        liquidationPrice: 45000,
      };

      const ticker: ExchangeTicker = {
        id: "BTCUSDT",
        symbol: "BTCUSDT",
        cleanSymbol: "BTC/USDT",
        bid: 49900,
        ask: 50100,
        last: 50000,
        mark: 50000,
        index: 50050,
        percentage: 2.5,
        openInterest: 1000000,
        fundingRate: 0.0001,
        volume: 5000,
        quoteVolume: 250000000,
      };

      // Set up initial state
      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1`,
          value: {
            balance: { used: 1000, free: 9000, total: 10000, upnl: 0 },
            positions: [position],
            orders: [],
            notifications: [],
          },
        },
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.public.tickers.BTCUSDT`,
          value: ticker,
        },
      ]);

      const newTicker: ExchangeTicker = {
        id: "ETHUSDT",
        symbol: "ETHUSDT",
        cleanSymbol: "ETH/USDT",
        bid: 2990,
        ask: 3010,
        last: 3000,
        mark: 2995,
        index: 3001,
        percentage: 1.5,
        openInterest: 500000,
        fundingRate: 0.0002,
        volume: 10000,
        quoteVolume: 30000000,
      };

      // Apply mixed changes in one call
      store.applyChanges([
        // Update existing position
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1.positions.0.upnl`,
          value: 500,
        },
        // Add new ticker
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.public.tickers.ETHUSDT`,
          value: newTicker,
        },
        // Update balance to reflect PnL
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1.balance.upnl`,
          value: 500,
        },
        // Add a notification
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.private.account1.notifications.0`,
          value: {
            type: "order_fill",
            data: {
              side: OrderSide.Buy,
              amount: 0.2,
              symbol: "BTCUSDT",
              price: 50000,
            },
          },
        },
      ]);

      // Verify all changes applied correctly
      expect(
        store.memory[ExchangeName.BYBIT].private.account1.positions[0].upnl,
      ).toBe(500);
      expect(store.memory[ExchangeName.BYBIT].public.tickers.ETHUSDT.last).toBe(
        3000,
      );
      expect(
        store.memory[ExchangeName.BYBIT].private.account1.balance.upnl,
      ).toBe(500);
      expect(
        store.memory[ExchangeName.BYBIT].private.account1.notifications.length,
      ).toBe(1);
    });

    test("should handle creating object path that doesn't exist yet", () => {
      const store = new MemoryStore();

      store.applyChanges([
        {
          type: "update",
          path: `${ExchangeName.BYBIT}.public.markets.BTCUSDT`,
          value: {
            id: "BTCUSDT",
            symbol: "BTCUSDT",
            base: "BTC",
            quote: "USDT",
            active: true,
            precision: { amount: 8, price: 2 },
            limits: {
              amount: { min: 0.001, max: 100, maxMarket: 50 },
              leverage: { min: 1, max: 100 },
            },
          },
        },
      ]);

      expect(
        store.memory[ExchangeName.BYBIT].public.markets.BTCUSDT,
      ).toBeDefined();
      expect(
        store.memory[ExchangeName.BYBIT].public.markets.BTCUSDT.symbol,
      ).toBe("BTCUSDT");
    });
  });
});
