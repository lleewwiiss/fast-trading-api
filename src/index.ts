import {
  type FastTradingApiOptions,
  type FetchOHLCVParams,
  type Store,
  ExchangeName,
  type Account,
  type Candle,
  type PlaceOrderOpts,
  type Timeframe,
  type Order,
  type OrderBook,
} from "./types/lib.types";
import { BybitExchange } from "./exchanges/bybit/bybit.exchange";
import { MemoryStore } from "./store";

export class FastTradingApi {
  public store: Store;
  public accounts: Account[];

  private exchanges: { [ExchangeName.BYBIT]?: BybitExchange } = {};
  private listeners: { [key: string]: ((...args: any[]) => void)[] } = {};

  constructor({ accounts, store = new MemoryStore() }: FastTradingApiOptions) {
    this.accounts = accounts;
    this.store = store;
  }

  public async start() {
    this.emit(
      "log",
      `Starting FastTradingApi SDK with ${this.accounts.length} accounts`,
    );

    this.exchanges = {
      [ExchangeName.BYBIT]: new BybitExchange({ parent: this }),
    };

    await Promise.all(
      Object.values(this.exchanges).map((exchange) => exchange.start()),
    );
  }

  public async stop() {
    this.emit("log", "Stopping FastTradingApi SDK");

    Object.values(this.exchanges).forEach((exchange) => exchange.stop());
    this.exchanges = {};
    this.listeners = {};
    this.store.reset();
  }

  public fetchOHLCV({
    exchangeName,
    params,
  }: {
    exchangeName: ExchangeName;
    params: FetchOHLCVParams;
  }): Promise<Candle[]> {
    if (!this.exchanges[exchangeName]) {
      throw new Error(`Exchange ${exchangeName} not started`);
    }

    return this.exchanges[exchangeName].fetchOHLCV(params);
  }

  public listenOHLCV({
    exchangeName,
    symbol,
    timeframe,
    callback,
  }: {
    exchangeName: ExchangeName;
    symbol: string;
    timeframe: Timeframe;
    callback: (candle: Candle) => void;
  }) {
    if (!this.exchanges[exchangeName]) {
      throw new Error(`Exchange ${exchangeName} not started`);
    }

    this.exchanges[exchangeName].listenOHLCV({ symbol, timeframe, callback });
  }

  public unlistenOHLCV({
    exchangeName,
    symbol,
    timeframe,
  }: {
    exchangeName: ExchangeName;
    symbol: string;
    timeframe: Timeframe;
  }) {
    if (!this.exchanges[exchangeName]) {
      throw new Error(`Exchange ${exchangeName} not started`);
    }

    this.exchanges[exchangeName].unlistenOHLCV({ symbol, timeframe });
  }

  public listenOrderBook({
    exchangeName,
    symbol,
    callback,
  }: {
    exchangeName: ExchangeName;
    symbol: string;
    callback: (orderBook: OrderBook) => void;
  }) {
    if (!this.exchanges[exchangeName]) {
      throw new Error(`Exchange ${exchangeName} not started`);
    }

    this.exchanges[exchangeName].listenOrderBook({ symbol, callback });
  }

  public unlistenOrderBook({
    exchangeName,
    symbol,
  }: {
    exchangeName: ExchangeName;
    symbol: string;
  }) {
    if (!this.exchanges[exchangeName]) {
      throw new Error(`Exchange ${exchangeName} not started`);
    }

    this.exchanges[exchangeName].unlistenOrderBook(symbol);
  }

  public placeOrder({
    order,
    accountId,
    priority = false,
  }: {
    order: PlaceOrderOpts;
    accountId: string;
    priority?: boolean;
  }) {
    return this.placeOrders({ orders: [order], accountId, priority });
  }

  public placeOrders({
    orders,
    accountId,
    priority = false,
  }: {
    orders: PlaceOrderOpts[];
    accountId: string;
    priority?: boolean;
  }) {
    const account = this.accounts.find((acc) => acc.id === accountId);
    const exchange = account?.exchange;

    if (!exchange || !this.exchanges[exchange]) {
      throw new Error(`No accounts by id found for: ${accountId}`);
    }

    return this.exchanges[exchange].placeOrders({
      orders,
      accountId,
      priority,
    });
  }

  public updateOrder({
    order,
    update,
    accountId,
    priority = false,
  }: {
    order: Order;
    update: { amount: number } | { price: number };
    accountId: string;
    priority?: boolean;
  }) {
    return this.updateOrders({
      updates: [{ order, update }],
      accountId,
      priority,
    });
  }

  public updateOrders({
    updates,
    accountId,
    priority = false,
  }: {
    updates: { order: Order; update: { amount: number } | { price: number } }[];
    accountId: string;
    priority?: boolean;
  }) {
    const account = this.accounts.find((acc) => acc.id === accountId);
    const exchange = account?.exchange;

    if (!exchange || !this.exchanges[exchange]) {
      throw new Error(`No accounts by id found for: ${accountId}`);
    }

    return this.exchanges[exchange].updateOrders({
      updates,
      accountId,
      priority,
    });
  }

  public cancelOrder({
    orderId,
    accountId,
    priority = false,
  }: {
    orderId: string;
    accountId: string;
    priority?: boolean;
  }) {
    return this.cancelOrders({ orderIds: [orderId], accountId, priority });
  }

  public cancelOrders({
    orderIds,
    accountId,
    priority = false,
  }: {
    orderIds: string[];
    accountId: string;
    priority?: boolean;
  }) {
    const account = this.accounts.find((acc) => acc.id === accountId);
    const exchange = account?.exchange;

    if (!exchange || !this.exchanges[exchange]) {
      throw new Error(`No accounts by id found for: ${accountId}`);
    }

    return this.exchanges[exchange].cancelOrders({
      orderIds,
      accountId,
      priority,
    });
  }

  public on(event: "log" | "error", listener: (message: string) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }

  public emit(event: "log" | "error", ...args: any[]) {
    for (const listener of this.listeners[event] || []) {
      listener(...args);
    }
  }
}
