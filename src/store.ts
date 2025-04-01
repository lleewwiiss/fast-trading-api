import {
  ExchangeName,
  type ExchangeAccount,
  type ExchangeStore,
  type ListenerFunction,
} from "~/types";

export class Store {
  private accountsStore: ExchangeAccount[] = [];

  private listeners: Map<symbol, ListenerFunction> = new Map();
  private listenerIds: WeakMap<ListenerFunction, symbol> = new WeakMap();

  private store: Record<ExchangeName, ExchangeStore> = {
    [ExchangeName.BYBIT]: {
      tickers: {},
      markets: {},
      balances: {},
      positions: {},
      orders: {},
    },
  };

  public addStoreUpdateListener(listener: ListenerFunction) {
    if (this.listenerIds.get(listener)) {
      throw new Error("Listener already registered");
    }

    const id = Symbol();
    this.listenerIds.set(listener, id);
    this.listeners.set(id, listener);
  }

  public removeStoreUpdateListener(listener: ListenerFunction) {
    const id = this.listenerIds.get(listener);

    if (id) {
      this.listeners.delete(id);
      this.listenerIds.delete(listener);
    }
  }

  private emitStoreUpdate() {
    this.listeners.forEach((emit) => emit(this.store));
  }

  public addExchangeAccount(account: ExchangeAccount) {
    if (this.accountsStore.find((a) => a.id === account.id)) {
      throw new Error("Account already exists");
    }

    this.accountsStore.push(account);
  }

  public getExchangeAccounts() {
    return this.accountsStore;
  }

  public getExchangeAccount({ id }: { id: string }) {
    const account = this.accountsStore.find((a) => a.id === id);

    if (!account) {
      throw new Error("Account not found");
    }

    return account;
  }

  public setStore({
    exchangeName,
    data,
  }: {
    exchangeName: ExchangeName;
    data: ExchangeStore;
  }) {
    this.store[exchangeName] = data;
    this.emitStoreUpdate();
  }
}
