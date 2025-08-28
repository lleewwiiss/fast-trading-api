import { BaseWorker } from "../base.worker";

import {
  fetchPMMarkets,
  fetchPMTickers,
  fetchPMOHLCV,
  fetchPMUserAccount,
  fetchPMUserOrders,
  fetchPMUserOrderHistory,
  fetchPMMarketById,
  fetchPMPositions,
} from "./pm.resolver";
import { createOrDeriveApiKey } from "./pm.utils";
import { PM_CONFIG, PM_ENDPOINTS } from "./pm.config";
import { PolymarketWsPublic } from "./pm.ws-public";
import { PolymarketWsPrivate } from "./pm.ws-private";

import { getApiUrl } from "~/utils/cors-proxy.utils";
import { request } from "~/utils/request.utils";
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

  async addMarketToTracking({
    requestId,
    marketId,
  }: {
    requestId: string;
    marketId: string; // treat as eventId if it resolves to an event
  }) {
    try {
      // Try to treat incoming id as an event id first (with CORS proxy support)
      const baseUrl = `${PM_CONFIG.PUBLIC_API_URL}${PM_ENDPOINTS.PUBLIC.EVENTS_PAGINATION}`;
      const proxiedUrl = getApiUrl(baseUrl, this.config);

      const useLocal = this.config.options?.corsProxy?.useLocalProxy;
      const eventResp = await request<any>(
        useLocal
          ? {
              url: proxiedUrl,
              originalUrl: baseUrl,
              method: "GET" as const,
              params: { id: marketId },
            }
          : {
              url: proxiedUrl,
              method: "GET" as const,
              params: { id: marketId },
            },
      );

      const eventObj = Array.isArray(eventResp?.data)
        ? eventResp.data[0]
        : Array.isArray(eventResp)
          ? eventResp[0]
          : undefined;

      if (eventObj?.markets?.length) {
        // Load all markets under this event
        const aggregatedMarkets: Record<string, any> = {};
        const aggregatedTickers: Record<string, any> = {};

        // Build unified markets by reusing fetchPMMarkets logic per market structure
        for (const market of eventObj.markets) {
          if (!market.enableOrderBook) continue;

          let outcomes: string[] = [];
          let prices: string[] = [];
          let tokenIds: string[] = [];
          try {
            outcomes = JSON.parse(market.outcomes || "[]");
            prices = JSON.parse(market.outcomePrices || "[]");
            tokenIds = JSON.parse(market.clobTokenIds || "[]");
          } catch {
            continue;
          }

          const yesIdx = outcomes.findIndex((o) => /YES/i.test(String(o)));
          const noIdx = outcomes.findIndex((o) => /NO/i.test(String(o)));
          const yesTokenId = yesIdx >= 0 ? tokenIds[yesIdx] : undefined;
          const noTokenId = noIdx >= 0 ? tokenIds[noIdx] : undefined;
          if (!yesTokenId || !noTokenId) continue;

          const baseSymbol = (
            eventObj.ticker ||
            eventObj.slug ||
            market.slug ||
            "MARKET"
          )
            .toUpperCase()
            .replace(/[^A-Z0-9-]/g, "");

          const priceYes = yesIdx >= 0 ? parseFloat(prices[yesIdx] || "0") : 0;
          const priceNo = noIdx >= 0 ? parseFloat(prices[noIdx] || "0") : 0;
          const spread = market.spread || 0.001;

          aggregatedMarkets[baseSymbol] = {
            id: market.id || baseSymbol,
            exchange: ExchangeName.POLYMARKET,
            symbol: baseSymbol,
            base: baseSymbol,
            quote: "USDC",
            active: Boolean(eventObj.active && market.active),
            precision: { amount: 0.001, price: 0.001 },
            limits: {
              amount: { min: 5, max: Infinity, maxMarket: Infinity },
              leverage: { min: 1, max: 1 },
            },
            metadata: {
              question: market.question,
              endDate: market.endDate,
              outcomes: { YES: yesTokenId, NO: noTokenId },
              prices: { YES: priceYes, NO: priceNo },
              volume24hr: market.volume24hr,
              liquidity: market.liquidityClob,
              spread: market.spread,
            },
          } as any;

          aggregatedTickers[baseSymbol] = {
            id: market.id || baseSymbol,
            exchange: ExchangeName.POLYMARKET,
            symbol: baseSymbol,
            cleanSymbol: baseSymbol,
            bid: Math.max(0, priceYes - spread / 2),
            ask: Math.min(1, priceYes + spread / 2),
            last: priceYes,
            mark: priceYes,
            index: priceYes,
            percentage: 0,
            openInterest: 0,
            fundingRate: 0,
            volume: market.volume24hr || 0,
            quoteVolume: market.volume24hr || 0,
            polymarket: {
              bidYes: Math.max(0, priceYes - spread / 2),
              askYes: Math.min(1, priceYes + spread / 2),
              lastYes: priceYes,
              markYes: priceYes,
              indexYes: priceYes,
              volumeYes: market.volume24hr || 0,
              bidNo: Math.max(0, priceNo - spread / 2),
              askNo: Math.min(1, priceNo + spread / 2),
              lastNo: priceNo,
              markNo: priceNo,
              indexNo: priceNo,
              volumeNo: market.volume24hr || 0,
            },
          } as any;
        }

        if (Object.keys(aggregatedMarkets).length === 0) {
          this.error(`No markets found for event ${marketId}`);
          this.emitResponse({ requestId, data: false });
          return;
        }

        this.emitChanges([
          {
            type: "update",
            path: "public.markets",
            value: { ...this.memory.public.markets, ...aggregatedMarkets },
          },
          {
            type: "update",
            path: "public.tickers",
            value: { ...this.memory.public.tickers, ...aggregatedTickers },
          },
        ]);

        this.log(
          `Added Polymarket event ${marketId} (${Object.keys(aggregatedMarkets).length} markets) to tracking`,
        );
        this.emitResponse({ requestId, data: true });
        return;
      }

      // Fallback: treat as single market id
      const { markets, tickers } = await fetchPMMarketById(
        this.config,
        marketId,
      );

      if (Object.keys(markets).length === 0) {
        this.error(`Failed to fetch market ${marketId}`);
        this.emitResponse({ requestId, data: false });
        return;
      }

      const updatedMarkets = {
        ...this.memory.public.markets,
        ...markets,
      };
      const updatedTickers = {
        ...this.memory.public.tickers,
        ...tickers,
      };

      this.emitChanges([
        { type: "update", path: "public.markets", value: updatedMarkets },
        { type: "update", path: "public.tickers", value: updatedTickers },
      ]);

      this.log(`Added Polymarket market ${marketId} to tracking`);
      this.emitResponse({ requestId, data: true });
    } catch (error) {
      this.error(`Error addMarketToTracking: ${error}`);
      this.emitResponse({ requestId, data: false });
    }
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
