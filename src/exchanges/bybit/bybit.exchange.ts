import type { ExchangeAccount, ExchangeCandle } from "~/types/exchange.types";
import type { FetchOHLCVParams, Store, StoreMemory } from "~/types/lib.types";
import type { ObjectChangeCommand, ObjectPaths } from "~/types/misc.types";
import { genId } from "~/utils/gen-id.utils";

export class BybitExchange {
  private store: Store;
  private accounts: ExchangeAccount[];
  private worker: Worker;

  private pendingRequests = new Map<
    string,
    (value: ExchangeCandle[]) => void
  >();

  constructor({
    store,
    accounts,
  }: {
    store: Store;
    accounts: ExchangeAccount[];
  }) {
    this.store = store;
    this.accounts = accounts;

    this.worker = new Worker(new URL("./bybit.worker", import.meta.url), {
      type: "module",
    });

    this.worker.addEventListener("message", this.onWorkerMessage);
  }

  public fetchOHLCV(params: FetchOHLCVParams): Promise<ExchangeCandle[]> {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({ type: "fetchOHLCV", params, requestId });
    });
  }

  public listenOrderBook(symbol: string) {
    this.worker.postMessage({ type: "listenOrderBook", symbol });
  }

  public unlistenOrderBook(symbol: string) {
    this.worker.postMessage({ type: "unlistenOrderBook", symbol });
  }

  private onWorkerMessage = <P extends ObjectPaths<StoreMemory>>(
    event: MessageEvent<
      | { type: "ready" }
      | { type: "update"; changes: ObjectChangeCommand<StoreMemory, P>[] }
      | { type: "response"; requestId: string; data: ExchangeCandle[] }
    >,
  ) => {
    if (event.data.type === "ready") return this.onReady();
    if (event.data.type === "update") {
      return this.store.applyChanges(event.data.changes);
    }

    if (event.data.type === "response") {
      const resolver = this.pendingRequests.get(event.data.requestId);

      if (resolver) {
        resolver(event.data.data);
        this.pendingRequests.delete(event.data.requestId);
      }
    }
  };

  private onReady = () => {
    this.worker.postMessage({ type: "login", accounts: this.accounts });
    this.worker.postMessage({ type: "start" });
  };
}
