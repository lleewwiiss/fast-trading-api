import { BaseWorker } from "../base.worker";

import {
  fetchHLMarketsAndTickers,
  fetchHLOHLCV,
  fetchHLUserAccount,
  fetchHLUserOrders,
} from "./hl.resolver";
import type { HLOrderUpdateWs } from "./hl.types";
import { HyperLiquidWsPublic } from "./hl.ws-public";
import { mapHlOrder } from "./hl.utils";
import { HyperLiquidWsPrivate } from "./hl.ws-private";

import { DEFAULT_CONFIG } from "~/config";
import {
  ExchangeName,
  type Account,
  type ExchangeConfig,
  type FetchOHLCVParams,
  type PlaceOrderOpts,
  type Timeframe,
} from "~/types/lib.types";

export class HyperLiquidWorker extends BaseWorker {
  publicWs: HyperLiquidWsPublic | null = null;
  privateWs: Record<Account["id"], HyperLiquidWsPrivate> = {};

  async start({
    accounts,
    config,
    requestId,
  }: {
    accounts: Account[];
    config: ExchangeConfig;
    requestId: string;
  }) {
    await super.start({ accounts, requestId, config });
    await this.fetchPublic();
    this.emitResponse({ requestId });
  }

  async fetchPublic() {
    // 1. fetch markets and tickers
    const { markets, tickers } = await fetchHLMarketsAndTickers(this.config);

    this.emitChanges([
      { type: "update", path: "loaded.markets", value: true },
      { type: "update", path: "loaded.tickers", value: true },
      { type: "update", path: "public.markets", value: markets },
      { type: "update", path: "public.tickers", value: tickers },
    ]);

    this.log(`Loaded ${Object.keys(markets).length} HyperLiquid markets`);

    // 2. start websocket connection
    this.publicWs = new HyperLiquidWsPublic({ parent: this });
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
      this.privateWs[account.id] = new HyperLiquidWsPrivate({
        parent: this,
        account,
      });
    }

    await Promise.all(
      accounts.map(async (account) => {
        const { balance, positions } = await fetchHLUserAccount({
          config: this.config,
          account,
        });

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.positions`,
            value: positions,
          },
          {
            type: "update",
            path: `private.${account.id}.balance`,
            value: balance,
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
          `Loaded ${positions.length} HyperLiquid positions for account [${account.id}]`,
        );
      }),
    );

    for (const account of accounts) {
      // Start listening on private data updates
      // as we have fetched the initial data from HTTP API
      this.privateWs[account.id].startListening();

      // Fetch user orders
      const orders = await fetchHLUserOrders({ config: this.config, account });
      this.emitChanges([
        {
          type: "update",
          path: `private.${account.id}.orders`,
          value: orders,
        },
      ]);

      this.log(
        `Loaded ${orders.length} HyperLiquid orders for account [${account.id}]`,
      );
    }

    if (requestId) {
      this.emitResponse({ requestId });
    }
  }

  updateAccountOrders({
    accountId,
    hlOrders,
  }: {
    accountId: string;
    hlOrders: HLOrderUpdateWs[];
  }) {
    for (const hlOrder of hlOrders) {
      if (hlOrder.status === "open") {
        const idx = this.memory.private[accountId].orders.findIndex(
          (o) => o.id === hlOrder.order.oid,
        );

        if (idx === -1) {
          const length = this.memory.private[accountId].orders.length;
          this.emitChanges([
            {
              type: "update",
              path: `private.${accountId}.orders.${length}`,
              value: mapHlOrder({ order: hlOrder.order, accountId }),
            },
          ]);
        } else {
          this.emitChanges([
            {
              type: "update",
              path: `private.${accountId}.orders.${idx}`,
              value: mapHlOrder({ order: hlOrder.order, accountId }),
            },
          ]);
        }
      }

      if (hlOrder.status === "canceled" || hlOrder.status === "filled") {
        const idx = this.memory.private[accountId].orders.findIndex(
          (o) => o.id === hlOrder.order.oid,
        );

        if (idx !== -1) {
          this.emitChanges([
            {
              type: "removeArrayElement",
              path: `private.${accountId}.orders` as const,
              index: idx,
            },
          ]);
        }
      }
    }
  }

  async fetchOHLCV({
    requestId,
    params,
  }: {
    requestId: string;
    params: FetchOHLCVParams;
  }) {
    const candles = await fetchHLOHLCV({ config: this.config, params });
    this.emitResponse({ requestId, data: candles });
  }

  listenOHLCV(opts: { symbol: string; timeframe: Timeframe }) {
    this.publicWs?.listenOHLCV(opts);
  }

  unlistenOHLCV(opts: { symbol: string; timeframe: Timeframe }) {
    this.publicWs?.unlistenOHLCV(opts);
  }

  listenOrderBook(symbol: string) {
    this.publicWs?.listenOrderBook(symbol);
  }

  unlistenOrderBook(symbol: string) {
    this.publicWs?.unlistenOrderBook(symbol);
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

    const position = this.memory.private[accountId].positions.find(
      (p) => p.symbol === symbol,
    );

    if (position) {
      const { leverage, isHedged } = position;
      this.emitResponse({ requestId, data: { leverage, isHedged } });
    }

    // Hyperliquid defaults are max 20x leverage
    // Otherwise max leverage per symbol
    const market = this.memory.public.markets[symbol];
    const leverage = Math.min(market.limits.leverage.max, 20);

    this.emitChanges([
      {
        type: `update`,
        path: `private.${accountId}.metadata.leverage.${symbol}`,
        value: leverage,
      },
      {
        type: `update`,
        path: `private.${accountId}.metadata.hedgedPosition.${symbol}`,
        value: false,
      },
    ]);

    this.emitResponse({ requestId, data: { leverage, isHedged: false } });
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
    const orderIds = await this.privateWs[accountId].placeOrders({
      orders,
      priority,
    });

    this.emitResponse({ requestId, data: orderIds });

    return orderIds;
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
    const orders = this.mapAccountOrdersFromIds({ orderIds, accountId });

    if (orders.length > 0) {
      await this.privateWs[accountId].cancelOrders({ priority, orders });
    }

    this.emitResponse({ requestId, data: [] });
  }
}

new HyperLiquidWorker({
  name: ExchangeName.HL,
  config: DEFAULT_CONFIG[ExchangeName.HL],
  parent: self,
});
