import { BybitExchange } from "./exchanges/bybit/bybit.exchange";
import { Store } from "./store";
import {
  ExchangeName,
  type ExchangeAccount,
  type ListenerFunction,
} from "./types";

export class FastTradingApi {
  private started = false;

  private store: Store;
  private exchanges: Record<string, BybitExchange> = {};

  constructor() {
    this.store = new Store();
  }

  public registerExchangeAccount(account: ExchangeAccount) {
    if (this.started) throw new Error("Cannot register account after start");
    this.store.addExchangeAccount(account);
  }

  public addStoreUpdateListener(listener: ListenerFunction) {
    this.store.addStoreUpdateListener(listener);
  }

  public removeStoreUpdateListener(listener: ListenerFunction) {
    this.store.removeStoreUpdateListener(listener);
  }

  public start() {
    if (this.started) throw new Error("Already started");
    this.started = true;

    const accounts = this.store.getExchangeAccounts();

    if (!accounts.length) {
      throw new Error(
        "No exchange account found, please add one first using `addAccount`",
      );
    }

    const bybitAccounts = accounts.filter(
      (a) => a.exchange === ExchangeName.BYBIT,
    );

    if (bybitAccounts.length) {
      this.exchanges[ExchangeName.BYBIT] = new BybitExchange({
        memoryStore: this.store,
        accounts: bybitAccounts,
      });
    }
  }

  public stop() {
    if (!this.started) throw new Error("Not started");
    this.started = false;

    for (const [name, exchange] of Object.entries(this.exchanges)) {
      exchange.stop();
      delete this.exchanges[name];
    }
  }
}
