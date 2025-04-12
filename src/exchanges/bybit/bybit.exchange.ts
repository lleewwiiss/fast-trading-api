import type { FastTradingApi } from "~/index";
import type {
  Candle,
  PlaceOrderOpts,
  Timeframe,
  FetchOHLCVParams,
  StoreMemory,
  Order,
} from "~/types/lib.types";
import type { ObjectChangeCommand, ObjectPaths } from "~/types/misc.types";
import { genId } from "~/utils/gen-id.utils";

export class BybitExchange {
  private parent: FastTradingApi;
  private worker: Worker;

  private pendingRequests = new Map<string, (data: any) => void>();

  constructor({ parent }: { parent: FastTradingApi }) {
    this.parent = parent;

    const module = new URL("./bybit.worker", import.meta.url);
    this.worker = new Worker(module, { type: "module" });
    this.worker.addEventListener("message", this.onWorkerMessage);
  }

  public fetchOHLCV(params: FetchOHLCVParams): Promise<Candle[]> {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({ type: "fetchOHLCV", params, requestId });
    });
  }

  public placeOrders({
    orders,
    accountId,
  }: {
    orders: PlaceOrderOpts[];
    accountId: string;
  }): Promise<string[]> {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({
        type: "placeOrders",
        orders,
        accountId,
        requestId,
      });
    });
  }

  public updateOrders({
    updates,
    accountId,
  }: {
    updates: { order: Order; update: { amount: number } | { price: number } }[];
    accountId: string;
  }) {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({
        type: "updateOrders",
        updates,
        accountId,
        requestId,
      });
    });
  }

  public cancelOrders({
    orderIds,
    accountId,
  }: {
    orderIds: string[];
    accountId: string;
  }): Promise<void> {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({
        type: "cancelOrders",
        orderIds,
        accountId,
        requestId,
      });
    });
  }

  public listenOHLCV({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) {
    this.worker.postMessage({ type: "listenOHLCV", symbol, timeframe });
  }

  public unlistenOHLCV({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) {
    this.worker.postMessage({ type: "unlistenOHLCV", symbol, timeframe });
  }

  public listenOrderBook(symbol: string) {
    this.worker.postMessage({ type: "listenOB", symbol });
  }

  public unlistenOrderBook(symbol: string) {
    this.worker.postMessage({ type: "unlistenOB", symbol });
  }

  private onWorkerMessage = <P extends ObjectPaths<StoreMemory>>(
    event: MessageEvent<
      | { type: "ready" }
      | { type: "update"; changes: ObjectChangeCommand<StoreMemory, P>[] }
      | { type: "response"; requestId: string; data: any }
      | { type: "log"; message: string }
      | { type: "error"; error: Error }
    >,
  ) => {
    if (event.data.type === "log") {
      return this.parent.emit("log", event.data.message);
    }

    if (event.data.type === "error") {
      return this.parent.emit("error", event.data.error);
    }

    if (event.data.type === "ready") {
      return this.onReady();
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
    this.worker.postMessage({ type: "login", accounts: this.parent.accounts });
    this.worker.postMessage({ type: "start" });
    this.parent.emit("log", "Starting Bybit Exchange");
  };
}
