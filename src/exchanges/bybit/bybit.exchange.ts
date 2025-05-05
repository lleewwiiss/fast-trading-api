import type { FastTradingApi } from "~/lib/fast-trading-api.lib";
import type {
  Candle,
  PlaceOrderOpts,
  Timeframe,
  FetchOHLCVParams,
  StoreMemory,
  Order,
  OrderBook,
  Account,
} from "~/types/lib.types";
import type { ObjectChangeCommand, ObjectPaths } from "~/types/misc.types";
import { genId } from "~/utils/gen-id.utils";

export class BybitExchange {
  private parent: FastTradingApi;
  private worker: Worker;

  private pendingRequests = new Map<string, (data: any) => void>();
  private ohlcvListeners = new Map<string, (data: Candle) => void>();
  private orderBookListeners = new Map<string, (data: OrderBook) => void>();

  constructor({ parent }: { parent: FastTradingApi }) {
    this.parent = parent;

    this.worker = new Worker(new URL("./bybit.worker", import.meta.url), {
      type: "module",
    });

    this.worker.addEventListener("message", this.onWorkerMessage);
  }

  public start = () => {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({
        type: "start",
        accounts: this.parent.accounts,
        requestId,
      });

      this.parent.emit("log", "Starting Bybit Exchange");
    });
  };

  public addAccounts = (accounts: Account[]) => {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);

      this.worker.postMessage({
        type: "addAccounts",
        accounts,
        requestId,
      });

      this.parent.emit(
        "log",
        `Adding ${accounts.length} accounts to Bybit Exchange`,
      );
    });
  };

  public stop = () => {
    this.worker.removeEventListener("message", this.onWorkerMessage);
    this.worker.postMessage({ type: "stop" });
    this.worker.terminate();
  };

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
    priority = false,
  }: {
    orders: PlaceOrderOpts[];
    accountId: string;
    priority?: boolean;
  }): Promise<string[]> {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({
        type: "placeOrders",
        orders,
        accountId,
        requestId,
        priority,
      });
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
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({
        type: "updateOrders",
        updates,
        accountId,
        requestId,
        priority,
      });
    });
  }

  public cancelOrders({
    orderIds,
    accountId,
    priority = false,
  }: {
    orderIds: string[];
    accountId: string;
    priority?: boolean;
  }): Promise<void> {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({
        type: "cancelOrders",
        orderIds,
        accountId,
        requestId,
        priority,
      });
    });
  }

  public fetchPositionMetadata({
    accountId,
    symbol,
  }: {
    accountId: string;
    symbol: string;
  }): Promise<{
    leverage: number;
    isHedged: boolean;
  }> {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({
        type: "fetchPositionMetadata",
        requestId,
        accountId,
        symbol,
      });
    });
  }

  public setLeverage({
    accountId,
    symbol,
    leverage,
  }: {
    accountId: string;
    symbol: string;
    leverage: number;
  }): Promise<boolean> {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({
        type: "setLeverage",
        requestId,
        accountId,
        symbol,
        leverage,
      });
    });
  }

  public listenOHLCV({
    symbol,
    timeframe,
    callback,
  }: {
    symbol: string;
    timeframe: Timeframe;
    callback: (candle: Candle) => void;
  }) {
    this.ohlcvListeners.set(`${symbol}:${timeframe}`, callback);
    this.worker.postMessage({ type: "listenOHLCV", symbol, timeframe });
  }

  public unlistenOHLCV({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) {
    this.ohlcvListeners.delete(`${symbol}:${timeframe}`);
    this.worker.postMessage({ type: "unlistenOHLCV", symbol, timeframe });
  }

  public listenOrderBook({
    symbol,
    callback,
  }: {
    symbol: string;
    callback: (orderBook: OrderBook) => void;
  }) {
    this.orderBookListeners.set(symbol, callback);
    this.worker.postMessage({ type: "listenOB", symbol });
  }

  public unlistenOrderBook(symbol: string) {
    this.orderBookListeners.delete(symbol);
    this.worker.postMessage({ type: "unlistenOB", symbol });
  }

  private handleCandle = (candle: Candle) => {
    const name = `${candle.symbol}:${candle.timeframe}`;
    const listener = this.ohlcvListeners.get(name);
    if (listener) listener(candle);
  };

  private handleOrderBook = ({
    symbol,
    orderBook,
  }: {
    symbol: string;
    orderBook: OrderBook;
  }) => {
    const listener = this.orderBookListeners.get(symbol);
    if (listener) listener(orderBook);
  };

  private handleResponse = ({
    requestId,
    data,
  }: {
    requestId: string;
    data: any;
  }) => {
    const resolver = this.pendingRequests.get(requestId);

    if (resolver) {
      resolver(data);
      this.pendingRequests.delete(requestId);
    }
  };

  private onWorkerMessage = <P extends ObjectPaths<StoreMemory>>({
    data,
  }: MessageEvent<
    | { type: "update"; changes: ObjectChangeCommand<StoreMemory, P>[] }
    | { type: "response"; requestId: string; data: any }
    | { type: "log"; message: string }
    | { type: "error"; error: Error }
    | { type: "candle"; candle: Candle }
    | { type: "orderBook"; symbol: string; orderBook: OrderBook }
  >) => {
    if (data.type === "log") return this.parent.emit("log", data.message);
    if (data.type === "error") return this.parent.emit("error", data.error);
    if (data.type === "candle") return this.handleCandle(data.candle);
    if (data.type === "orderBook") return this.handleOrderBook(data);
    if (data.type === "response") return this.handleResponse(data);
    if (data.type === "update") {
      return this.parent.store.applyChanges(data.changes);
    }
  };
}
