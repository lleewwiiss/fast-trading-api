import type { ExchangeWorkerMessage } from "./base.types";

import {
  type Account,
  type StoreMemory,
  type ExchangeName,
  type Balance,
  PositionSide,
  type Position,
  type Ticker,
  type FetchOHLCVParams,
  type Timeframe,
  type PlaceOrderOpts,
  type Order,
  type Candle,
  type OrderBook,
} from "~/types/lib.types";
import type {
  Entries,
  ObjectChangeCommand,
  ObjectPaths,
} from "~/types/misc.types";
import { partition } from "~/utils/partition.utils";
import { toUSD } from "~/utils/to-usd.utils";
import { applyChanges } from "~/utils/update-obj-path.utils";

export class BaseWorker {
  parent: typeof self;
  exchangeName: ExchangeName;

  accounts: Account[] = [];
  memory: StoreMemory[ExchangeName] = {
    loaded: { markets: false, tickers: false },
    public: { latency: 0, tickers: {}, markets: {} },
    private: {},
  };

  constructor({
    parent,
    exchangeName,
  }: {
    parent: typeof self;
    exchangeName: ExchangeName;
  }) {
    this.parent = parent;
    this.exchangeName = exchangeName;
    this.parent.addEventListener("message", this.onMessage);
  }

  onMessage = ({ data }: ExchangeWorkerMessage) => {
    if (data.type === "start") return this.start(data);
    if (data.type === "stop") return this.stop();
    if (data.type === "fetchOHLCV") return this.fetchOHLCV(data);
    if (data.type === "listenOHLCV") return this.listenOHLCV(data);
    if (data.type === "unlistenOHLCV") return this.unlistenOHLCV(data);
    if (data.type === "placeOrders") return this.placeOrders(data);
    if (data.type === "updateOrders") return this.updateOrders(data);
    if (data.type === "cancelOrders") return this.cancelOrders(data);
    if (data.type === "listenOB") return this.listenOrderBook(data.symbol);
    if (data.type === "unlistenOB") return this.unlistenOrderBook(data.symbol);
    if (data.type === "addAccounts") return this.addAccounts(data);
    if (data.type === "setLeverage") return this.setLeverage(data);
    if (data.type === "fetchPositionMetadata") {
      return this.fetchPositionMetadata(data);
    }

    // TODO: move this into an error log
    this.error(
      `Unsupported command to ${this.exchangeName.toUpperCase()} worker`,
    );
  };

  stop() {
    this.error(`stop() method not implemented`);
  }

  async start({ accounts }: { accounts: Account[]; requestId: string }) {
    this.log(`${this.exchangeName.toUpperCase()} Exchange starting`);
    this.log(`Initializing ${this.exchangeName.toUpperCase()} exchange data`);

    this.addAccounts({ accounts });
  }

  async addAccounts({ accounts }: { accounts: Account[]; requestId?: string }) {
    this.accounts.push(...accounts);
    this.emitChanges(
      accounts.map((acc) => ({
        type: "update",
        path: `private.${acc.id}`,
        value: {
          balance: { used: 0, free: 0, total: 0, upnl: 0 },
          positions: [],
          orders: [],
          notifications: [],
          metadata: {
            leverage: {},
            hedgedPosition: {},
          },
        },
      })),
    );
  }

  async fetchOHLCV(_params: { requestId: string; params: FetchOHLCVParams }) {
    this.error(`fetchOHLCV() method not implemented`);
  }

  listenOHLCV(_params: { symbol: string; timeframe: Timeframe }) {
    this.error(`listenOHLCV() method not implemented`);
  }

  unlistenOHLCV(_params: { symbol: string; timeframe: Timeframe }) {
    this.error(`unlistenOHLCV() method not implemented`);
  }

  listenOrderBook(_symbol: string) {
    this.error(`listenOrderBook() method not implemented`);
  }

  unlistenOrderBook(_symbol: string) {
    this.error(`unlistenOrderBook() method not implemented`);
  }

  updateAccountBalance({
    accountId,
    balance,
  }: {
    accountId: Account["id"];
    balance: Balance;
  }) {
    this.emitChanges([
      {
        type: "update",
        path: `private.${accountId}.balance`,
        value: balance,
      },
    ]);
  }

  removeAccountPositions({
    accountId,
    positions,
  }: {
    accountId: Account["id"];
    positions: { side: PositionSide; symbol: string }[];
  }) {
    const changes = this.memory.private[accountId].positions.reduce(
      (acc, p, idx) => {
        if (
          positions.some((p2) => p2.symbol === p.symbol && p2.side === p.side)
        ) {
          acc.push({
            type: "removeArrayElement" as const,
            path: `private.${accountId}.positions` as const,
            index: idx - acc.length,
          });
        }
        return acc;
      },
      [] as {
        type: "removeArrayElement";
        path: `private.${string}.positions`;
        index: number;
      }[],
    );

    this.emitChanges(changes);
  }

