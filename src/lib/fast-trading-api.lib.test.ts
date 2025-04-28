import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

import {
  ExchangeName,
  OrderType,
  OrderSide,
  OrderStatus,
} from "../types/lib.types";

import { FastTradingApi } from "./fast-trading-api.lib";

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
  let stopMock;
  let listenOHLCVMock;
  let unlistenOHLCVMock;
  let placeOrdersMock;
  let updateOrdersMock;
  let cancelOrdersMock;

  beforeEach(async () => {
    startMock = mock(() => Promise.resolve());
    stopMock = mock(() => {});

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
    listenOHLCVMock = mock(() => {});
    unlistenOHLCVMock = mock(() => {});
    placeOrdersMock = mock(() => {});
    updateOrdersMock = mock(() => {});
    cancelOrdersMock = mock(() => {});

    BybitExchangeMock = mock(() => ({
      stop: stopMock,
      start: startMock,
      fetchOHLCV: fetchOHLCVMock,
      listenOrderBook: listenOrderBookMock,
      unlistenOrderBook: unlistenOrderBookMock,
      listenOHLCV: listenOHLCVMock,
      unlistenOHLCV: unlistenOHLCVMock,
      placeOrders: placeOrdersMock,
      updateOrders: updateOrdersMock,
      cancelOrders: cancelOrdersMock,
    }));

    await moduleMocker.mock("../exchanges/bybit/bybit.exchange", () => ({
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

  describe("listenOHLCV", () => {
    test("should call listenOHLCV on exchange", async () => {
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
      api.listenOHLCV({
        exchangeName: ExchangeName.BYBIT,
        symbol: "ETHUSDT",
        timeframe: "1h",
        callback,
      });
      expect(listenOHLCVMock).toHaveBeenCalledWith({
        symbol: "ETHUSDT",
        timeframe: "1h",
        callback,
      });
    });
  });

  describe("unlistenOHLCV", () => {
    test("should call unlistenOHLCV on exchange", async () => {
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
      api.unlistenOHLCV({
        exchangeName: ExchangeName.BYBIT,
        symbol: "ETHUSDT",
        timeframe: "1h",
      });
      expect(unlistenOHLCVMock).toHaveBeenCalledWith({
        symbol: "ETHUSDT",
        timeframe: "1h",
      });
    });
  });

  describe("placeOrder", () => {
    test("should call placeOrders with single order", async () => {
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
      const order = {
        symbol: "BTCUSDT",
        type: OrderType.Limit,
        side: OrderSide.Buy,
        amount: 1,
        price: 5000,
      };
      api.placeOrder({ order, accountId: "bybit1" });
      expect(placeOrdersMock).toHaveBeenCalledWith({
        orders: [order],
        accountId: "bybit1",
        priority: false,
      });
    });

    test("should call placeOrders with priority", async () => {
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
      const order = {
        symbol: "BTCUSDT",
        type: OrderType.Limit,
        side: OrderSide.Buy,
        amount: 2,
      };
      api.placeOrder({ order, accountId: "bybit1", priority: true });
      expect(placeOrdersMock).toHaveBeenCalledWith({
        orders: [order],
        accountId: "bybit1",
        priority: true,
      });
    });
  });

  describe("placeOrders", () => {
    test("should call placeOrders with multiple orders", async () => {
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
      const orders = [
        { symbol: "A", type: OrderType.Limit, side: OrderSide.Sell, amount: 3 },
        { symbol: "B", type: OrderType.Market, side: OrderSide.Buy, amount: 4 },
      ];
      api.placeOrders({ orders, accountId: "bybit1", priority: true });
      expect(placeOrdersMock).toHaveBeenCalledWith({
        orders,
        accountId: "bybit1",
        priority: true,
      });
    });
  });

  describe("updateOrder and updateOrders", () => {
    test("should call updateOrders via updateOrder", async () => {
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
      const order = {
        id: "1",
        exchange: ExchangeName.BYBIT,
        accountId: "bybit1",
        status: OrderStatus.Open,
        symbol: "X",
        type: OrderType.Market,
        side: OrderSide.Sell,
        price: 100,
        amount: 5,
        filled: 0,
        remaining: 5,
        reduceOnly: false,
      };
      api.updateOrder({ order, update: { amount: 10 }, accountId: "bybit1" });
      expect(updateOrdersMock).toHaveBeenCalledWith({
        updates: [{ order, update: { amount: 10 } }],
        accountId: "bybit1",
        priority: false,
      });
    });

    test("should call updateOrders", async () => {
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
      const orderA = {
        id: "1",
        exchange: ExchangeName.BYBIT,
        accountId: "bybit1",
        status: OrderStatus.Open,
        symbol: "X",
        type: OrderType.Market,
        side: OrderSide.Sell,
        price: 100,
        amount: 5,
        filled: 0,
        remaining: 5,
        reduceOnly: false,
      };
      const orderB = { ...orderA, id: "2" };
      const updates = [
        { order: orderA, update: { price: 200 } },
        { order: orderB, update: { amount: 6 } },
      ];
      api.updateOrders({ updates, accountId: "bybit1", priority: true });
      expect(updateOrdersMock).toHaveBeenCalledWith({
        updates,
        accountId: "bybit1",
        priority: true,
      });
    });
  });

  describe("cancelOrder and cancelOrders", () => {
    test("should call cancelOrders via cancelOrder", async () => {
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
      api.cancelOrder({ orderId: "oid", accountId: "bybit1" });
      expect(cancelOrdersMock).toHaveBeenCalledWith({
        orderIds: ["oid"],
        accountId: "bybit1",
        priority: false,
      });
    });

    test("should call cancelOrders", async () => {
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
      api.cancelOrders({
        orderIds: ["a", "b"],
        accountId: "bybit1",
        priority: true,
      });
      expect(cancelOrdersMock).toHaveBeenCalledWith({
        orderIds: ["a", "b"],
        accountId: "bybit1",
        priority: true,
      });
    });
  });

  describe("errors when not started or invalid", () => {
    test("should throw for fetchOHLCV when not started", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "key",
            apiSecret: "secret",
          },
        ],
      });
      expect(() =>
        api.fetchOHLCV({
          exchangeName: ExchangeName.BYBIT,
          params: { symbol: "X", timeframe: "1m" },
        }),
      ).toThrowError("Exchange bybit not started");
    });
    test("should throw for placeOrder when not started", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "key",
            apiSecret: "secret",
          },
        ],
      });
      expect(() =>
        api.placeOrder({
          order: {
            symbol: "X",
            type: OrderType.Limit,
            side: OrderSide.Buy,
            amount: 1,
          },
          accountId: "bybit1",
        }),
      ).toThrowError("No accounts by id found for: bybit1");
    });
    test("should throw for listenOHLCV when not started", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "k",
            apiSecret: "s",
          },
        ],
      });
      expect(() =>
        api.listenOHLCV({
          exchangeName: ExchangeName.BYBIT,
          symbol: "SYM",
          timeframe: "1m",
          callback: mock(),
        }),
      ).toThrowError("Exchange bybit not started");
    });
    test("should throw for unlistenOHLCV when not started", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "k",
            apiSecret: "s",
          },
        ],
      });
      expect(() =>
        api.unlistenOHLCV({
          exchangeName: ExchangeName.BYBIT,
          symbol: "SYM",
          timeframe: "1m",
        }),
      ).toThrowError("Exchange bybit not started");
    });
    test("should throw for listenOrderBook when not started", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "k",
            apiSecret: "s",
          },
        ],
      });
      expect(() =>
        api.listenOrderBook({
          exchangeName: ExchangeName.BYBIT,
          symbol: "SYM",
          callback: mock(),
        }),
      ).toThrowError("Exchange bybit not started");
    });
    test("should throw for unlistenOrderBook when not started", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "k",
            apiSecret: "s",
          },
        ],
      });
      expect(() =>
        api.unlistenOrderBook({
          exchangeName: ExchangeName.BYBIT,
          symbol: "SYM",
        }),
      ).toThrowError("Exchange bybit not started");
    });
    test("should throw for updateOrder when not started", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "k",
            apiSecret: "s",
          },
        ],
      });
      const order = {
        id: "1",
        exchange: ExchangeName.BYBIT,
        accountId: "bybit1",
        status: OrderStatus.Open,
        symbol: "X",
        type: OrderType.Market,
        side: OrderSide.Sell,
        price: 100,
        amount: 5,
        filled: 0,
        remaining: 5,
        reduceOnly: false,
      };
      expect(() =>
        api.updateOrder({ order, update: { amount: 10 }, accountId: "bybit1" }),
      ).toThrowError("No accounts by id found for: bybit1");
    });
    test("should throw for updateOrders when not started", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "k",
            apiSecret: "s",
          },
        ],
      });
      const order = {
        id: "1",
        exchange: ExchangeName.BYBIT,
        accountId: "bybit1",
        status: OrderStatus.Open,
        symbol: "X",
        type: OrderType.Market,
        side: OrderSide.Sell,
        price: 100,
        amount: 5,
        filled: 0,
        remaining: 5,
        reduceOnly: false,
      };
      const updates = [{ order, update: { price: 200 } }];
      expect(() =>
        api.updateOrders({ updates, accountId: "bybit1" }),
      ).toThrowError("No accounts by id found for: bybit1");
    });
    test("should throw for cancelOrder when not started", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "k",
            apiSecret: "s",
          },
        ],
      });
      expect(() =>
        api.cancelOrder({ orderId: "oid", accountId: "bybit1" }),
      ).toThrowError("No accounts by id found for: bybit1");
    });
    test("should throw for cancelOrders when not started", () => {
      const api = new FastTradingApi({
        accounts: [
          {
            id: "bybit1",
            exchange: ExchangeName.BYBIT,
            apiKey: "k",
            apiSecret: "s",
          },
        ],
      });
      expect(() =>
        api.cancelOrders({ orderIds: ["a"], accountId: "bybit1" }),
      ).toThrowError("No accounts by id found for: bybit1");
    });
  });

  describe("events emitter", () => {
    test("should register and emit log and error events", async () => {
      const api = new FastTradingApi({ accounts: [] });
      const logCb = mock();
      const errCb = mock();
      api.on("log", logCb);
      api.on("error", errCb);
      api.emit("log", "hello");
      api.emit("error", "oops");
      expect(logCb).toHaveBeenCalledWith("hello");
      expect(errCb).toHaveBeenCalledWith("oops");
    });
  });

  describe("start and stop", () => {
    test("should emit log messages and reset store on start and stop", async () => {
      const storeMock = {
        memory: {} as any,
        reset: mock(),
        applyChanges: mock(),
      };
      const account = {
        id: "bybit1",
        exchange: ExchangeName.BYBIT,
        apiKey: "key1",
        apiSecret: "secret1",
      };
      const api = new FastTradingApi({ accounts: [account], store: storeMock });
      const logCb = mock();
      api.on("log", logCb);
      await api.start();
      expect(logCb).toHaveBeenCalledWith(
        `Starting FastTradingApi SDK with 1 accounts`,
      );
      expect(startMock).toHaveBeenCalledTimes(1);
      await api.stop();
      expect(logCb).toHaveBeenCalledWith("Stopping FastTradingApi SDK");
      expect(stopMock).toHaveBeenCalledTimes(1);
      expect(storeMock.reset).toHaveBeenCalledTimes(1);
    });
  });
});
