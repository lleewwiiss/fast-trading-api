import { MemoryStore } from "./store.lib";

import type { BaseExchange } from "~/exchanges/base.exchange";
import { createBybitExchange } from "~/exchanges/bybit/bybit.exchange";
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
} from "~/types/lib.types";
import { groupBy } from "~/utils/group-by.utils";

export class FastTradingApi {
  store: Store;
  accounts: Account[];

  exchanges: Partial<Record<ExchangeName, BaseExchange>> = {};
  listeners: { [key: string]: ((...args: any[]) => void)[] } = {};

  constructor({ accounts, store = new MemoryStore() }: FastTradingApiOptions) {
    this.accounts = accounts;
    this.store = store;
  }

  async start() {
    this.emit(
      "log",
      `Starting FastTradingApi SDK with ${this.accounts.length} accounts`,
    );

    this.exchanges = {
      [ExchangeName.BYBIT]: createBybitExchange({ api: this }),
    };

    await Promise.all(
      Object.values(this.exchanges).map((exchange) => exchange.start()),
    );
  }

  async stop() {
    this.emit("log", "Stopping FastTradingApi SDK");

    Object.values(this.exchanges).forEach((exchange) => exchange.stop());
    this.exchanges = {};
    this.listeners = {};
    this.store.reset();
  }

  async addAccounts(accounts: Account[]) {
    const newAccounts = accounts.filter(
      (acc) => !this.accounts.some((a) => a.id === acc.id),
    );

    if (newAccounts.length === 0) return;

    this.emit("log", `Adding ${newAccounts} accounts to FastTradingApi SDK`);

    this.accounts.push(...newAccounts);
    const groupedByExchange = groupBy(newAccounts, (acc) => acc.exchange);

    const promises = Object.entries(groupedByExchange).map(
      async ([exchangeName, exchangeAccounts]) => {
        if (exchangeName === ExchangeName.BYBIT) {
          if (!this.exchanges[ExchangeName.BYBIT]) {
            this.exchanges[ExchangeName.BYBIT] = createBybitExchange({
              api: this,
            });

            await this.exchanges[ExchangeName.BYBIT].start();
          } else {
            await this.exchanges[ExchangeName.BYBIT].addAccounts(
              exchangeAccounts,
            );
          }
        }
      },
    );

    await Promise.all(promises);
  }

  fetchOHLCV({
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

  listenOHLCV({
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

  unlistenOHLCV({
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

  listenOrderBook({
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

  unlistenOrderBook({
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

  placeOrder({
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

  placeOrders({
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

  updateOrder({
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

  updateOrders({
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

  cancelOrder({
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

  cancelOrders({
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

  fetchPositionMetadata({
    accountId,
    symbol,
  }: {
    accountId: string;
    symbol: string;
  }) {
    const account = this.accounts.find((acc) => acc.id === accountId);
    const exchange = account?.exchange;

    if (!exchange || !this.exchanges[exchange]) {
      throw new Error(`No accounts by id found for: ${accountId}`);
    }

    return this.exchanges[exchange].fetchPositionMetadata({
      accountId,
      symbol,
    });
  }

  setLeverage({
    accountId,
    symbol,
    leverage,
  }: {
    accountId: string;
    symbol: string;
    leverage: number;
  }) {
    const account = this.accounts.find((acc) => acc.id === accountId);
    const exchange = account?.exchange;

    if (!exchange || !this.exchanges[exchange]) {
      throw new Error(`No accounts by id found for: ${accountId}`);
    }

    return this.exchanges[exchange].setLeverage({
      accountId,
      symbol,
      leverage,
    });
  }

  on(event: "log" | "error", listener: (message: string) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(listener);
  }

  emit(event: "log" | "error", ...args: any[]) {
    for (const listener of this.listeners[event] || []) {
      listener(...args);
    }
  }
}
