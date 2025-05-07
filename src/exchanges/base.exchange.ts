import type { FastTradingApi } from "~/lib/fast-trading-api.lib";
import type {
  Account,
  Candle,
  ChaseOpts,
  FetchOHLCVParams,
  Order,
  OrderBook,
  PlaceOrderOpts,
  StoreMemory,
  Timeframe,
  TWAPOpts,
} from "~/types/lib.types";
import type { ObjectChangeCommand, ObjectPaths } from "~/types/misc.types";
import { genId } from "~/utils/gen-id.utils";

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
    this.parent.emit("log", `Starting ${this.name} Exchange`);
    return this.dispatchWorker({
      type: "start",
      accounts: this.parent.accounts,
    });
  };

  stop = () => {
    this.worker.removeEventListener("message", this.onWorkerMessage);
    this.worker.postMessage({ type: "stop" });
    this.worker.terminate();
  };

  addAccounts = (accounts: Account[]) => {
    this.parent.emit(
      "log",
      `Adding ${accounts.length} accounts to ${this.name.toUpperCase()} Exchange`,
    );

    return this.dispatchWorker({ type: "addAccounts", accounts });
  };

  removeAccount = (accountId: string) => {
    this.parent.emit(
      "log",
      `Removing account ${accountId} from ${this.name.toUpperCase()} Exchange`,
    );

    return this.dispatchWorker({ type: "removeAccount", accountId });
  };

  fetchOHLCV(params: FetchOHLCVParams) {
    return this.dispatchWorker<Candle[]>({ type: "fetchOHLCV", params });
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
    return this.dispatchWorker<string[]>({
      type: "placeOrders",
      orders,
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
    return this.dispatchWorker({
      type: "updateOrders",
      updates,
      accountId,
      priority,
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
  }) {
    return this.dispatchWorker({
      type: "cancelOrders",
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
  }): Promise<{
    leverage: number;
    isHedged: boolean;
  }> {
    return this.dispatchWorker({
      type: "fetchPositionMetadata",
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
    return this.dispatchWorker<boolean>({
      type: "setLeverage",
      accountId,
      symbol,
      leverage,
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

  startTwap({ accountId, twap }: { accountId: string; twap: TWAPOpts }) {
    return this.dispatchWorker({ type: "startTwap", accountId, twap });
  }

  pauseTwap({ accountId, twapId }: { accountId: string; twapId: string }) {
    return this.dispatchWorker({ type: "pauseTwap", accountId, twapId });
  }

  resumeTwap({ accountId, twapId }: { accountId: string; twapId: string }) {
    return this.dispatchWorker({ type: "resumeTwap", accountId, twapId });
  }

  stopTwap({ accountId, twapId }: { accountId: string; twapId: string }) {
    return this.dispatchWorker({ type: "stopTwap", accountId, twapId });
  }

  startChase({ accountId, chase }: { accountId: string; chase: ChaseOpts }) {
    return this.dispatchWorker({ type: "startChase", accountId, chase });
  }

  stopChase({ accountId, chaseId }: { accountId: string; chaseId: string }) {
    return this.dispatchWorker({ type: "stopChase", accountId, chaseId });
  }

  dispatchWorker<T>(message: Record<string, any>): Promise<T> {
    const requestId = genId();

    return new Promise((resolve) => {
      this.pendingRequests.set(requestId, resolve);
      this.worker.postMessage({ ...message, requestId });
    });
  }

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

  handleResponse = ({ requestId, data }: { requestId: string; data: any }) => {
    const resolver = this.pendingRequests.get(requestId);

    if (resolver) {
      resolver(data);
      this.pendingRequests.delete(requestId);
    }
  };

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
}
