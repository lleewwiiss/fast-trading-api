import { PM_ENDPOINTS } from "./pm.config";
import type {
  PMOrder,
  PMPosition,
  PMTicker,
  PMOrderBook,
  PMUserBalance,
  PMUserOrderHistory,
  PMCandle,
  PMApiResponse,
} from "./pm.types";
import {
  mapPMMarket,
  mapPMTicker,
  mapPMOrder,
  mapPMPosition,
  mapPMFill,
  formatPMOrder,
  createEip712OrderMessage,
  signEip712Order,
  createL2AuthHeaders,
} from "./pm.utils";

import {
  type Account,
  type ExchangeConfig,
  type Market,
  type Ticker,
  type Order,
  type FetchOHLCVParams,
  type Candle,
  type PlaceOrderOpts,
} from "~/types/lib.types";
import { request } from "~/utils/request.utils";
import { getApiUrl } from "~/utils/cors-proxy.utils";

export const fetchPMMarkets = async (config: ExchangeConfig) => {
  try {
    // Try CLOB API first for active trading markets
    const clobResponse = await request<any>({
      url: getApiUrl(`${config.PRIVATE_API_URL}/markets`, config),
      method: "GET",
    });

    const markets: Record<string, Market> = {};

    // Check if response has data array
    const marketsList = clobResponse.data || clobResponse;

    if (Array.isArray(marketsList)) {
      marketsList.forEach((market: any) => {
        if (market.tokens && Array.isArray(market.tokens)) {
          const marketData = mapPMMarket(market);
          Object.assign(markets, marketData);
        }
      });
    }

    // If no markets found, try gamma API
    if (Object.keys(markets).length === 0) {
      // No markets from CLOB, trying gamma API (logged in worker)
      const gammaResponse = await request<any[]>({
        url: getApiUrl(`${config.PUBLIC_API_URL}/events`, config),
        method: "GET",
      });

      // Process events that have markets
      gammaResponse.slice(0, 5).forEach((event) => {
        // Limit to first 5 events for debugging
        if (event.markets && Array.isArray(event.markets)) {
          event.markets.forEach((market: any) => {
            // Processing market logged in worker
            // Convert gamma market format to expected format
            const convertedMarket = {
              ...market,
              condition_id: market.conditionId,
              end_date_iso: market.endDate,
              tokens: [],
            };

            // Parse clobTokenIds to create tokens
            if (market.clobTokenIds) {
              try {
                const tokenIds = JSON.parse(market.clobTokenIds);
                const outcomes = JSON.parse(market.outcomes || '["Yes", "No"]');

                // Only process if we have valid token IDs and outcomes
                if (tokenIds.length > 0 && outcomes.length > 0) {
                  tokenIds.forEach((tokenId: string, index: number) => {
                    const outcome = outcomes[index] || `Option ${index + 1}`;
                    const ticker =
                      `${market.slug || market.question?.substring(0, 30).replace(/[^a-zA-Z0-9]/g, "-") || "MARKET"}-${outcome}`
                        .toUpperCase()
                        .replace(/--+/g, "-");
                    convertedMarket.tokens.push({
                      token_id: tokenId,
                      outcome,
                      ticker,
                      price: "0",
                    });
                  });

                  // Only add if we have tokens
                  if (convertedMarket.tokens.length > 0) {
                    const marketData = mapPMMarket(convertedMarket);
                    Object.assign(markets, marketData);
                  }
                }
              } catch {
                // Failed to parse market logged in worker
              }
            }
          });
        }
      });
    }

    // Fetched markets count logged in worker
    return markets;
  } catch {
    // Error fetching markets logged in worker
    return {};
  }
};

