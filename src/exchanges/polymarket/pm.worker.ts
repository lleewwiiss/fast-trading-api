import { BaseWorker } from "../base.worker";

import {
  fetchPMMarkets,
  fetchPMTickers,
  fetchPMOHLCV,
  fetchPMUserAccount,
  fetchPMUserOrders,
  fetchPMUserOrderHistory,
  fetchPMPositions,
} from "./pm.resolver";
import { createOrDeriveApiKey } from "./pm.utils";
import { PolymarketWsPublic } from "./pm.ws-public";
import { PolymarketWsPrivate } from "./pm.ws-private";

import { DEFAULT_CONFIG } from "~/config";
import {
  ExchangeName,
  type Account,
  type ExchangeConfig,
  type FetchOHLCVParams,
  type Order,
  type PlaceOrderOpts,
  type PlacePositionStopOpts,
  type Position,
  type Timeframe,
  type UpdateOrderOpts,
} from "~/types/lib.types";

export class PolymarketWorker extends BaseWorker {
  publicWs: PolymarketWsPublic | null = null;
  privateWs: Record<Account["id"], PolymarketWsPrivate> = {};
  clobCredentials: Record<
    Account["id"],
    { apiKey: string; secret: string; passphrase: string } | null
  > = {};

  get exchangeName() {
    return ExchangeName.POLYMARKET;
  }

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
    try {
      // 1. Fetch markets
      const markets = await fetchPMMarkets(this.config);

      // 2. Fetch tickers for each market
      const tickers = await fetchPMTickers(this.config, markets);

      this.emitChanges([
        { type: "update", path: "loaded.markets", value: true },
        { type: "update", path: "loaded.tickers", value: true },
        { type: "update", path: "public.markets", value: markets },
        { type: "update", path: "public.tickers", value: tickers },
      ]);

      this.log(`Loaded ${Object.keys(markets).length} Polymarket markets`);

      // 3. Start WebSocket connection
      this.publicWs = new PolymarketWsPublic({ parent: this });
    } catch (error) {
      this.error(`Failed to fetch Polymarket public data: ${error}`);
    }
  }

  async addAccounts({
    accounts,
    requestId,
  }: {
    accounts: Account[];
    requestId?: string;
  }) {
    super.addAccounts({ accounts, requestId });

    // First, derive CLOB credentials for each account
    for (const account of accounts) {
      try {
        this.log(`Deriving CLOB API credentials for account [${account.id}]`);
        const creds = await createOrDeriveApiKey(account, this.config);
        this.clobCredentials[account.id] = creds;

        if (!creds) {
          this.error(
            `Failed to derive CLOB credentials for account [${account.id}]`,
          );
        } else {
          this.log(
            `Got CLOB credentials: apiKey=${creds.apiKey?.slice(0, 8)}..., has secret: ${!!creds.secret}, has passphrase: ${!!creds.passphrase}`,
          );
        }
      } catch (error) {
        this.error(
          `Error deriving CLOB credentials for [${account.id}]: ${error}`,
        );
        this.clobCredentials[account.id] = null;
      }
    }

    // Initialize private WebSocket connections for each account
    for (const account of accounts) {
      this.privateWs[account.id] = new PolymarketWsPrivate({
        parent: this,
        account,
        clobCredentials: this.clobCredentials[account.id], // Pass credentials to WebSocket
      });
    }

    // Fetch initial account data for each account
    await Promise.all(
      accounts.map(async (account) => {
        try {
          // Fetch user account balance
          const { balance } = await fetchPMUserAccount({
            config: this.config,
            account,
            // Note: Codex SDK not available in PM worker, only using data API
          });

          // Fetch user positions
          const positions = await fetchPMPositions({
            config: this.config,
            account,
          });

          this.emitChanges([
            {
              type: "update",
              path: `private.${account.id}.balance`,
              value: balance,
            },
            {
              type: "update",
              path: `private.${account.id}.positions`,
              value: positions,
            },
          ]);

          this.log(
            `Loaded ${positions.length} Polymarket positions for account [${account.id}]`,
          );
        } catch (error) {
          this.error(
            `Failed to fetch account data for [${account.id}]: ${error}`,
          );
        }
      }),
    );

    // Start listening for real-time updates and fetch orders
    for (const account of accounts) {
      try {
        // Start listening for private data updates
        this.privateWs[account.id].startListening();

        // Fetch user orders with CLOB credentials
        const orders = await fetchPMUserOrders({
          config: this.config,
          account,
          clobCredentials: this.clobCredentials[account.id],
        });

        this.log(
          `Loaded ${orders.length} Polymarket active orders for account [${account.id}]`,
        );

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.orders`,
            value: orders,
          },
        ]);

        // Fetch order history
        const ordersHistory = await fetchPMUserOrderHistory({
          config: this.config,
          account,
          clobCredentials: this.clobCredentials[account.id],
        });

        this.log(
          `Loaded ${ordersHistory.length} Polymarket orders history for account [${account.id}]`,
        );

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.fills`,
            value: ordersHistory,
          },
        ]);
      } catch (error) {
        this.error(
          `Failed to fetch orders for account [${account.id}]: ${error}`,
        );
      }
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

    await super.removeAccount({ accountId, requestId });
  }

  async fetchOHLCV({
    requestId,
    params,
  }: {
    requestId: string;
    params: FetchOHLCVParams;
  }) {
    try {
      const markets = this.memory.public.markets;
      const candles = await fetchPMOHLCV({
        config: this.config,
        params,
        markets,
      });
      this.emitResponse({ requestId, data: candles });
    } catch (error) {
      this.error(`Failed to fetch OHLCV data: ${error}`);
      this.emitResponse({ requestId, data: [] });
    }
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
    // Polymarket doesn't have adjustable leverage or hedged positions
    // All positions use 1x leverage (no leverage)
    const leverage = 1;
    const isHedged = false;

    this.emitChanges([
      {
        type: "update",
        path: `private.${accountId}.metadata.leverage.${symbol}`,
        value: leverage,
      },
      {
        type: "update",
        path: `private.${accountId}.metadata.hedgedPosition.${symbol}`,
        value: isHedged,
      },
    ]);

    this.emitResponse({ requestId, data: { leverage, isHedged } });
  }

  async placePositionStop({
    requestId,
  }: {
    position: Position;
    stop: PlacePositionStopOpts;
    requestId: string;
    priority?: boolean;
  }) {
    // Polymarket doesn't support position stops/take profits
    // This is because prediction markets work differently than traditional futures
    this.error("Position stops are not supported on Polymarket");
    this.emitResponse({ requestId, data: [] });
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
    try {
      const orderIds = await this.privateWs[accountId].placeOrders({
        orders,
        priority,
      });

      this.emitResponse({ requestId, data: orderIds });
      return orderIds;
    } catch (error) {
      this.error(`Failed to place orders for account [${accountId}]: ${error}`);
      this.emitResponse({ requestId, data: [] });
      return [];
    }
  }

  async cancelOrders({
    orderIds,
    accountId,
    requestId,
    priority = false,
  }: {
    orderIds: Order["id"][];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    try {
      const orders = this.mapAccountOrdersFromIds({ orderIds, accountId });

      if (orders.length > 0) {
        await this.privateWs[accountId].cancelOrders({ orders, priority });
      }

      this.emitResponse({ requestId, data: [] });
    } catch (error) {
      this.error(
        `Failed to cancel orders for account [${accountId}]: ${error}`,
      );
      this.emitResponse({ requestId, data: [] });
    }
  }

  async cancelSymbolOrders({
    accountId,
    requestId,
    symbol,
    priority = false,
  }: {
    accountId: string;
    requestId: string;
    symbol: string;
    priority?: boolean;
  }) {
    try {
      const allOrders = this.memory.private[accountId]?.orders ?? [];
      const symbolOrders = allOrders.filter((o) => o.symbol === symbol);

      if (symbolOrders.length > 0) {
        await this.privateWs[accountId].cancelOrders({
          orders: symbolOrders,
          priority,
        });
      }

      this.emitResponse({ requestId, data: [] });
    } catch (error) {
      this.error(
        `Failed to cancel symbol orders for account [${accountId}]: ${error}`,
      );
      this.emitResponse({ requestId, data: [] });
    }
  }

  async cancelAllOrders({
    accountId,
    requestId,
    priority = false,
  }: {
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    try {
      const orders = this.memory.private[accountId]?.orders ?? [];

      if (orders.length > 0) {
        await this.privateWs[accountId].cancelOrders({ orders, priority });
      }

      this.emitResponse({ requestId, data: [] });
    } catch (error) {
      this.error(
        `Failed to cancel all orders for account [${accountId}]: ${error}`,
      );
      this.emitResponse({ requestId, data: [] });
    }
  }

  async updateOrders({
    updates,
    accountId,
    requestId,
    priority = false,
  }: {
    updates: UpdateOrderOpts[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    try {
      await this.privateWs[accountId].updateOrders({ updates, priority });
      this.emitResponse({ requestId, data: [] });
    } catch (error) {
      this.error(
        `Failed to update orders for account [${accountId}]: ${error}`,
      );
      this.emitResponse({ requestId, data: [] });
    }
  }

  async setLeverage({
    requestId,
    accountId,
    symbol,
  }: {
    requestId: string;
    accountId: string;
    symbol: string;
    leverage: number;
  }) {
    // Polymarket doesn't support leverage adjustment
    // All positions are 1x (no leverage)
    this.error("Leverage adjustment is not supported on Polymarket");

    // Always return leverage = 1
    this.emitChanges([
      {
        type: "update",
        path: `private.${accountId}.metadata.leverage.${symbol}`,
        value: 1,
      },
    ]);

    this.emitResponse({ requestId, data: false });
  }

  stop() {
    // Stop public WebSocket
    if (this.publicWs) {
      this.publicWs.stop();
      this.publicWs = null;
    }

    // Stop all private WebSockets
    Object.values(this.privateWs).forEach((ws) => ws.stop());
    this.privateWs = {};

    this.log("Polymarket worker stopped");
  }
}

new PolymarketWorker({
  name: ExchangeName.POLYMARKET,
  config: DEFAULT_CONFIG[ExchangeName.POLYMARKET],
  parent: self,
});
