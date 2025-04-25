import { BybitWsPublic } from "./bybit.ws-public";
import { BybitWsPrivate } from "./bybit.ws-private";
import {
  fetchBybitOrders,
  fetchBybitBalance,
  fetchBybitMarkets,
  fetchBybitPositions,
  fetchBybitTickers,
  fetchBybitOHLCV,
  createBybitTradingStop,
} from "./bybit.resolver";
import type { BybitOrder, BybitWorkerMessage } from "./bybit.types";
import { formatMarkerOrLimitOrder, mapBybitOrder } from "./bybit.utils";
import { BybitWsTrading } from "./bybit.ws-trading";

import { applyChanges } from "~/utils/update-obj-path.utils";
import {
  ExchangeName,
  OrderType,
  PositionSide,
  type Account,
  type Balance,
  type PlaceOrderOpts,
  type Position,
  type Ticker,
  type Timeframe,
  type StoreMemory,
  type FetchOHLCVParams,
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
import { subtract } from "~/utils/safe-math.utils";
import { omit } from "~/utils/omit.utils";
import { toUSD } from "~/utils/to-usd.utils";
import { sumBy } from "~/utils/sum-by.utils";

export class BybitWorker {
  private accounts: Account[] = [];
  private memory: StoreMemory[ExchangeName] = {
    loaded: { markets: false, tickers: false },
    public: { latency: 0, tickers: {}, markets: {} },
    private: {},
  };

  private publicWs: BybitWsPublic | null = null;
  private privateWs: Record<Account["id"], BybitWsPrivate> = {};
  private tradingWs: Record<Account["id"], BybitWsTrading> = {};

  public onMessage = ({ data }: BybitWorkerMessage) => {
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

    // TODO: move this into an error log
    throw new Error(`Unsupported command to bybit worker`);
  };

  private stop() {
    if (this.publicWs) {
      this.publicWs.stop();
      this.publicWs = null;
    }

    if (Object.keys(this.privateWs).length > 0) {
      Object.values(this.privateWs).forEach((ws) => ws.stop());
      this.privateWs = {};
    }

    if (Object.keys(this.tradingWs).length > 0) {
      Object.values(this.tradingWs).forEach((ws) => ws.stop());
      this.tradingWs = {};
    }
  }

  private async start({
    accounts,
    requestId,
  }: {
    accounts: Account[];
    requestId: string;
  }) {
    this.log(`Bybit Exchange Worker Starting`);
    this.log(`Initializing Bybit exchange data`);

    // 1. Set accounts
    this.accounts = accounts;
    this.emitChanges(
      this.accounts.map((acc) => ({
        type: "update",
        path: `private.${acc.id}`,
        value: {
          balance: { used: 0, free: 0, total: 0, upnl: 0 },
          positions: [],
          orders: [],
          notifications: [],
        },
      })),
    );

    // 2. Start trading websocket
    for (const account of this.accounts) {
      this.tradingWs[account.id] = new BybitWsTrading({
        parent: this,
        account,
      });
    }

    // 3. Fetch markets and tickers
    const [markets, tickers] = await Promise.all([
      fetchBybitMarkets(),
      fetchBybitTickers(),
    ]);

    this.emitChanges([
      { type: "update", path: "loaded.markets", value: true },
      { type: "update", path: "loaded.tickers", value: true },
      { type: "update", path: "public.markets", value: markets },
      {
        type: "update",
        path: "public.tickers",
        value: omit(
          tickers,
          Object.keys(tickers).filter((t) => !markets[t]),
        ),
      },
    ]);

    this.log(`Loaded ${Object.keys(markets).length} Bybit markets`);
    self.postMessage({ type: "response", requestId });

    // 4. Start public websocket
    this.publicWs = new BybitWsPublic({
      parent: this,
      markets: Object.values(markets).map((m) => m.symbol),
    });

    // 5. Fetch and poll balance per account
    await Promise.all(
      this.accounts.map(async (account) => {
        const balance = await fetchBybitBalance({
          key: account.apiKey,
          secret: account.apiSecret,
        });

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.balance`,
            value: balance,
          },
        ]);

        this.log(`Loaded Bybit balance for account [${account.id}]`);
      }),
    );

    // 6. Fetch positions per account
    await Promise.all(
      this.accounts.map(async (account) => {
        const positions = await fetchBybitPositions(account);

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.positions`,
            value: positions,
          },
          {
            type: "update",
            path: `private.${account.id}.balance.upnl`,
            value: toUSD(sumBy(positions, "upnl")),
          },
        ]);

        this.log(
          `Loaded ${positions.length} Bybit positions for account [${account.id}]`,
        );
      }),
    );

    // 7. Start private websocket per account
    for (const account of this.accounts) {
      this.privateWs[account.id] = new BybitWsPrivate({
        parent: this,
        account,
      });
    }

    // 8. Fetch orders per account
    for (const account of this.accounts) {
      const orders = await fetchBybitOrders(account);

      this.emitChanges([
        {
          type: "update",
          path: `private.${account.id}.orders`,
          value: orders,
        },
      ]);

      this.log(
        `Loaded ${orders.length} Bybit orders for account [${account.id}]`,
      );
    }
  }

  public updateAccountBalance({
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

  public removeAccountPositions({
    accountId,
    positions,
  }: {
    accountId: Account["id"];
    positions: { side: PositionSide; symbol: string }[];
  }) {
    const changes = positions.reduce<
      {
        type: "removeArrayElement";
        path: `private.${string}.positions`;
        index: number;
      }[]
    >((acc, p) => {
      const indices = this.memory.private[accountId].positions
        .filter((pos) =>
          pos.isHedged
            ? pos.symbol === p.symbol && pos.side === p.side
            : pos.symbol === p.symbol,
        )
        .map((pos) => this.memory.private[accountId].positions.indexOf(pos));

      if (indices.length > 0) {
        acc.push(
          ...indices.map(
            (posIdx, idx) =>
              ({
                type: "removeArrayElement",
                path: `private.${accountId}.positions`,
                index: posIdx - acc.length - idx,
              }) as const,
          ),
        );
      }

      return acc;
    }, []);

    this.emitChanges(changes);
  }

  public updateAccountPositions({
    accountId,
    positions,
  }: {
    accountId: Account["id"];
    positions: Position[];
  }) {
    const [updatePositions, addPositions] = partition(positions, (position) =>
      this.memory.private[accountId].positions.some((p) =>
        p.isHedged
          ? p.symbol === position.symbol && p.side === position.side
          : p.symbol === position.symbol,
      ),
    );

    const updatePositionsChanges = updatePositions.map((position) => {
      const idx = this.memory.private[accountId].positions.findIndex((p) =>
        position.isHedged
          ? p.symbol === position.symbol && p.side === position.side
          : p.symbol === position.symbol,
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

    this.emitChanges([...updatePositionsChanges, ...addPositionsChanges]);
  }

  public updateTicker(ticker: Ticker) {
    this.emitChanges([
      {
        type: "update",
        path: `public.tickers.${ticker.symbol}`,
        value: ticker,
      },
    ]);
  }

  public updateTickerDelta(ticker: Partial<Ticker> & { symbol: string }) {
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

  public updateAccountOrders({
    accountId,
    bybitOrders,
  }: {
    accountId: Account["id"];
    bybitOrders: BybitOrder[];
  }) {
    for (const bybitOrder of bybitOrders) {
      const orders = mapBybitOrder({ accountId, order: bybitOrder });

      const price = parseFloat(bybitOrder.price);
      const amount = parseFloat(bybitOrder.qty);

      if (bybitOrder.orderStatus === "PartiallyFilled") {
        // False positive when order is replaced
        // it emits a partially filled with 0 amount & price
        if (price <= 0 && amount <= 0) return;
      }

      if (
        bybitOrder.orderStatus === "Filled" ||
        bybitOrder.orderStatus === "PartiallyFilled"
      ) {
        const existingOrder = this.memory.private[accountId].orders.find(
          (o) => o.id === orders[0].id,
        );

        const amount = existingOrder
          ? subtract(parseFloat(bybitOrder.cumExecQty), existingOrder.filled)
          : parseFloat(bybitOrder.cumExecQty);

        this.emitChanges([
          {
            type: "update",
            path: `private.${accountId}.notifications.${this.memory.private[accountId].notifications.length}`,
            value: {
              type: "order_fill",
              data: {
                symbol: orders[0].symbol,
                side: orders[0].side,
                price: orders[0].price || "MARKET",
                amount,
              },
            },
          },
        ]);
      }

      if (
        bybitOrder.orderStatus === "Cancelled" ||
        bybitOrder.orderStatus === "Filled" ||
        bybitOrder.orderStatus === "Deactivated"
      ) {
        const changes = this.memory.private[accountId].orders.reduce<
          {
            type: "removeArrayElement";
            path: `private.${typeof accountId}.orders`;
            index: number;
          }[]
        >((acc, o) => {
          if (
            o.id === orders[0].id ||
            o.id === `${orders[0].id}__stop_loss` ||
            o.id === `${orders[0].id}__take_profit`
          ) {
            acc.push({
              type: "removeArrayElement",
              path: `private.${accountId}.orders`,
              index:
                this.memory.private[accountId].orders.indexOf(o) - acc.length,
            });
          }

          return acc;
        }, []);

        this.emitChanges(changes);
      }

      if (
        bybitOrder.orderStatus === "New" ||
        bybitOrder.orderStatus === "Untriggered" ||
        bybitOrder.orderStatus === "PartiallyFilled"
      ) {
        const [updateOrders, addOrders] = partition(orders, (order) =>
          this.memory.private[accountId].orders.some((o) => o.id === order.id),
        );

        const updateOrdersChanges = updateOrders.map((order) => {
          const idx = this.memory.private[accountId].orders.findIndex(
            (o) => o.id === order.id,
          );

          return {
            type: "update" as const,
            path: `private.${accountId}.orders.${idx}` as const,
            value: order,
          };
        });

        const ordersLength = this.memory.private[accountId].orders.length;
        const addOrdersChanges = addOrders.map((order, idx) => ({
          type: "update" as const,
          path: `private.${accountId}.orders.${ordersLength + idx}` as const,
          value: order,
        }));

        this.emitChanges([...updateOrdersChanges, ...addOrdersChanges]);
      }
    }
  }

  private listenOrderBook(symbol: string) {
    this.publicWs?.listenOrderBook(symbol);
  }

  private unlistenOrderBook(symbol: string) {
    this.publicWs?.unlistenOrderBook(symbol);
  }

  private async fetchOHLCV({
    requestId,
    params,
  }: {
    requestId: string;
    params: FetchOHLCVParams;
  }) {
    const candles = await fetchBybitOHLCV(params);
    self.postMessage({ type: "response", requestId, data: candles });
  }

  private listenOHLCV({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) {
    this.publicWs?.listenOHLCV({ symbol, timeframe });
  }

  private unlistenOHLCV({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) {
    this.publicWs?.unlistenOHLCV({ symbol, timeframe });
  }

  private async placeOrders({
    orders,
    accountId,
    requestId,
    priority = false,
  }: {
    orders: PlaceOrderOpts[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    const orderIds: string[] = [];
    const [normalOrders, conditionalOrders] = partition(
      orders,
      (order) =>
        order.type === OrderType.Market || order.type === OrderType.Limit,
    );

    if (normalOrders.length > 0) {
      const normalOrderIds = await this.tradingWs[accountId].placeOrderBatch({
        priority,
        orders: normalOrders.flatMap((o) =>
          formatMarkerOrLimitOrder({
            order: o,
            market: this.memory.public.markets[o.symbol],
          }),
        ),
      });

      orderIds.push(...normalOrderIds);
    }

    if (conditionalOrders.length > 0) {
      const account = this.accounts.find((a) => a.id === accountId)!;

      for (const order of orders) {
        await createBybitTradingStop({
          order,
          account,
          market: this.memory.public.markets[order.symbol],
          ticker: this.memory.public.tickers[order.symbol],
        });
      }
    }

    self.postMessage({ type: "response", requestId, data: orderIds });
  }

  private async updateOrders({
    updates,
    accountId,
    requestId,
    priority = false,
  }: {
    updates: { order: Order; update: { amount: number } | { price: number } }[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    await this.tradingWs[accountId].updateOrders({
      priority,
      updates: updates.map((update) => ({
        order: update.order,
        update: update.update,
        market: this.memory.public.markets[update.order.symbol],
      })),
    });

    self.postMessage({ type: "response", requestId, data: [] });
  }

  private async cancelOrders({
    orderIds,
    accountId,
    requestId,
    priority = false,
  }: {
    orderIds: string[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    await this.tradingWs[accountId].cancelOrders({
      priority,
      orders: orderIds.reduce((acc, id) => {
        const order = this.memory.private[accountId].orders.find(
          (o) => o.id === id,
        );

        return order ? [...acc, order] : acc;
      }, [] as Order[]),
    });

    self.postMessage({ type: "response", requestId, data: [] });
  }

  public emitChanges = <P extends ObjectPaths<StoreMemory[ExchangeName]>>(
    changes: ObjectChangeCommand<StoreMemory[ExchangeName], P>[],
  ) => {
    self.postMessage({
      type: "update",
      changes: changes.map(({ path, ...rest }) => ({
        ...rest,
        path: `${ExchangeName.BYBIT}.${path}`,
      })),
    });

    applyChanges({ obj: this.memory, changes });
  };

  public emitCandle = (candle: Candle) => {
    self.postMessage({ type: "candle", candle });
  };

  public emitOrderBook = ({
    symbol,
    orderBook,
  }: {
    symbol: string;
    orderBook: OrderBook;
  }) => {
    self.postMessage({ type: "orderBook", symbol, orderBook });
  };

  public log = (message: any) => {
    self.postMessage({ type: "log", message });
  };

  public error = (error: any) => {
    self.postMessage({ type: "error", error });
  };
}

const worker = new BybitWorker();

self.addEventListener("message", worker.onMessage);
