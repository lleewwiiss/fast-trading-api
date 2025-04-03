import { BybitWsPublic } from "./bybit.ws-public";
import { BybitWsPrivate } from "./bybit.ws-private";
import {
  fetchBybitOrders,
  fetchBybitBalance,
  fetchBybitMarkets,
  fetchBybitPositions,
  fetchBybitTickers,
  fetchBybitOHLCV,
} from "./bybit.resolver";
import type { BybitOrder } from "./bybit.types";
import { mapBybitOrder } from "./bybit.utils";

import { applyChanges } from "~/utils/update-obj-path.utils";
import {
  ExchangeName,
  PositionSide,
  type ExchangeAccount,
  type ExchangeBalance,
  type ExchangePosition,
  type ExchangeTicker,
} from "~/types/exchange.types";
import type { StoreMemory, FetchOHLCVParams } from "~/types/lib.types";
import type {
  Entries,
  ObjectChangeCommand,
  ObjectPaths,
} from "~/types/misc.types";
import { partition } from "~/utils/partition.utils";
import { subtract } from "~/utils/safe-math.utils";

export class BybitWorker {
  private accounts: ExchangeAccount[] = [];
  private memory: StoreMemory[ExchangeName] = {
    public: { tickers: {}, markets: {}, orderBooks: {} },
    private: {},
  };

  private publicWs: BybitWsPublic | null = null;
  private privateWs: BybitWsPrivate[] = [];

  public onMessage = ({
    data,
  }: MessageEvent<
    | { type: "start" }
    | { type: "stop" }
    | { type: "login"; accounts: ExchangeAccount[] }
    | { type: "listenOrderBook"; symbol: string }
    | { type: "unlistenOrderBook"; symbol: string }
    | { type: "fetchOHLCV"; requestId: string; params: FetchOHLCVParams }
  >) => {
    if (data.type === "start") this.start();
    if (data.type === "login") this.login(data.accounts);
    if (data.type === "stop") this.stop();
    if (data.type === "listenOrderBook") this.listenOrderBook(data.symbol);
    if (data.type === "unlistenOrderBook") this.unlistenOrderBook(data.symbol);
    if (data.type === "fetchOHLCV") this.fetchOHLCV(data);
  };

  private login(accounts: ExchangeAccount[]) {
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
  }

  private stop() {
    if (this.publicWs) {
      this.publicWs.stop();
      this.publicWs = null;
    }

    if (this.privateWs.length > 0) {
      this.privateWs.forEach((ws) => ws.stop());
      this.privateWs = [];
    }
  }

  private async start() {
    // 1. Fetch markets and tickers
    const markets = await fetchBybitMarkets();
    const tickers = await fetchBybitTickers(markets);

    this.emitChanges([
      { type: "update", path: "public.markets", value: markets },
      { type: "update", path: "public.tickers", value: tickers },
    ]);

    // 2. Start public websocket
    this.publicWs = new BybitWsPublic({
      parent: this,
      markets: Object.values(markets).map((m) => m.symbol),
    });

    // 3. Fetch and poll balance per account
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
      }),
    );

    // 4. Fetch positions per account
    await Promise.all(
      this.accounts.map(async (account) => {
        const positions = await fetchBybitPositions({
          key: account.apiKey,
          secret: account.apiSecret,
        });

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.positions`,
            value: positions,
          },
          {
            type: "update",
            path: `private.${account.id}.balance.upnl`,
            value: positions.reduce((acc, p) => acc + p.upnl, 0),
          },
        ]);
      }),
    );

    // 5. Start private websocket per account
    for (const account of this.accounts) {
      this.privateWs.push(
        new BybitWsPrivate({
          parent: this,
          account,
        }),
      );
    }

    // 6. Fetch orders per account
    for (const account of this.accounts) {
      const orders = await fetchBybitOrders({
        key: account.apiKey,
        secret: account.apiSecret,
      });

      this.emitChanges([
        {
          type: "update",
          path: `private.${account.id}.orders`,
          value: orders,
        },
      ]);
    }
  }

  public updateAccountBalance({
    accountId,
    balance,
  }: {
    accountId: ExchangeAccount["id"];
    balance: ExchangeBalance;
  }) {
    this.emitChanges([
      {
        type: "update",
        path: `private.${accountId}.balance`,
        value: balance,
      },
    ]);
  }

  public updateAccountPositions({
    accountId,
    positions,
  }: {
    accountId: ExchangeAccount["id"];
    positions: ExchangePosition[];
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

    this.emitChanges([...updatePositionsChanges, ...addPositionsChanges]);
  }

  public updateTicker(ticker: ExchangeTicker) {
    this.emitChanges([
      {
        type: "update",
        path: `public.tickers.${ticker.symbol}`,
        value: ticker,
      },
    ]);
  }

  public updateTickerDelta(
    ticker: Partial<ExchangeTicker> & { symbol: string },
  ) {
    const tickerChanges = (
      Object.entries(ticker) as Entries<ExchangeTicker>
    ).map(([key, value]) => ({
      type: "update" as const,
      path: `public.tickers.${ticker.symbol}.${key}` as const,
      value,
    }));

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
              value: ticker.last! * p.contracts,
            },
            {
              type: "update" as const,
              path: `private.${acc.id}.positions.${idx}.upnl` as const,
              value:
                p.side === PositionSide.Long
                  ? p.contracts * ticker.last! - p.contracts * p.entryPrice
                  : p.contracts * p.entryPrice - p.contracts * ticker.last!,
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
    accountId: ExchangeAccount["id"];
    bybitOrders: BybitOrder[];
  }) {
    for (const bybitOrder of bybitOrders) {
      const orders = mapBybitOrder(bybitOrder);

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
}

const worker = new BybitWorker();

self.addEventListener("message", worker.onMessage);
self.postMessage({ type: "ready" });