  updateAccountPositions({
    accountId,
    positions,
  }: {
    accountId: Account["id"];
    positions: Position[];
  }) {
    const [updatePositions, addPositions] = partition(positions, (position) =>
      this.memory.private[accountId].positions.some(
        (p) => p.symbol === position.symbol && p.side === position.side,
      ),
    );

    const updatePositionsChanges = updatePositions.map((position) => {
      const idx = this.memory.private[accountId].positions.findIndex(
        (p) => p.symbol === position.symbol && p.side === position.side,
      );

      return {
        type: "update" as const,
        path: `private.${accountId}.positions.${idx}` as const,
        value: position,
      };
    });

    const positionsLength = this.memory.private[accountId].positions.length;
    const addPositionsChanges = addPositions.map((position, idx) => ({
      type: "update" as const,
      path: `private.${accountId}.positions.${positionsLength + idx}` as const,
      value: position,
    }));

    const metadataChanges = positions.flatMap(
      (p) =>
        [
          {
            type: "update",
            path: `private.${accountId}.metadata.leverage.${p.symbol}`,
            value: p.leverage,
          },
          {
            type: "update",
            path: `private.${accountId}.metadata.hedgedPosition.${p.symbol}`,
            value: p.isHedged ?? false,
          },
        ] as const,
    );

    this.emitChanges([
      ...updatePositionsChanges,
      ...addPositionsChanges,
      ...metadataChanges,
    ]);
  }

  updateTicker(ticker: Ticker) {
    this.emitChanges([
      {
        type: "update",
        path: `public.tickers.${ticker.symbol}`,
        value: ticker,
      },
    ]);
  }

  updateTickerDelta(ticker: Partial<Ticker> & { symbol: string }) {
    const tickerChanges = (Object.entries(ticker) as Entries<Ticker>).map(
      ([key, value]) => ({
        type: "update" as const,
        path: `public.tickers.${ticker.symbol}.${key}` as const,
        value,
      }),
    );

    if (!ticker.last) {
      this.emitChanges(tickerChanges);
      return;
    }

    const positionsChanges = this.accounts.flatMap((acc) => {
      const positions = this.memory.private[acc.id].positions;
      return positions
        .filter((p) => p.symbol === ticker.symbol)
        .flatMap((p) => {
          const idx = positions.indexOf(p);
          return [
            {
              type: "update" as const,
              path: `private.${acc.id}.positions.${idx}.notional` as const,
              value: toUSD(ticker.last! * p.contracts),
            },
            {
              type: "update" as const,
              path: `private.${acc.id}.positions.${idx}.upnl` as const,
              value: toUSD(
                p.side === PositionSide.Long
                  ? p.contracts * ticker.last! - p.contracts * p.entryPrice
                  : p.contracts * p.entryPrice - p.contracts * ticker.last!,
              ),
            },
          ];
        });
    });

    this.emitChanges([...tickerChanges, ...positionsChanges]);
  }

  async placeOrders(_params: {
    orders: PlaceOrderOpts[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    this.error(`placeOrders() method not implemented`);
  }

  async updateOrders(_params: {
    updates: { order: Order; update: { amount: number } | { price: number } }[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    this.error(`updateOrders() method not implemented`);
  }

  async cancelOrders(_params: {
    orderIds: string[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    this.error(`cancelOrders() method not implemented`);
  }

  async fetchPositionMetadata(_params: {
    requestId: string;
    accountId: string;
    symbol: string;
  }) {
    this.error(`fetchPositionMetadata() method not implemented`);
  }

  async setLeverage(_params: {
    requestId: string;
    accountId: string;
    symbol: string;
    leverage: number;
  }) {
    this.error(`setLeverage() method not implemented`);
  }

  emitChanges = <P extends ObjectPaths<StoreMemory[ExchangeName]>>(
    changes: ObjectChangeCommand<StoreMemory[ExchangeName], P>[],
  ) => {
    this.parent.postMessage({
      type: "update",
      changes: changes.map(({ path, ...rest }) => ({
        ...rest,
        path: `${this.exchangeName}.${path}`,
      })),
    });

    applyChanges({ obj: this.memory, changes });
  };

  log = (message: any) => {
    this.parent.postMessage({ type: "log", message });
  };

  error = (error: any) => {
    this.parent.postMessage({ type: "error", error });
  };

  emitCandle = (candle: Candle) => {
    this.parent.postMessage({ type: "candle", candle });
  };

  emitOrderBook = ({
    symbol,
    orderBook,
  }: {
    symbol: string;
    orderBook: OrderBook;
  }) => {
    this.parent.postMessage({ type: "orderBook", symbol, orderBook });
  };
}
