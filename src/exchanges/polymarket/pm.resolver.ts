import { PM_ENDPOINTS } from "./pm.config";
import type {
  PMMarket,
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

export const fetchPMMarkets = async (config: ExchangeConfig) => {
  const response = await request<PMMarket[]>({
    url: `${config.PUBLIC_API_URL}${PM_ENDPOINTS.PUBLIC.MARKETS}`,
    method: "GET",
  });

  const markets: Record<string, Market> = {};

  response.forEach((market) => {
    const marketData = mapPMMarket(market);
    Object.assign(markets, marketData);
  });

  return markets;
};

export const fetchPMTickers = async (
  config: ExchangeConfig,
  markets: Record<string, Market>,
) => {
  const tickers: Record<string, Ticker> = {};

  // Fetch tickers for each market token
  for (const [symbol, market] of Object.entries(markets)) {
    try {
      const response = await request<PMTicker>({
        url: `${config.PUBLIC_API_URL}${PM_ENDPOINTS.PUBLIC.TICKER}`,
        method: "GET",
        params: { token_id: market.id },
      });

      const ticker = mapPMTicker(response, {
        token_id: market.id.toString(),
        outcome: market.base,
        price: response.price,
        ticker: symbol,
      });

      tickers[symbol] = ticker;
    } catch {
      // Silently skip failed ticker fetches
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
    url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.BALANCE}`,
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
    url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.ORDERS}`,
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
    url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.ORDER_HISTORY}`,
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
    url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.POSITIONS}`,
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
      url: `${config.PRIVATE_API_URL}${PM_ENDPOINTS.PRIVATE.ORDERS}`,
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
    url: `${config.PUBLIC_API_URL}${PM_ENDPOINTS.PUBLIC.ORDER_BOOK}`,
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
    url: `${config.PUBLIC_API_URL}${PM_ENDPOINTS.PUBLIC.CANDLES}`,
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
