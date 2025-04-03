import { describe, test, expect, mock, beforeEach } from "bun:test";

import { ExchangeName } from "./types/exchange.types";

import { FastTradingApi } from "./index";

describe("FastTradingApi", () => {
  let BybitExchangeMock;
  let fetchOHLCVMock;
  let listenOrderBookMock;
  let unlistenOrderBookMock;

  beforeEach(() => {
    fetchOHLCVMock = mock(() =>
      Promise.resolve([
        {
          timestamp: 123456789,
          open: 1,
          high: 2,
          low: 0.5,
          close: 1.5,
          volume: 100,
        },
      ]),
    );

    listenOrderBookMock = mock(() => {});
    unlistenOrderBookMock = mock(() => {});

    BybitExchangeMock = mock(() => ({
      fetchOHLCV: fetchOHLCVMock,
      listenOrderBook: listenOrderBookMock,
      unlistenOrderBook: unlistenOrderBookMock,
    }));

    mock.module("./exchanges/bybit/bybit.exchange", () => ({
      BybitExchange: BybitExchangeMock,
    }));
  });

  describe("constructor", () => {
    test("should initialize with correct accounts", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "key1",
            apiSecret: "secret1",
          },
        ],
      });

      expect(BybitExchangeMock).toHaveBeenCalledTimes(1);
      expect(api.memory).toBeDefined();
    });

    test("should not initialize exchange if no matching accounts", () => {
      // Create API instance without using the variable
      new FastTradingApi({
        accounts: [],
      });

      expect(BybitExchangeMock).not.toHaveBeenCalled();
    });
  });

  describe("fetchOHLCV", () => {
    test("should fetch OHLCV data", async () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "key1",
            apiSecret: "secret1",
          },
        ],
      });

      const result = await api.fetchOHLCV({
        exchangeName: ExchangeName.BYBIT,
        params: { symbol: "BTCUSDT", interval: "1h", limit: 100 },
      });

      expect(fetchOHLCVMock).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("timestamp", 123456789);
    });

    test("should throw error if exchange not initialized", async () => {
      const api = new FastTradingApi({
        accounts: [],
      });

      await expect(() =>
        api.fetchOHLCV({
          exchangeName: ExchangeName.BYBIT,
          params: { symbol: "BTCUSDT", interval: "1h", limit: 100 },
        }),
      ).toThrow(`Exchange ${ExchangeName.BYBIT} not started`);
    });
  });

  describe("listenOrderBook", () => {
    test("should call listenOrderBook on exchange", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "key1",
            apiSecret: "secret1",
          },
        ],
      });

      api.listenOrderBook({
        exchangeName: ExchangeName.BYBIT,
        symbol: "BTCUSDT",
      });

      expect(listenOrderBookMock).toHaveBeenCalledWith("BTCUSDT");
    });

    test("should throw error if exchange not initialized", () => {
      const api = new FastTradingApi({
        accounts: [],
      });

      expect(() =>
        api.listenOrderBook({
          exchangeName: ExchangeName.BYBIT,
          symbol: "BTCUSDT",
        }),
      ).toThrow(`Exchange ${ExchangeName.BYBIT} not started`);
    });
  });

  describe("unlistenOrderBook", () => {
    test("should call unlistenOrderBook on exchange", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "key1",
            apiSecret: "secret1",
          },
        ],
      });

      api.unlistenOrderBook({
        exchangeName: ExchangeName.BYBIT,
        symbol: "BTCUSDT",
      });

      expect(unlistenOrderBookMock).toHaveBeenCalledWith("BTCUSDT");
    });

    test("should throw error if exchange not initialized", () => {
      const api = new FastTradingApi({
        accounts: [],
      });

      expect(() =>
        api.unlistenOrderBook({
          exchangeName: ExchangeName.BYBIT,
          symbol: "BTCUSDT",
        }),
      ).toThrow(`Exchange ${ExchangeName.BYBIT} not started`);
    });
  });
});
