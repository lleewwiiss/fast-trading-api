import { PM_ENDPOINTS, PM_CONFIG } from "./pm.config";
import type {
  PMOrderBook,
  PMApiResponse,
  PMPriceHistoryResponse,
  PMGammaEventsResponse,
} from "./pm.types";
import {
  mapPMFill,
  formatPMOrder,
  createEip712OrderMessage,
  signEip712Order,
  createL2AuthHeaders,
} from "./pm.utils";

import {
  ExchangeName,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
  type Account,
  type ExchangeConfig,
  type Market,
  type Ticker,
  type FetchOHLCVParams,
  type Candle,
  type PlaceOrderOpts,
} from "~/types/lib.types";
import { request } from "~/utils/request.utils";
import { getApiUrl } from "~/utils/cors-proxy.utils";

export const fetchPMMarkets = async (config: ExchangeConfig) => {
  try {
    const markets: Record<string, Market> = {};
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore && pageCount < 5) {
      pageCount++;

      // Apply CORS proxy if needed for gamma-api
      // Use updated Gamma Markets API endpoint
      const baseUrl = `${PM_CONFIG.PUBLIC_API_URL}${PM_ENDPOINTS.PUBLIC.MARKETS}`;
      const proxiedUrl = getApiUrl(baseUrl, config);

      // If using local proxy, pass the original URL separately
      const requestConfig = config.options?.corsProxy?.useLocalProxy
        ? {
            url: proxiedUrl,
            originalUrl: baseUrl,
            method: "GET" as const,
            params: {
              limit,
              offset,
              active: "true",
              archived: "false",
              closed: "false",
              order: "volume24hr",
              ascending: "false",
            },
          }
        : {
            url: proxiedUrl,
            method: "GET" as const,
            params: {
              limit,
              offset,
              active: "true",
              archived: "false",
              closed: "false",
              order: "volume24hr",
              ascending: "false",
            },
          };

      const response = await request<PMGammaEventsResponse>(requestConfig);

      if (!response?.data || !Array.isArray(response.data)) {
        break;
      }

      // Process each event
      for (const event of response.data) {
        // Only process events with orderbook enabled
        if (
          !event.enableOrderBook ||
          !event.markets ||
          event.markets.length === 0
        ) {
          continue;
        }

        // Process each market in the event
        for (const market of event.markets) {
          // Skip if market doesn't have orderbook enabled or isn't accepting orders
          if (!market.enableOrderBook || !market.acceptingOrders) {
            continue;
          }

          // Parse outcomes and prices
          let outcomes: string[] = [];
          let prices: string[] = [];

          try {
            outcomes = JSON.parse(market.outcomes || "[]");
            prices = JSON.parse(market.outcomePrices || "[]");
          } catch {
            continue; // Skip if can't parse outcomes/prices
          }

          // Parse CLOB token IDs
          let tokenIds: string[] = [];
          try {
            tokenIds = JSON.parse(market.clobTokenIds || "[]");
          } catch {
            continue; // Skip if can't parse token IDs
          }

          // Create a market entry for each outcome (YES/NO)
          outcomes.forEach((outcome, index) => {
            const tokenId = tokenIds[index];
            if (!tokenId) return;

            // Use event ticker or slug for cleaner symbols
            const baseSymbol =
              event.ticker || event.slug || market.slug || "MARKET";
            const symbol = `${baseSymbol}-${outcome}`
              .toUpperCase()
              .replace(/[^A-Z0-9-]/g, "");

            markets[symbol] = {
              id: tokenId,
              exchange: ExchangeName.POLYMARKET,
              symbol,
              base: outcome,
              quote: "USDC",
              active: event.active && market.active,
              precision: {
                amount: 0.001, // orderPriceMinTickSize from response
                price: 0.001,
              },
              limits: {
                amount: {
                  min: 5, // orderMinSize from response
                  max: Infinity,
                  maxMarket: Infinity,
                },
                leverage: {
                  min: 1,
                  max: 1,
                },
              },
              // Store additional metadata
              metadata: {
                question: market.question,
                endDate: market.endDate,
                price: parseFloat(prices[index] || "0"),
                volume24hr: market.volume24hr,
                liquidity: market.liquidityClob,
                spread: market.spread,
              },
            } as Market & { metadata: any };
          });
        }
      }

      // Check if there are more pages
      hasMore = response.data.length === limit;
      offset += limit;
    }

    return markets;
  } catch {
    // Error fetching markets logged in worker
    return {};
  }
};

