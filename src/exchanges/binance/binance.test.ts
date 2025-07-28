import { describe, test, expect } from "bun:test";

import { BinanceWorker } from "./binance.worker";
import {
  mapBinanceBalance,
  mapBinancePosition,
  mapBinanceOrder,
  formatBinanceOrder,
} from "./binance.utils";
import type {
  BinanceBalance,
  BinancePosition,
  BinanceOrder,
} from "./binance.types";

import {
  OrderSide,
  OrderType,
  PositionSide,
  OrderStatus,
  ExchangeName,
} from "~/types/lib.types";

describe("BinanceWorker", () => {
  test("should initialize without errors", () => {
    const worker = new BinanceWorker();
    expect(worker).toBeDefined();
    expect(worker.name).toBe(ExchangeName.BINANCE);
  });

  test("should handle graceful shutdown", () => {
    const worker = new BinanceWorker();
    expect(() => worker.stop()).not.toThrow();
  });
});

describe("Binance Utils", () => {
  test("mapBinanceBalance should handle empty balance array", () => {
    const balance = mapBinanceBalance([]);
    expect(balance).toEqual({ total: 0, upnl: 0, used: 0, free: 0 });
  });

  test("mapBinanceBalance should map USDT balance correctly", () => {
    const mockBalance: BinanceBalance = {
      accountAlias: "test",
      asset: "USDT",
      balance: "1000.00",
      crossWalletBalance: "1000.00",
      crossUnPnl: "50.00",
      availableBalance: "900.00",
      maxWithdrawAmount: "900.00",
      marginAvailable: true,
      updateTime: Date.now(),
    };

    const balance = mapBinanceBalance([mockBalance]);
    expect(balance.total).toBe(1000);
    expect(balance.upnl).toBe(50);
    expect(balance.free).toBe(900);
    expect(balance.used).toBe(100);
  });

  test("mapBinancePosition should handle zero position", () => {
    const mockPosition: BinancePosition = {
      symbol: "BTCUSDT",
      positionAmt: "0.000",
      entryPrice: "0.00",
      breakEvenPrice: "0.00",
      markPrice: "45000.00",
      unRealizedProfit: "0.00",
      liquidationPrice: "0.00",
      leverage: "10",
      maxNotionalValue: "100000.00",
      marginType: "CROSSED",
      isolatedMargin: "0.00",
      isAutoAddMargin: "false",
      positionSide: "BOTH",
      notional: "0.00",
      isolatedWallet: "0.00",
      updateTime: Date.now(),
      bidNotional: "0.00",
      askNotional: "0.00",
    };

    const position = mapBinancePosition({
      position: mockPosition,
      accountId: "test",
    });
    expect(position).toBeNull();
  });

  test("mapBinancePosition should map long position correctly", () => {
    const mockPosition: BinancePosition = {
      symbol: "BTCUSDT",
      positionAmt: "0.5",
      entryPrice: "45000.00",
      breakEvenPrice: "45000.00",
      markPrice: "46000.00",
      unRealizedProfit: "500.00",
      liquidationPrice: "30000.00",
      leverage: "10",
      maxNotionalValue: "100000.00",
      marginType: "CROSSED",
      isolatedMargin: "0.00",
      isAutoAddMargin: "false",
      positionSide: "BOTH",
      notional: "23000.00",
      isolatedWallet: "0.00",
      updateTime: Date.now(),
      bidNotional: "0.00",
      askNotional: "0.00",
    };

    const position = mapBinancePosition({
      position: mockPosition,
      accountId: "test",
    });
    expect(position).toBeDefined();
    expect(position?.side).toBe(PositionSide.Long);
    expect(position?.contracts).toBe(0.5);
    expect(position?.leverage).toBe(10);
    expect(position?.upnl).toBe(500);
    expect(position?.isHedged).toBe(false);
  });

  test("mapBinanceOrder should map order correctly", () => {
    const mockOrder: BinanceOrder = {
      orderId: 12345,
      symbol: "BTCUSDT",
      status: "NEW",
      clientOrderId: "test_order",
      price: "45000.00",
      avgPrice: "0.00",
      origQty: "0.1",
      executedQty: "0.0",
      cumQty: "0.0",
      cumQuote: "0.0",
      timeInForce: "GTC",
      type: "LIMIT",
      reduceOnly: false,
      closePosition: false,
      side: "BUY",
      positionSide: "BOTH",
      stopPrice: "0.00",
      workingType: "CONTRACT_PRICE",
      priceProtect: false,
      origType: "LIMIT",
      priceMatch: "NONE",
      selfTradePreventionMode: "NONE",
      goodTillDate: 0,
      time: Date.now(),
      updateTime: Date.now(),
    };

    const order = mapBinanceOrder({ order: mockOrder, accountId: "test" });
    expect(order).toBeDefined();
    expect(order.id).toBe("12345");
    expect(order.symbol).toBe("BTCUSDT");
    expect(order.status).toBe(OrderStatus.Open);
    expect(order.type).toBe(OrderType.Limit);
    expect(order.side).toBe(OrderSide.Buy);
    expect(order.price).toBe(45000);
    expect(order.amount).toBe(0.1);
    expect(order.filled).toBe(0);
    expect(order.remaining).toBe(0.1);
  });

  test("formatBinanceOrder should format limit order correctly", () => {
    const mockMarket = {
      id: "BTCUSDT",
      exchange: ExchangeName.BINANCE,
      symbol: "BTCUSDT",
      base: "BTC",
      quote: "USDT",
      active: true,
      precision: {
        amount: 0.001,
        price: 0.01,
      },
      limits: {
        amount: {
          min: 0.001,
          max: 1000,
          maxMarket: 100,
        },
        leverage: {
          min: 1,
          max: 125,
        },
      },
    };

    const order = {
      symbol: "BTCUSDT",
      type: OrderType.Limit,
      side: OrderSide.Buy,
      amount: 0.1,
      price: 45000.5,
      reduceOnly: false,
    };

    const formatted = formatBinanceOrder({
      order,
      market: mockMarket,
      isHedged: false,
    });
    expect(formatted).toHaveLength(1);
    expect(formatted[0]).toMatchObject({
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT",
      quantity: "0.1",
      price: "45000.5",
      positionSide: "BOTH",
      reduceOnly: false,
    });
  });

  test("formatBinanceOrder should handle hedged position correctly", () => {
    const mockMarket = {
      id: "BTCUSDT",
      exchange: ExchangeName.BINANCE,
      symbol: "BTCUSDT",
      base: "BTC",
      quote: "USDT",
      active: true,
      precision: {
        amount: 0.001,
        price: 0.01,
      },
      limits: {
        amount: {
          min: 0.001,
          max: 1000,
          maxMarket: 100,
        },
        leverage: {
          min: 1,
          max: 125,
        },
      },
    };

    const order = {
      symbol: "BTCUSDT",
      type: OrderType.Limit,
      side: OrderSide.Buy,
      amount: 0.1,
      price: 45000,
      reduceOnly: false,
    };

    const formatted = formatBinanceOrder({
      order,
      market: mockMarket,
      isHedged: true,
    });
    expect(formatted).toHaveLength(1);
    expect(formatted[0].positionSide).toBe("LONG");
  });

  test("formatBinanceOrder should handle reduce-only orders correctly", () => {
    const mockMarket = {
      id: "BTCUSDT",
      exchange: ExchangeName.BINANCE,
      symbol: "BTCUSDT",
      base: "BTC",
      quote: "USDT",
      active: true,
      precision: {
        amount: 0.001,
        price: 0.01,
      },
      limits: {
        amount: {
          min: 0.001,
          max: 1000,
          maxMarket: 100,
        },
        leverage: {
          min: 1,
          max: 125,
        },
      },
    };

    const order = {
      symbol: "BTCUSDT",
      type: OrderType.Limit,
      side: OrderSide.Sell,
      amount: 0.1,
      price: 45000,
      reduceOnly: true,
    };

    const formatted = formatBinanceOrder({
      order,
      market: mockMarket,
      isHedged: true,
    });
    expect(formatted).toHaveLength(1);
    expect(formatted[0].positionSide).toBe("LONG");
    expect(formatted[0].reduceOnly).toBe(true);
  });
});
