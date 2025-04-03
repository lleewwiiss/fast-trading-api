import type {
  ExchangeAccount,
  ExchangeBalance,
  ExchangeMarket,
  ExchangeName,
  ExchangeNotification,
  ExchangeOrder,
  ExchangeOrderBook,
  ExchangePosition,
  ExchangeTicker,
} from "./exchange.types";
import type { ObjectChangeCommand, ObjectPaths } from "./misc.types";

export interface FastTradingApiOptions {
  accounts: ExchangeAccount[];
  store?: Store;
}

export interface Store {
  memory: StoreMemory;
  applyChanges<P extends ObjectPaths<StoreMemory>>(
    changes: ObjectChangeCommand<StoreMemory, P>[],
  ): void;
}

export interface StoreMemory extends Record<ExchangeName, ExchangeMemory> {}

export interface ExchangeMemory {
  private: Record<ExchangeAccount["id"], ExchangeAccountMemory>;
  public: {
    tickers: Record<string, ExchangeTicker>;
    markets: Record<string, ExchangeMarket>;
    orderBooks: Record<string, ExchangeOrderBook>;
  };
}

export interface ExchangeAccountMemory {
  balance: ExchangeBalance;
  positions: ExchangePosition[];
  orders: ExchangeOrder[];
  notifications: ExchangeNotification[];
}