export const fetchPMTickers = async (
  config: ExchangeConfig,
  markets: Record<string, Market>,
) => {
  const tickers: Record<string, Ticker> = {};

  // Fetch tickers for each market token
  for (const [symbol, market] of Object.entries(markets)) {
    try {
      // Try CLOB price endpoint first
      const response = await request<any>({
        url: getApiUrl(`${config.PRIVATE_API_URL}/price`, config),
        method: "GET",
        params: { token_id: market.id },
      });

      const ticker = mapPMTicker(response, {
        token_id: market.id.toString(),
        outcome: market.base,
        price: response.price || "0",
        ticker: symbol,
      });

      tickers[symbol] = ticker;
    } catch {
      // Try gamma API as fallback
      try {
        const response = await request<PMTicker>({
          url: getApiUrl(
            `${config.PUBLIC_API_URL}${PM_ENDPOINTS.PUBLIC.TICKER}`,
            config,
          ),
          method: "GET",
          params: { token_id: market.id },
        });

        const ticker = mapPMTicker(response, {
          token_id: market.id.toString(),
          outcome: market.base,
          price: response.price || "0",
          ticker: symbol,
        });

        tickers[symbol] = ticker;
      } catch {
        // Create default ticker with 0 values
        tickers[symbol] = {
          id: market.id,
          exchange: market.exchange,
          symbol,
          cleanSymbol: symbol,
          bid: 0,
          ask: 0,
          last: 0,
          mark: 0,
          index: 0,
          percentage: 0,
          openInterest: 0,
          fundingRate: 0,
          volume: 0,
          quoteVolume: 0,
        };
      }
    }
  }

  return tickers;
};

