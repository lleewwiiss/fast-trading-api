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
  type TWAPOpts,
  type ChaseOpts,
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
    return this.getExchange(exchangeName).fetchOHLCV(params);
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
    this.getExchange(exchangeName).listenOHLCV({ symbol, timeframe, callback });
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
    this.getExchange(exchangeName).unlistenOHLCV({ symbol, timeframe });
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
    this.getExchange(exchangeName).listenOrderBook({ symbol, callback });
  }

  unlistenOrderBook({
    exchangeName,
    symbol,
  }: {
    exchangeName: ExchangeName;
    symbol: string;
  }) {
    this.getExchange(exchangeName).unlistenOrderBook(symbol);
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
    return this.getAccountExchange(accountId).placeOrders({
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
    return this.getAccountExchange(accountId).updateOrders({
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
    return this.getAccountExchange(accountId).cancelOrders({
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
    return this.getAccountExchange(accountId).fetchPositionMetadata({
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
    return this.getAccountExchange(accountId).setLeverage({
      accountId,
      symbol,
      leverage,
    });
  }

  startTwap({ accountId, twap }: { accountId: string; twap: TWAPOpts }) {
    return this.getAccountExchange(accountId).startTwap({
      accountId,
      twap,
    });
  }

  pauseTwap({ accountId, twapId }: { accountId: string; twapId: string }) {
    return this.getAccountExchange(accountId).pauseTwap({
      accountId,
      twapId,
    });
  }

  resumeTwap({ accountId, twapId }: { accountId: string; twapId: string }) {
    return this.getAccountExchange(accountId).resumeTwap({
      accountId,
      twapId,
    });
  }

  stopTwap({ accountId, twapId }: { accountId: string; twapId: string }) {
    return this.getAccountExchange(accountId).stopTwap({
      accountId,
      twapId,
    });
  }

  startChase({ accountId, chase }: { accountId: string; chase: ChaseOpts }) {
    return this.getAccountExchange(accountId).startChase({
      accountId,
      chase,
    });
  }

  stopChase({ accountId, chaseId }: { accountId: string; chaseId: string }) {
    return this.getAccountExchange(accountId).stopChase({
      accountId,
      chaseId,
    });
  }

  getExchange(exchangeName: ExchangeName) {
    if (!this.exchanges[exchangeName]) {
      throw new Error(`Exchange ${exchangeName} not started`);
    }

    return this.exchanges[exchangeName];
  }

  getAccountExchange(accountId: string) {
    const account = this.accounts.find((acc) => acc.id === accountId);

    if (!account) {
      throw new Error(`No accounts by id found for: ${accountId}`);
    }

    return this.getExchange(account.exchange);
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
