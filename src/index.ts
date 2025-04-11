import type {
  FastTradingApiOptions,
  FetchOHLCVParams,
  Store,
} from "./types/lib.types";
import { BybitExchange } from "./exchanges/bybit/bybit.exchange";
import { MemoryStore } from "./store";
import {
  ExchangeName,
  type ExchangeAccount,
  type ExchangeCandle,
  type ExchangePlaceOrderOpts,
  type ExchangeTimeframe,
} from "./types/exchange.types";

export class FastTradingApi {
  private store: Store;
  private accounts: ExchangeAccount[];
  private exchanges: { [ExchangeName.BYBIT]?: BybitExchange } = {};

  get memory() {
    return this.store.memory;
  }

  constructor({ accounts, store = new MemoryStore() }: FastTradingApiOptions) {
    this.accounts = accounts;
    this.store = store;

    const bybitAccounts = this.accounts.filter(
      (a) => a.exchange === ExchangeName.BYBIT,
    );

    if (bybitAccounts.length) {
      this.exchanges[ExchangeName.BYBIT] = new BybitExchange({
        store: this.store,
        accounts: bybitAccounts,
      });
    }
  }

  public fetchOHLCV({
    exchangeName,
    params,
  }: {
    exchangeName: ExchangeName;
    params: FetchOHLCVParams;
  }): Promise<ExchangeCandle[]> {
    if (!this.exchanges[exchangeName]) {
      throw new Error(`Exchange ${exchangeName} not started`);
    }

    return this.exchanges[exchangeName].fetchOHLCV(params);
  }

  public listenOHLCV({
    exchangeName,
    symbol,
    timeframe,
  }: {
    exchangeName: ExchangeName;
    symbol: string;
    timeframe: ExchangeTimeframe;
  }) {
    if (!this.exchanges[exchangeName]) {
      throw new Error(`Exchange ${exchangeName} not started`);
    }

    this.exchanges[exchangeName].listenOHLCV({ symbol, timeframe });
  }

  public unlistenOHLCV({
    exchangeName,
    symbol,
    timeframe,
  }: {
    exchangeName: ExchangeName;
    symbol: string;
    timeframe: ExchangeTimeframe;
  }) {
    if (!this.exchanges[exchangeName]) {
      throw new Error(`Exchange ${exchangeName} not started`);
    }

    this.exchanges[exchangeName].unlistenOHLCV({ symbol, timeframe });
  }

  public listenOrderBook({
    exchangeName,
    symbol,
  }: {
    exchangeName: ExchangeName;
    symbol: string;
  }) {
    if (!this.exchanges[exchangeName]) {
      throw new Error(`Exchange ${exchangeName} not started`);
    }

    this.exchanges[exchangeName].listenOrderBook(symbol);
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
  }: {
    order: ExchangePlaceOrderOpts;
    accountId: string;
  }) {
    return this.placeOrders({ orders: [order], accountId });
  }

  public placeOrders({
    orders,
    accountId,
  }: {
    orders: ExchangePlaceOrderOpts[];
    accountId: string;
  }) {
    const account = this.accounts.find((acc) => acc.id === accountId);
    const exchange = account?.exchange;

    if (!exchange || !this.exchanges[exchange]) {
      throw new Error(`No accounts by id found for: ${accountId}`);
    }

    return this.exchanges[exchange].placeOrders({ orders, accountId });
  }
}
