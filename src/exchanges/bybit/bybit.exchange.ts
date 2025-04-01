import type { Store } from "~/store";
import {
  ExchangeName,
  type ExchangeAccount,
  type ExchangeStore,
} from "~/types";

export class BybitExchange {
  private memoryStore: Store;
  private worker: Worker;
  private accounts: ExchangeAccount[];

  constructor({
    memoryStore,
    accounts,
  }: {
    memoryStore: Store;
    accounts: ExchangeAccount[];
  }) {
    this.memoryStore = memoryStore;
    this.accounts = accounts;

    this.worker = new Worker(
      new URL("./worker/bybit.worker.ts", import.meta.url),
      { type: "module" },
    );

    this.worker.addEventListener("message", this.onWorkerMessage);
  }

  public stop() {
    this.worker.postMessage({ type: "stop" });
    this.worker.terminate();
  }

  private onWorkerMessage = (
    event: MessageEvent<
      { type: "ready" } | { type: "update"; data: ExchangeStore }
    >,
  ) => {
    if (event.data.type === "ready") return this.onReady();
    if (event.data.type === "update") return this.onUpdate(event.data.data);
  };

  private onReady() {
    this.worker.postMessage({ type: "login", data: this.accounts });
    this.worker.postMessage({ type: "start" });
  }

  private onUpdate(data: ExchangeStore) {
    this.memoryStore.setStore({
      exchangeName: ExchangeName.BYBIT,
      data,
    });
  }
}
