import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

import { ExchangeName } from "./types/lib.types";

import { FastTradingApi } from "./index";

const moduleMocker = {
  mocks: [] as Record<string, any>[],
  async mock(modulePath: string, renderMocks: () => Record<string, any>) {
    const original = { ...(await import(modulePath)) };
    mock.module(modulePath, () => ({ ...original, ...renderMocks() }));
    this.mocks.push({ clear: () => mock.module(modulePath, () => original) });
  },
  clear() {
    this.mocks.forEach((mockResult) => mockResult.clear());
    this.mocks = [];
  },
};

describe("FastTradingApi", () => {
  let BybitExchangeMock;
  let fetchOHLCVMock;
  let listenOrderBookMock;
  let unlistenOrderBookMock;
  let startMock;

  beforeEach(async () => {
    startMock = mock(() => Promise.resolve());

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
      start: startMock,
      fetchOHLCV: fetchOHLCVMock,
      listenOrderBook: listenOrderBookMock,
      unlistenOrderBook: unlistenOrderBookMock,
    }));

    await moduleMocker.mock("./exchanges/bybit/bybit.exchange", () => ({
      BybitExchange: BybitExchangeMock,
    }));
  });

  afterEach(() => {
    moduleMocker.clear();
  });

  describe("constructor", () => {
    test("should initialize with correct accounts", async () => {
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

      await api.start();

      expect(BybitExchangeMock).toHaveBeenCalledTimes(1);
      expect(api.store).toBeDefined();
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

      await api.start();

      const result = await api.fetchOHLCV({
        exchangeName: ExchangeName.BYBIT,
        params: { symbol: "BTCUSDT", timeframe: "1h", limit: 100 },
      });

      expect(fetchOHLCVMock).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("timestamp", 123456789);
    });
  });

  describe("listenOrderBook", () => {
    test("should call listenOrderBook on exchange", async () => {
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

      await api.start();

      const callback = mock();

      api.listenOrderBook({
        exchangeName: ExchangeName.BYBIT,
        symbol: "BTCUSDT",
        callback,
      });

      expect(listenOrderBookMock).toHaveBeenCalledWith({
        symbol: "BTCUSDT",
        callback,
      });
    });
  });

  describe("unlistenOrderBook", () => {
    test("should call unlistenOrderBook on exchange", async () => {
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

      await api.start();

      api.unlistenOrderBook({
        exchangeName: ExchangeName.BYBIT,
        symbol: "BTCUSDT",
      });

      expect(unlistenOrderBookMock).toHaveBeenCalledWith("BTCUSDT");
    });
  });
});
