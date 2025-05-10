import { BaseWorker } from "../base.worker";

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
  fetchBybitSymbolPositions,
  setBybitLeverage,
} from "./bybit.resolver";
import type { BybitOrder } from "./bybit.types";
import { formatMarkerOrLimitOrder, mapBybitOrder } from "./bybit.utils";
import { BybitWsTrading } from "./bybit.ws-trading";

import {
  ExchangeName,
  OrderType,
  type Account,
  type PlaceOrderOpts,
  type Timeframe,
  type FetchOHLCVParams,
  type Order,
} from "~/types/lib.types";
import { partition } from "~/utils/partition.utils";
import { subtract } from "~/utils/safe-math.utils";
import { omit } from "~/utils/omit.utils";
import { toUSD } from "~/utils/to-usd.utils";
import { sumBy } from "~/utils/sum-by.utils";
import { genId } from "~/utils/gen-id.utils";

export class BybitWorker extends BaseWorker {
  publicWs: BybitWsPublic | null = null;
  privateWs: Record<Account["id"], BybitWsPrivate> = {};
  tradingWs: Record<Account["id"], BybitWsTrading> = {};

  pollBalanceTimeouts: Record<Account["id"], NodeJS.Timeout> = {};

  async start({
    accounts,
    requestId,
  }: {
    accounts: Account[];
    requestId: string;
  }) {
    await super.start({ accounts, requestId });
    await this.fetchPublic();
    this.emitResponse({ requestId });
  }

  stop() {
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

  async fetchPublic() {
    // 1. Fetch markets and tickers
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

    // 2. Start public websocket
    this.publicWs = new BybitWsPublic({
      parent: this,
      markets: Object.values(markets).map((m) => m.symbol),
    });
  }

  async addAccounts({
    accounts,
    requestId,
  }: {
    accounts: Account[];
    requestId?: string;
  }) {
    super.addAccounts({ accounts, requestId });

    for (const account of accounts) {
      this.tradingWs[account.id] = new BybitWsTrading({
        parent: this,
        account,
      });
    }

    await Promise.all(
      accounts.map(async (account) => {
        await this.fetchAndPollBalance(account);
        this.log(`Loaded Bybit balance for account [${account.id}]`);
      }),
    );

    await Promise.all(
      accounts.map(async (account) => {
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
          {
            type: "update",
            path: `private.${account.id}.metadata.leverage`,
            value: Object.fromEntries(
              positions.map((p) => [p.symbol, p.leverage]),
            ),
          },
          {
            type: "update",
            path: `private.${account.id}.metadata.hedgedPosition`,
            value: Object.fromEntries(
              positions.map((p) => [p.symbol, p.isHedged ?? false]),
            ),
          },
        ]);

        this.log(
          `Loaded ${positions.length} Bybit positions for account [${account.id}]`,
        );
      }),
    );

    for (const account of accounts) {
      this.privateWs[account.id] = new BybitWsPrivate({
        parent: this,
        account,
      });
    }

    for (const account of accounts) {
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

    if (requestId) {
      this.emitResponse({ requestId });
    }
  }

  async removeAccount({
    accountId,
    requestId,
  }: {
    accountId: string;
    requestId: string;
  }) {
    if (accountId in this.privateWs) {
      this.privateWs[accountId].stop();
      delete this.privateWs[accountId];
    }

    if (accountId in this.tradingWs) {
      this.tradingWs[accountId].stop();
      delete this.tradingWs[accountId];
    }

    if (accountId in this.pollBalanceTimeouts) {
      clearTimeout(this.pollBalanceTimeouts[accountId]);
      delete this.pollBalanceTimeouts[accountId];
    }

    await super.removeAccount({ accountId, requestId });
  }

  async fetchAndPollBalance(account: Account) {
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

    this.pollBalanceTimeouts[account.id] = setTimeout(
      () => this.fetchAndPollBalance(account),
      5000,
    );
  }

  updateAccountOrders({
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
              id: genId(),
              accountId,
              type: "order_fill",
              data: {
                id: orders[0].id,
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

  listenOrderBook(symbol: string) {
    this.publicWs?.listenOrderBook(symbol);
  }

  unlistenOrderBook(symbol: string) {
    this.publicWs?.unlistenOrderBook(symbol);
  }

  async fetchOHLCV({
    requestId,
    params,
  }: {
    requestId: string;
    params: FetchOHLCVParams;
  }) {
    const candles = await fetchBybitOHLCV(params);
    this.emitResponse({ requestId, data: candles });
  }

  listenOHLCV({ symbol, timeframe }: { symbol: string; timeframe: Timeframe }) {
    this.publicWs?.listenOHLCV({ symbol, timeframe });
  }

  unlistenOHLCV({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) {
    this.publicWs?.unlistenOHLCV({ symbol, timeframe });
  }

  async placeOrders({
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
            isHedged:
              this.memory.private[accountId].metadata.hedgedPosition[o.symbol],
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
          isHedged:
            this.memory.private[accountId].metadata.hedgedPosition[
              order.symbol
            ],
        });
      }
    }

    this.emitResponse({ requestId, data: orderIds });

    return orderIds;
  }

  async updateOrders({
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

    this.emitResponse({ requestId, data: [] });
  }

  async cancelOrders({
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
    const orders = orderIds.reduce<Order[]>((acc, id) => {
      const order = this.memory.private[accountId].orders.find(
        (o) => o.id === id,
      );

      return order ? [...acc, order] : acc;
    }, []);

    if (orders.length > 0) {
      await this.tradingWs[accountId].cancelOrders({ priority, orders });
    }

    this.emitResponse({ requestId, data: [] });
  }

  async fetchPositionMetadata({
    requestId,
    accountId,
    symbol,
  }: {
    requestId: string;
    accountId: string;
    symbol: string;
  }) {
    const account = this.accounts.find((a) => a.id === accountId);

    if (!account) {
      this.error(`No account found for id: ${accountId}`);
      return;
    }

    const positions = await fetchBybitSymbolPositions({ account, symbol });

    const leverage = positions[0]?.leverage ?? 1;
    const isHedged = positions.some((p) => p.isHedged);

    this.emitChanges([
      {
        type: `update`,
        path: `private.${accountId}.metadata.leverage.${symbol}`,
        value: leverage,
      },
      {
        type: `update`,
        path: `private.${accountId}.metadata.hedgedPosition.${symbol}`,
        value: isHedged,
      },
    ]);

    this.emitResponse({ requestId, data: { leverage, isHedged } });
  }

  async setLeverage({
    requestId,
    accountId,
    symbol,
    leverage,
  }: {
    requestId: string;
    accountId: string;
    symbol: string;
    leverage: number;
  }) {
    const account = this.accounts.find((a) => a.id === accountId);

    if (!account) {
      this.error(`No account found for id: ${accountId}`);
      return;
    }

    const success = await setBybitLeverage({ account, symbol, leverage });

    if (success) {
      this.emitChanges([
        {
          type: `update`,
          path: `private.${accountId}.metadata.leverage.${symbol}`,
          value: leverage,
        },
      ]);
    }

    this.emitResponse({ requestId, data: success });
  }
}

new BybitWorker({ name: ExchangeName.BYBIT, parent: self });
