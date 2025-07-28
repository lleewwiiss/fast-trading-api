import { BaseWorker } from "../base.worker";

import { BinanceWsPublic } from "./binance.ws-public";
import { BinanceWsPrivate } from "./binance.ws-private";
import {
  fetchBinanceOrders,
  fetchBinanceBalance,
  fetchBinanceMarkets,
  fetchBinancePositions,
  fetchBinanceTickers,
  fetchBinanceOHLCV,
  fetchBinanceSymbolPositions,
  setBinanceLeverage,
  fetchBinanceOrdersHistory,
  cancelAllBinanceOrders,
  cancelSymbolBinanceOrders,
  createBinanceTradingStop,
} from "./binance.resolver";
import type { BinanceOrder } from "./binance.types";
import {
  formatBinanceOrder,
  mapBinanceOrder,
  mapBinanceFill,
} from "./binance.utils";
import { binance } from "./binance.api";
import { BINANCE_ENDPOINTS } from "./binance.config";

import {
  ExchangeName,
  OrderSide,
  PositionSide,
  type Account,
  type PlaceOrderOpts,
  type Timeframe,
  type FetchOHLCVParams,
  type ExchangeConfig,
  type UpdateOrderOpts,
  type PlacePositionStopOpts,
  type Position,
} from "~/types/lib.types";
import { subtract } from "~/utils/safe-math.utils";
import { omit } from "~/utils/omit.utils";
import { toUSD } from "~/utils/to-usd.utils";
import { sumBy } from "~/utils/sum-by.utils";
import { genId } from "~/utils/gen-id.utils";

export class BinanceWorker extends BaseWorker {
  publicWs: BinanceWsPublic | null = null;
  privateWs: Record<Account["id"], BinanceWsPrivate> = {};

  pollBalanceTimeouts: Record<Account["id"], NodeJS.Timeout> = {};

  // Cache for frequently accessed data
  private cache = {
    markets: { data: null as any, timestamp: 0, ttl: 60_000 }, // 1 minute TTL
    tickers: { data: null as any, timestamp: 0, ttl: 5_000 }, // 5 seconds TTL
    leverageBrackets: { data: null as any, timestamp: 0, ttl: 300_000 }, // 5 minutes TTL
  };

  constructor() {
    super({
      parent: self,
      name: ExchangeName.BINANCE,
      config: {} as ExchangeConfig,
    });
  }

  private isCacheValid(cacheEntry: {
    timestamp: number;
    ttl: number;
  }): boolean {
    return Date.now() - cacheEntry.timestamp < cacheEntry.ttl;
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
    try {
      await super.start({ accounts, requestId, config });
      await this.fetchPublic();
      this.emitResponse({ requestId });
    } catch (error) {
      this.log(
        `Failed to start Binance worker: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.emitResponse({
        requestId,
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  stop() {
    this.publicWs?.stop();
    this.publicWs = null;

    for (const key in this.privateWs) {
      this.privateWs[key].stop();
      delete this.privateWs[key];
    }

    for (const key in this.pollBalanceTimeouts) {
      clearTimeout(this.pollBalanceTimeouts[key]);
      delete this.pollBalanceTimeouts[key];
    }
  }

  async fetchPublic() {
    // 1. Fetch markets (with caching)
    let markets;
    if (this.isCacheValid(this.cache.markets) && this.cache.markets.data) {
      markets = this.cache.markets.data;
    } else {
      markets = await fetchBinanceMarkets(this.config);
      this.cache.markets.data = markets;
      this.cache.markets.timestamp = Date.now();
    }

    // 2. Fetch tickers (with caching)
    let tickers;
    if (this.isCacheValid(this.cache.tickers) && this.cache.tickers.data) {
      tickers = this.cache.tickers.data;
    } else {
      tickers = await fetchBinanceTickers({ config: this.config });
      this.cache.tickers.data = tickers;
      this.cache.tickers.timestamp = Date.now();
    }

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

    this.log(`Loaded ${Object.keys(markets).length} Binance markets`);

    // 2. Start public websocket
    this.publicWs = new BinanceWsPublic({ parent: this });
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
      this.privateWs[account.id] = new BinanceWsPrivate({
        parent: this,
        account,
      });
    }

    await Promise.all(
      accounts.map(async (account) => {
        await this.fetchAndPollBalance(account);
        this.log(`Loaded Binance balance for account [${account.id}]`);
      }),
    );

    await Promise.all(
      accounts.map(async (account) => {
        const positions = await fetchBinancePositions({
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
          `Loaded ${positions.length} Binance positions for account [${account.id}]`,
        );
      }),
    );

    for (const account of accounts) {
      try {
        // Start listening on private data updates
        this.privateWs[account.id].start();

        // Fetch orders
        const orders = await fetchBinanceOrders({
          config: this.config,
          account,
        });

        this.log(
          `Loaded ${orders.length} Binance active orders for account [${account.id}]`,
        );

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.orders`,
            value: orders,
          },
        ]);