export const fetchPMMarketById = async (
  config: ExchangeConfig,
  marketId: string,
): Promise<{
  markets: Record<string, Market>;
  tickers: Record<string, Ticker>;
}> => {
  try {
    // Use Gamma Markets API with id query parameter per docs
    const baseUrl = `${PM_CONFIG.PUBLIC_API_URL}${PM_ENDPOINTS.PUBLIC.MARKETS}`; // /markets
    const proxiedUrl = getApiUrl(baseUrl, config);

    const requestConfig = config.options?.corsProxy?.useLocalProxy
      ? {
          url: proxiedUrl,
          originalUrl: baseUrl,
          method: "GET" as const,
          params: { id: marketId },
        }
      : { url: proxiedUrl, method: "GET" as const, params: { id: marketId } };

    const response = await request<any>(requestConfig);

    // Response should be an array of markets
    const marketData = Array.isArray(response)
      ? response[0]
      : Array.isArray(response?.data)
        ? response.data[0]
        : response;

    if (!marketData || !marketData.enableOrderBook) {
      return { markets: {}, tickers: {} };
    }

    const event = marketData.event || {};
    const market = marketData;

    let outcomes: string[] = [];
    let prices: string[] = [];
    let tokenIds: string[] = [];
    try {
      outcomes = JSON.parse(market.outcomes || "[]");
      prices = JSON.parse(market.outcomePrices || "[]");
      tokenIds = JSON.parse(market.clobTokenIds || "[]");
    } catch {
      // ignore parse errors
    }

    const markets: Record<string, Market> = {};
    const tickers: Record<string, Ticker> = {};

    outcomes.forEach((outcome, idx) => {
      const tokenId = tokenIds[idx];
      if (!tokenId) return;
      const baseSymbol = event.ticker || event.slug || market.slug || "MARKET";
      const symbol = `${baseSymbol}-${outcome}`
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "");
      const price = parseFloat(prices[idx] || "0");
      const spread = market.spread || 0.001;

      markets[symbol] = {
        id: tokenId,
        exchange: ExchangeName.POLYMARKET,
        symbol,
        base: outcome,
        quote: "USDC",
        active: market.active,
        precision: { amount: 0.001, price: 0.001 },
        limits: {
          amount: { min: 5, max: Infinity, maxMarket: Infinity },
          leverage: { min: 1, max: 1 },
        },
      } as Market;

      tickers[symbol] = {
        id: tokenId,
        exchange: ExchangeName.POLYMARKET,
        symbol,
        cleanSymbol: symbol,
        bid: Math.max(0, price - spread / 2),
        ask: Math.min(1, price + spread / 2),
        last: price,
        mark: price,
        index: price,
        percentage: 0,
        openInterest: 0,
        fundingRate: 0,
        volume: market.volume24hr || 0,
        quoteVolume: market.volume24hr || 0,
      };
    });

    return { markets, tickers };
  } catch {
    return { markets: {}, tickers: {} };
  }
};