export const fetchPMUserAccount = async ({
  config,
  account,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const headers = await createL2AuthHeaders(
    account,
    "GET",
    PM_ENDPOINTS.PRIVATE.BALANCE,
  );

  const response = await request<PMUserBalance[]>({
    url: getApiUrl(
      `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.BALANCE}`,
      config,
    ),
    method: "GET",
    headers,
  });

  // Calculate total balance from all tokens
  const totalBalance = response.reduce((sum, balance) => {
    return sum + parseFloat(balance.balance);
  }, 0);

  return {
    balance: {
      used: 0, // Would need to calculate from open orders
      free: totalBalance,
      total: totalBalance,
      upnl: 0, // Would need to calculate from positions
    },
    positions: [], // Would need separate position fetch
  };
};

export const fetchPMUserOrders = async ({
  config,
  account,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const headers = await createL2AuthHeaders(
    account,
    "GET",
    PM_ENDPOINTS.PRIVATE.ORDERS,
  );

  const response = await request<PMOrder[]>({
    url: getApiUrl(
      `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.ORDERS}`,
      config,
    ),
    method: "GET",
    headers,
  });

  const orders: Order[] = response.map((o) =>
    mapPMOrder({ order: o, accountId: account.id }),
  );

  return orders;
};

export const fetchPMUserOrderHistory = async ({
  config,
  account,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const headers = await createL2AuthHeaders(
    account,
    "GET",
    PM_ENDPOINTS.PRIVATE.ORDER_HISTORY,
  );

  const response = await request<PMUserOrderHistory[]>({
    url: getApiUrl(
      `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.ORDER_HISTORY}`,
      config,
    ),
    method: "GET",
    headers,
  });

  return response.map((order) => mapPMFill(order, order.asset_id));
};

export const fetchPMPositions = async ({
  config,
  account,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const headers = await createL2AuthHeaders(
    account,
    "GET",
    PM_ENDPOINTS.PRIVATE.POSITIONS,
  );

  const response = await request<PMPosition[]>({
    url: getApiUrl(
      `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.POSITIONS}`,
      config,
    ),
    method: "GET",
    headers,
  });

  return response.map((position) =>
    mapPMPosition({
      position,
      accountId: account.id,
      symbol: position.asset_id, // Would need to map token_id to symbol
    }),
  );
};

export const placePMOrders = async ({
  config,
  account,
  orders,
  tickers,
  markets,
}: {
  config: ExchangeConfig;
  account: Account;
  orders: PlaceOrderOpts[];
  tickers: Record<string, Ticker>;
  markets: Record<string, Market>;
}) => {
  const orderIds: string[] = [];
  const nonce = Date.now(); // Get current nonce for the account

  for (const order of orders) {
    // Format the order
    const orderArgs = formatPMOrder({ order, tickers, markets });

    // Create EIP712 order message
    const orderMessage = createEip712OrderMessage(orderArgs, account, nonce);

    // Sign the order
    const signature = await signEip712Order(orderMessage, account.apiSecret);

    // Create order payload
    const orderPayload = {
      ...orderMessage,
      signature,
    };

    // Create L2 auth headers
    const headers = await createL2AuthHeaders(
      account,
      "POST",
      PM_ENDPOINTS.PRIVATE.ORDERS,
      JSON.stringify(orderPayload),
    );

    // Place the order
    const response = await request<PMApiResponse<{ orderId: string }>>({
      url: getApiUrl(
        `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.ORDERS}`,
        config,
      ),
      method: "POST",
      headers,
      body: orderPayload,
    });

    if (response.success && response.data) {
      orderIds.push(response.data.orderId);
    } else {
      throw new Error(response.error || "Order placement failed");
    }
  }

  return orderIds;
};

export const cancelPMOrders = async ({
  config,
  account,
  orderIds,
}: {
  config: ExchangeConfig;
  account: Account;
  orderIds: string[];
}) => {
  const results: string[] = [];

  for (const orderId of orderIds) {
    const payload = { order_id: orderId };
    const headers = await createL2AuthHeaders(
      account,
      "DELETE",
      PM_ENDPOINTS.PRIVATE.CANCEL,
      JSON.stringify(payload),
    );

    const response = await fetch(
      `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.CANCEL}`,
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify(payload),
      },
    );
    const result = (await response.json()) as PMApiResponse<{
      orderId: string;
    }>;

    if (result.success) {
      results.push(orderId);
    } else {
      throw new Error(result.error || "Order cancellation failed");
    }
  }

  return results;
};

export const cancelAllPMOrders = async ({
  config,
  account,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const headers = await createL2AuthHeaders(
    account,
    "DELETE",
    PM_ENDPOINTS.PRIVATE.CANCEL_ALL,
  );

  const response = await fetch(
    `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.CANCEL_ALL}`,
    {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
    },
  );

  const result = (await response.json()) as PMApiResponse<{
    cancelled: number;
  }>;

  if (!result.success) {
    throw new Error(result.error || "Cancel all orders failed");
  }

  return result.data?.cancelled || 0;
};

export const fetchPMOrderBook = async ({
  config,
  tokenId,
}: {
  config: ExchangeConfig;
  tokenId: string;
}) => {
  const response = await request<PMOrderBook>({
    url: getApiUrl(
      `${config.PUBLIC_API_URL}${PM_ENDPOINTS.PUBLIC.ORDER_BOOK}`,
      config,
    ),
    method: "GET",
    params: { token_id: tokenId },
  });

  return {
    bids: response.bids.map((bid) => ({
      price: parseFloat(bid.price),
      amount: parseFloat(bid.size),
      total: parseFloat(bid.price) * parseFloat(bid.size),
    })),
    asks: response.asks.map((ask) => ({
      price: parseFloat(ask.price),
      amount: parseFloat(ask.size),
      total: parseFloat(ask.price) * parseFloat(ask.size),
    })),
  };
};

export const fetchPMOHLCV = async ({
  config,
  params,
}: {
  config: ExchangeConfig;
  params: FetchOHLCVParams;
}) => {
  const queryParams: Record<string, string | number> = {
    market: params.symbol,
    interval: params.timeframe,
    limit: params.limit || 500,
  };

  if (params.from) {
    queryParams.startTs = params.from;
  }
  if (params.to) {
    queryParams.endTs = params.to;
  }

  const response = await request<PMCandle[]>({
    url: getApiUrl(
      `${config.PUBLIC_API_URL}${PM_ENDPOINTS.PUBLIC.CANDLES}`,
      config,
    ),
    method: "GET",
    params: queryParams,
  });

  const candles: Candle[] = response.map((c) => ({
    symbol: params.symbol,
    timeframe: params.timeframe,
    timestamp: c.t,
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }));

  return candles.sort((a, b) => a.timestamp - b.timestamp);
};