        // Then we fetch orders history
        const ordersHistory = await fetchBinanceOrdersHistory({
          config: this.config,
          account,
        });

        this.log(
          `Loaded ${ordersHistory.length} Binance orders history for account [${account.id}]`,
        );

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.fills`,
            value: ordersHistory,
          },
        ]);
      } catch (error) {
        this.log(
          `Failed to initialize account ${account.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        // Continue with other accounts even if one fails
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

    if (accountId in this.pollBalanceTimeouts) {
      clearTimeout(this.pollBalanceTimeouts[accountId]);
      delete this.pollBalanceTimeouts[accountId];
    }

    await super.removeAccount({ accountId, requestId });
  }

  async fetchAndPollBalance(account: Account) {
    try {
      const balance = await fetchBinanceBalance({
        config: this.config,
        account,
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
    } catch (error) {
      this.log(
        `Failed to fetch balance for account ${account.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Retry after longer delay on error
      this.pollBalanceTimeouts[account.id] = setTimeout(
        () => this.fetchAndPollBalance(account),
        10000, // 10 seconds on error
      );
    }
  }

  async fetchOHLCV({
    requestId,
    params,
  }: {
    requestId: string;
    params: FetchOHLCVParams;
  }) {
    const candles = await fetchBinanceOHLCV({ config: this.config, params });
    this.emitResponse({ requestId, data: candles });
  }

  listenOHLCV({ symbol, timeframe }: { symbol: string; timeframe: Timeframe }) {
    this.publicWs?.listenOHLCV(symbol, timeframe);
  }

  unlistenOHLCV({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) {
    this.publicWs?.unlistenOHLCV(symbol, timeframe);
  }

  listenOrderBook(symbol: string) {
    this.publicWs?.listenOrderBook(symbol);
  }

  unlistenOrderBook(symbol: string) {
    this.publicWs?.unlistenOrderBook(symbol);
  }

  async placeOrders({
    orders,
    accountId,
    requestId,
  }: {
    orders: PlaceOrderOpts[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }): Promise<Array<string | number>> {
    const account = this.accounts.find((a) => a.id === accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const orderIds: string[] = [];

    for (const order of orders) {
      const market = this.memory.public.markets[order.symbol];
      if (!market) {
        this.log(`Market ${order.symbol} not found`);
        continue;
      }

      const isHedged =
        this.memory.private[accountId].metadata.hedgedPosition[order.symbol];
      const orderPayloads = formatBinanceOrder({ order, market, isHedged });

      for (const payload of orderPayloads) {
        try {
          const response = await binance<BinanceOrder>({
            url: `${this.config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.ORDER}`,
            method: "POST",
            params: payload as any,
            key: account.apiKey,
            secret: account.apiSecret,
          });

          orderIds.push(response.orderId.toString());
        } catch (error) {
          this.error(`Failed to place Binance order: ${error}`);
        }
      }
    }

    this.emitResponse({ requestId, data: orderIds });
    return orderIds;
  }

  async cancelOrders({
    orderIds,
    accountId,
    requestId,
  }: {
    orderIds: Array<string | number>;
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    const account = this.accounts.find((a) => a.id === accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    for (const orderId of orderIds) {
      const order = this.memory.private[accountId].orders.find(
        (o) => o.id === orderId,
      );
      if (!order) continue;

      try {
        await binance({
          url: `${this.config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.ORDER}`,
          method: "DELETE",
          params: {
            symbol: order.symbol,
            orderId,
          },
          key: account.apiKey,
          secret: account.apiSecret,
        });
      } catch (error) {
        this.error(`Failed to cancel Binance order ${orderId}: ${error}`);
      }
    }

    this.emitResponse({ requestId });
  }

  updateAccountOrders({
    accountId,
    binanceOrders,
  }: {
    accountId: Account["id"];
    binanceOrders: BinanceOrder[];
  }) {
    for (const binanceOrder of binanceOrders) {
      const order = mapBinanceOrder({ accountId, order: binanceOrder });

      const price = parseFloat(binanceOrder.price);
      const amount = parseFloat(binanceOrder.origQty);

      if (binanceOrder.status === "PARTIALLY_FILLED") {
        // False positive when order is replaced
        // it emits a partially filled with 0 amount & price
        if (price <= 0 && amount <= 0) return;
      }

      if (
        binanceOrder.status === "FILLED" ||
        binanceOrder.status === "PARTIALLY_FILLED"
      ) {
        const existingOrder = this.memory.private[accountId].orders.find(
          (o) => o.id === order.id,
        );

        const amount = existingOrder
          ? subtract(parseFloat(binanceOrder.executedQty), existingOrder.filled)
          : parseFloat(binanceOrder.executedQty);

        this.emitChanges([
          {
            type: "update",
            path: `private.${accountId}.notifications.${this.memory.private[accountId].notifications.length}`,
            value: {
              id: genId(),
              accountId,
              type: "order_fill",
              data: {
                id: order.id,
                symbol: order.symbol,
                side: order.side,
                price: order.price || "MARKET",
                amount,
              },
            },
          },
        ]);
      }

      if (
        binanceOrder.status === "CANCELED" ||
        binanceOrder.status === "REJECTED" ||
        binanceOrder.status === "EXPIRED" ||
        binanceOrder.status === "FILLED"
      ) {
        const changes = this.memory.private[accountId].orders.reduce<
          {
            type: "removeArrayElement";
            path: `private.${typeof accountId}.orders`;
            index: number;
          }[]
        >((acc, o) => {
          if (
            o.id === order.id ||
            o.id === `${order.id}__stop_loss` ||
            o.id === `${order.id}__take_profit`
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

      if (binanceOrder.status === "FILLED") {
        const fillsLength = this.memory.private[accountId].fills.length;

        this.emitChanges([
          {
            type: "update",
            path: `private.${accountId}.fills.${fillsLength}`,
            value: mapBinanceFill(binanceOrder),
          },
        ]);
      }

      if (
        binanceOrder.status === "NEW" ||
        binanceOrder.status === "PARTIALLY_FILLED"
      ) {
        const existingOrderIndex = this.memory.private[
          accountId
        ].orders.findIndex((o) => o.id === order.id);

        if (existingOrderIndex >= 0) {
          // Update existing order
          this.emitChanges([
            {
              type: "update",
              path: `private.${accountId}.orders.${existingOrderIndex}`,
              value: order,
            },
          ]);
        } else {
          // Add new order
          const ordersLength = this.memory.private[accountId].orders.length;
          this.emitChanges([
            {
              type: "update",
              path: `private.${accountId}.orders.${ordersLength}`,
              value: order,
            },
          ]);
        }
      }
    }
  }

  async updateOrders({
    updates,
    accountId,
    requestId,
    priority: _priority = false,
  }: {
    updates: UpdateOrderOpts[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    const account = this.accounts.find((a) => a.id === accountId);
    if (!account) {
      this.error(`Account ${accountId} not found`);
      this.emitResponse({ requestId, data: { error: "Account not found" } });
      return;
    }

    // Binance doesn't support direct order modification
    // We need to cancel existing orders and place new ones
    const results = [];

    for (const { order, update } of updates) {
      try {
        // First cancel the existing order
        await binance({
          url: `${this.config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.ORDER}`,
          method: "DELETE",
          params: {
            symbol: order.symbol,
            orderId: order.id,
          },
          key: account.apiKey,
          secret: account.apiSecret,
        });

        // Then place a new order with updated parameters
        const market = this.memory.public.markets[order.symbol];
        if (!market) {
          this.error(`Market ${order.symbol} not found`);
          continue;
        }

        const nextOrder: PlaceOrderOpts = {
          symbol: order.symbol,
          type: order.type,
          side: order.side,
          amount: order.amount,
          reduceOnly: order.reduceOnly,
        };

        // Apply updates
        if ("price" in update) nextOrder.price = update.price;
        if ("amount" in update) nextOrder.amount = update.amount;

        const isHedged =
          this.memory.private[accountId].metadata.hedgedPosition[order.symbol];
        const orderPayloads = formatBinanceOrder({
          order: nextOrder,
          market,
          isHedged,
        });

        for (const payload of orderPayloads) {
          const response = await binance<BinanceOrder>({
            url: `${this.config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.ORDER}`,
            method: "POST",
            params: payload as any,
            key: account.apiKey,
            secret: account.apiSecret,
          });

          results.push(response.orderId.toString());
        }
      } catch (error) {
        this.error(`Failed to update Binance order ${order.id}: ${error}`);
      }
    }

    this.emitResponse({ requestId, data: results });
  }

  async cancelSymbolOrders({
    symbol,
    accountId,
    requestId,
  }: {
    symbol: string;
    accountId: string;
    requestId: string;
  }) {
    const account = this.accounts.find((a) => a.id === accountId);

    if (!account) {
      this.error(`No account found for id: ${accountId}`);
      this.emitResponse({ requestId, data: { error: "Account not found" } });
      return;
    }

    try {
      const success = await cancelSymbolBinanceOrders({
        account,
        config: this.config,
        symbol,
      });

      this.emitResponse({ requestId, data: { success } });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.error(`Failed to cancel symbol orders: ${errorMessage}`);
      this.emitResponse({ requestId, data: { error: errorMessage } });
    }
  }

  async cancelAllOrders({
    accountId,
    requestId,
  }: {
    accountId: string;
    requestId: string;
  }) {
    const account = this.accounts.find((a) => a.id === accountId);

    if (!account) {
      this.error(`No account found for id: ${accountId}`);
      this.emitResponse({ requestId, data: { error: "Account not found" } });
      return;
    }

    try {
      const success = await cancelAllBinanceOrders({
        account,
        config: this.config,
      });

      this.emitResponse({ requestId, data: { success } });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.error(`Failed to cancel all orders: ${errorMessage}`);
      this.emitResponse({ requestId, data: { error: errorMessage } });
    }
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
      throw new Error(`Account ${accountId} not found`);
    }

    const positions = await fetchBinanceSymbolPositions({
      config: this.config,
      account,
      symbol,
    });

    const leverage = positions[0]?.leverage || 1;
    const isHedged = positions.some((p) => p.isHedged);

    this.emitResponse({
      requestId,
      data: { leverage, isHedged },
    });
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
      throw new Error(`Account ${accountId} not found`);
    }

    const success = await setBinanceLeverage({
      account,
      config: this.config,
      symbol,
      leverage,
    });

    this.emitResponse({ requestId, data: success });
  }

  async placePositionStop({
    position,
    stop,
    requestId,
  }: {
    position: Position;
    stop: PlacePositionStopOpts;
    requestId: string;
    priority?: boolean;
  }) {
    const account = this.accounts.find((a) => a.id === position.accountId);

    if (!account) {
      this.error(`No account found for id: ${position.accountId}`);
      this.emitResponse({ requestId, data: { error: "Account not found" } });
      return;
    }

    const market = this.memory.public.markets[position.symbol];
    if (!market) {
      this.error(`No market data found for symbol: ${position.symbol}`);
      this.emitResponse({ requestId, data: { error: "Market not found" } });
      return;
    }

    const ticker = this.memory.public.tickers[position.symbol];
    if (!ticker) {
      this.error(`No ticker data found for symbol: ${position.symbol}`);
      this.emitResponse({ requestId, data: { error: "Ticker not found" } });
      return;
    }

    const isHedged =
      this.memory.private[account.id].metadata.hedgedPosition[position.symbol];

    const stopOrder: PlaceOrderOpts = {
      symbol: position.symbol,
      type: stop.type,
      side:
        position.side === PositionSide.Long ? OrderSide.Sell : OrderSide.Buy,
      amount: position.contracts,
      price: stop.price,
      reduceOnly: true,
    };

    try {
      const response = await createBinanceTradingStop({
        config: this.config,
        order: stopOrder,
        account,
        market,
        ticker,
        isHedged,
      });

      this.emitResponse({ requestId, data: [response.orderId.toString()] });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.error(`Failed to place Binance position stop: ${errorMessage}`);
      this.emitResponse({ requestId, data: { error: errorMessage } });
    }
  }
}

// Start the worker
new BinanceWorker();