export const fetchPMTickers = async (
  config: ExchangeConfig,
  markets: Record<string, Market>,
) => {
  const tickers: Record<string, Ticker> = {};

  // First, use metadata from markets if available
  for (const [symbol, market] of Object.entries(markets)) {
    const metadata = (market as any).metadata;

    if (metadata?.price !== undefined) {
      // Use price from metadata as initial ticker data
      const price = metadata.price;
      const spread = metadata.spread || 0.001;

      tickers[symbol] = {
        id: market.id,
        exchange: ExchangeName.POLYMARKET,
        symbol,
        cleanSymbol: symbol,
        bid: Math.max(0, price - spread / 2),
        ask: Math.min(1, price + spread / 2),
        last: price,
        mark: price,
        index: price,
        percentage: 0,
        openInterest: 0,
        fundingRate: 0,
        volume: metadata.volume24hr || 0,
        quoteVolume: metadata.volume24hr || 0,
      };
    }
  }

  // Then fetch real-time bid/ask for top markets (limit to 20 for performance)
  const marketEntries = Object.entries(markets)
    .filter(([symbol]) => !tickers[symbol]) // Skip if already have ticker
    .slice(0, 20);

  const batchSize = 5;

  for (let i = 0; i < marketEntries.length; i += batchSize) {
    const batch = marketEntries.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async ([symbol, market]) => {
        try {
          // Get bid and ask prices from CLOB API
          const priceUrl = `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PUBLIC.PRICE}`;

          const [bidResponse, askResponse] = await Promise.all([
            request<{ price: string }>({
              url: priceUrl,
              method: "GET",
              params: { token_id: market.id, side: "buy" },
            }),
            request<{ price: string }>({
              url: priceUrl,
              method: "GET",
              params: { token_id: market.id, side: "sell" },
            }),
          ]);

          const bid = parseFloat(bidResponse.price || "0");
          const ask = parseFloat(askResponse.price || "0");
          const mid = (bid + ask) / 2;

          tickers[symbol] = {
            id: market.id,
            exchange: ExchangeName.POLYMARKET,
            symbol,
            cleanSymbol: symbol,
            bid,
            ask,
            last: mid,
            mark: mid,
            index: mid,
            percentage: 0,
            openInterest: 0,
            fundingRate: 0,
            volume: 0,
            quoteVolume: 0,
          };
        } catch {
          // Create default ticker if API call fails
          tickers[symbol] = {
            id: market.id,
            exchange: ExchangeName.POLYMARKET,
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
      }),
    );
  }

  // Fill in default tickers for any remaining markets
  for (const [symbol, market] of Object.entries(markets)) {
    if (!tickers[symbol]) {
      tickers[symbol] = {
        id: market.id,
        exchange: ExchangeName.POLYMARKET,
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

  return tickers;
};

export const fetchPMUserAccount = async ({
  account,
  codexSdk,
}: {
  config: ExchangeConfig;
  account: Account;
  codexSdk?: any; // Codex SDK instance
}) => {
  let freeBalance = 0;
  let totalValue = 0;
  let positions: any[] = [];

  try {
    // Get on-chain USDC balance using Codex SDK
    if (codexSdk && account.walletAddress) {
      const balanceData = await codexSdk.getTokenBalances({
        walletAddress: account.walletAddress,
        tokenAddresses: ["0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"], // USDC on Polygon
      });

      if (balanceData && balanceData.length > 0) {
        freeBalance = parseFloat(balanceData[0].balance || "0");
      }
    }

    // Get Polymarket account value from data API (if wallet address is available)
    if (account.walletAddress) {
      const dataApiUrl = "https://data-api.polymarket.com";

      const valueUrl = `${dataApiUrl}${PM_ENDPOINTS.DATA.VALUE}`;
      const valueResponse = await request<{ user: string; value: number }[]>({
        url: valueUrl,
        method: "GET",
        params: { user: account.walletAddress },
      });

      if (valueResponse && valueResponse.length > 0) {
        totalValue = valueResponse[0].value;
      }

      // Get Polymarket positions from data API
      const positionsUrl = `${dataApiUrl}${PM_ENDPOINTS.DATA.POSITIONS}`;
      const positionsResponse = await request<any[]>({
        url: positionsUrl,
        method: "GET",
        params: {
          user: account.walletAddress,
          limit: 100,
        },
      });

      positions = positionsResponse || [];
    }
  } catch {
    // If API calls fail, return default values
  }

  return {
    balance: {
      used: Math.max(0, totalValue - freeBalance), // Estimated used balance
      free: freeBalance,
      total: freeBalance + totalValue,
      upnl: totalValue, // Positions value as unrealized PnL
    },
    positions,
  };
};

export const fetchPMUserOrders = async ({
  config,
  account,
  clobCredentials,
}: {
  config: ExchangeConfig;
  account: Account;
  clobCredentials?: {
    apiKey: string;
    secret: string;
    passphrase: string;
  } | null;
}) => {
  if (!clobCredentials) {
    return [];
  }

  // Sign the clean path without query parameters (like official client)
  const cleanPath = PM_ENDPOINTS.PRIVATE.ORDERS; // "/data/orders"

  const headers = await createL2AuthHeaders(
    account,
    "GET",
    cleanPath, // Sign clean path without query string
    undefined, // no body for GET
    undefined, // use default timestamp
    clobCredentials, // Pass CLOB credentials
  );

  // Use next_cursor parameter like official client (not signature_type in params)
  const queryParams = {
    next_cursor: "MA==", // INITIAL_CURSOR from official client
  };

  const response = await request<any>({
    url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.ORDERS}`,
    method: "GET",
    headers,
    params: queryParams,
  });

  // Handle different response structures
  let orders: any[];
  if (Array.isArray(response)) {
    orders = response;
  } else if (Array.isArray(response?.data)) {
    orders = response.data;
  } else if (response?.data) {
    orders = [];
  } else {
    orders = [];
  }

  // Transform the orders into the expected format with all required Order fields
  return orders.map((order: any) => ({
    id: order.id || order.order_id,
    exchange: ExchangeName.POLYMARKET,
    accountId: account.id,
    symbol: order.asset_id || order.market,
    type: OrderType.Limit,
    side: order.side === "BUY" ? OrderSide.Buy : OrderSide.Sell,
    amount: parseFloat(order.original_size || order.size || "0"),
    price: parseFloat(order.price || "0"),
    filled: parseFloat(order.size_matched || "0"),
    remaining:
      parseFloat(order.original_size || order.size || "0") -
      parseFloat(order.size_matched || "0"),
    status: OrderStatus.Open,
    reduceOnly: false,
    timestamp: new Date(order.created_at).getTime(),
  }));
};

export const fetchPMUserOrderHistory = async ({
  config,
  account,
  clobCredentials,
}: {
  config: ExchangeConfig;
  account: Account;
  clobCredentials?: {
    apiKey: string;
    secret: string;
    passphrase: string;
  } | null;
}) => {
  if (!clobCredentials) {
    return [];
  }

  // Use /data/trades endpoint for trade history (matches official Python client)
  const tradesEndpoint = PM_ENDPOINTS.PRIVATE.TRADES; // "/data/trades"

  const headers = await createL2AuthHeaders(
    account,
    "GET",
    tradesEndpoint,
    undefined,
    undefined,
    clobCredentials,
  );

  const tradesUrl = `${config.PRIVATE_API_URL}${tradesEndpoint}`;

  const response = await request<any>({
    url: tradesUrl,
    method: "GET",
    headers,
  });

  // Handle different response structures
  let trades: any[];
  if (Array.isArray(response)) {
    trades = response;
  } else if (Array.isArray(response?.data)) {
    trades = response.data;
  } else {
    trades = [];
  }

  return trades.map((trade) => mapPMFill(trade, trade.asset_id));
};

export const fetchPMPositions = async ({
  account,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  // For MetaMask users, positions are ONLY in the Polymarket proxy/funder wallet
  const funderAddress =
    (account as any).funderAddress || (account as any).proxyAddress;

  if (!funderAddress) {
    return [];
  }

  // Use Data API directly with the funder address (Polymarket proxy wallet)
  const dataApiUrl = "https://data-api.polymarket.com";
  const dataApiEndpoint = `${dataApiUrl}/positions`;

  const response = await request<any[]>({
    url: dataApiEndpoint,
    method: "GET",
    params: {
      user: funderAddress,
      limit: 100,
    },
  });

  if (!Array.isArray(response)) {
    return [];
  }

  return response.map((position) => {
    const positionSize = parseFloat(position.size || "0");
    const avgPrice = parseFloat(position.average_price || "0");
    const markPrice = parseFloat(position.current_price || avgPrice || "0");

    return {
      exchange: ExchangeName.POLYMARKET,
      accountId: account.id,
      symbol:
        position.market || position.asset_id || position.question || "UNKNOWN",
      side: PositionSide.Long,
      entryPrice: avgPrice,
      notional: positionSize * markPrice,
      leverage: 1,
      upnl: parseFloat(position.unrealized_pnl || "0"),
      rpnl: parseFloat(position.realized_pnl || "0"),
      contracts: positionSize,
      liquidationPrice: 0,
    };
  });
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
      PM_ENDPOINTS.PRIVATE.ORDER,
      JSON.stringify(orderPayload),
    );

    // Place the order
    const response = await request<PMApiResponse<{ orderId: string }>>({
      url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.ORDER}`,
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
    // Use /order endpoint with DELETE method (matches official Python client)
    const headers = await createL2AuthHeaders(
      account,
      "DELETE",
      PM_ENDPOINTS.PRIVATE.CANCEL, // This is now "/order"
      JSON.stringify(payload),
    );

    const result = await request<
      PMApiResponse<{
        orderId: string;
      }>
    >({
      url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.CANCEL}`,
      method: "DELETE",
      headers: {
        ...headers,
      },
      body: payload,
    });

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

  const result = await request<
    PMApiResponse<{
      cancelled: number;
    }>
  >({
    url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.CANCEL_ALL}`,
    method: "DELETE",
    headers: {
      ...headers,
    },
  });

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
  // Use PRIVATE API URL with /book endpoint (matches official Python client)
  const response = await request<PMOrderBook>({
    url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.ORDER_BOOK}`,
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

// Map standard timeframes to Polymarket-supported intervals and fidelity
const mapTimeframeToPolymarket = (
  timeframe: string,
): { interval: string; fidelity?: number } => {
  const mapping: Record<string, { interval: string; fidelity?: number }> = {
    // Exact matches to Polymarket intervals
    "1m": { interval: "1m", fidelity: 1 },
    "1h": { interval: "1h", fidelity: 60 },
    "6h": { interval: "6h", fidelity: 360 },
    "1d": { interval: "1d", fidelity: 1440 },
    "1w": { interval: "1w", fidelity: 10080 },

    // Custom fidelity mappings for unsupported intervals
    "5m": { interval: "1h", fidelity: 5 },
    "15m": { interval: "1h", fidelity: 15 },
    "30m": { interval: "1h", fidelity: 30 },
    "2h": { interval: "6h", fidelity: 120 },
    "4h": { interval: "6h", fidelity: 240 },
    "12h": { interval: "1d", fidelity: 720 },
    "3d": { interval: "1w", fidelity: 4320 },
    "7d": { interval: "1w", fidelity: 10080 },
  };

  return mapping[timeframe] || { interval: "1d", fidelity: 1440 }; // Default to 1d
};

export const fetchPMOHLCV = async ({
  config,
  params,
  markets,
}: {
  config: ExchangeConfig;
  params: FetchOHLCVParams;
  markets: Record<string, Market>;
}) => {
  // Find the market to get the token_id
  const market = markets[params.symbol];
  if (!market) {
    throw new Error(`Market not found for symbol: ${params.symbol}`);
  }

  const { interval, fidelity } = mapTimeframeToPolymarket(params.timeframe);

  const queryParams: Record<string, string | number> = {
    market: market.id, // Use CLOB token ID
    interval,
  };

  // Add fidelity for data resolution if specified
  if (fidelity) {
    queryParams.fidelity = fidelity;
  }

  // Add time range parameters if specified
  if (params.from) {
    queryParams.startTs = Math.floor(params.from / 1000); // Convert to Unix timestamp
  }
  if (params.to) {
    queryParams.endTs = Math.floor(params.to / 1000); // Convert to Unix timestamp
  }

  // Use CLOB API for price history (not proxy needed as it supports CORS)
  const response = await request<PMPriceHistoryResponse>({
    url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PUBLIC.CANDLES}`,
    method: "GET",
    params: queryParams,
  });

  // Convert price history to approximate OHLCV candles
  // Since we only have price points, we'll use the same price for OHLC
  const candles: Candle[] = response.history.map((point) => ({
    symbol: params.symbol,
    timeframe: params.timeframe,
    timestamp: point.t,
    open: point.p,
    high: point.p,
    low: point.p,
    close: point.p,
    volume: 0, // Volume not available in price history
  }));

  return candles.sort((a, b) => a.timestamp - b.timestamp);
};
