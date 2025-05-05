import type { FastTradingApi } from "~/lib/fast-trading-api.lib";
import type {
  Account,
  Candle,
  FetchOHLCVParams,
  Order,
  OrderBook,
  PlaceOrderOpts,
  StoreMemory,
  Timeframe,
} from "~/types/lib.types";
import type { ObjectChangeCommand, ObjectPaths } from "~/types/misc.types";
import { genId } from "~/utils";

export class BaseExchange {
  name: string;

  parent: FastTradingApi;
  worker: Worker;

  pendingRequests = new Map<string, (data: any) => void>();
  ohlcvListeners = new Map<string, (data: Candle) => void>();
  orderBookListeners = new Map<string, (data: OrderBook) => void>();

  constructor({
    name,
    parent,
    createWorker,
  }: {
    name: string;
    parent: FastTradingApi;
    createWorker: () => Worker;
  }) {
    this.name = name;
    this.parent = parent;
    this.worker = createWorker();
    this.worker.addEventListener("message", this.onWorkerMessage);
  }

  start = () => {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({
        type: "start",
        accounts: this.parent.accounts,
        requestId,
      });

      this.parent.emit("log", `Starting ${this.name} Exchange`);
    });
  };

  stop = () => {
    this.worker.removeEventListener("message", this.onWorkerMessage);
    this.worker.postMessage({ type: "stop" });
    this.worker.terminate();
  };

  addAccounts = (accounts: Account[]) => {
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

  fetchOHLCV(params: FetchOHLCVParams): Promise<Candle[]> {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({ type: "fetchOHLCV", params, requestId });
    });
  }

  placeOrders({
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

  updateOrders({
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

  cancelOrders({
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

  fetchPositionMetadata({
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

  setLeverage({
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

  listenOHLCV({
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

  unlistenOHLCV({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) {
    this.ohlcvListeners.delete(`${symbol}:${timeframe}`);
    this.worker.postMessage({ type: "unlistenOHLCV", symbol, timeframe });
  }

  listenOrderBook({
    symbol,
    callback,
  }: {
    symbol: string;
    callback: (orderBook: OrderBook) => void;
  }) {
    this.orderBookListeners.set(symbol, callback);
    this.worker.postMessage({ type: "listenOB", symbol });
  }

  unlistenOrderBook(symbol: string) {
    this.orderBookListeners.delete(symbol);
    this.worker.postMessage({ type: "unlistenOB", symbol });
  }

  handleCandle = (candle: Candle) => {
    const name = `${candle.symbol}:${candle.timeframe}`;
    const listener = this.ohlcvListeners.get(name);
    if (listener) listener(candle);
  };

  handleOrderBook = ({
    symbol,
    orderBook,
  }: {
    symbol: string;
    orderBook: OrderBook;
  }) => {
    const listener = this.orderBookListeners.get(symbol);
    if (listener) listener(orderBook);
  };

  handleResponse = ({ requestId, data }: { requestId: string; data: any }) => {
    const resolver = this.pendingRequests.get(requestId);

    if (resolver) {
      resolver(data);
      this.pendingRequests.delete(requestId);
    }
  };

  onWorkerMessage = <P extends ObjectPaths<StoreMemory>>({
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
