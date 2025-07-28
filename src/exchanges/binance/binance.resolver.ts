import { binance } from "./binance.api";
import {
  BINANCE_ENDPOINTS,
  INTERVAL,
  ORDER_SIDE_INVERSE,
} from "./binance.config";
import type {
  BinanceBalance,
  BinanceInstrument,
  BinanceOrder,
  BinancePosition,
  BinanceTicker,
  BinanceBookTicker,
  BinancePremiumIndex,
  BinanceKline,
  BinanceLeverageBracket,
} from "./binance.types";
import {
  mapBinanceBalance,
  mapBinanceOrder,
  mapBinancePosition,
  mapBinanceTicker,
  mapBinanceKline,
  mapBinanceFill,
  getPositionSide,
} from "./binance.utils";

import { retry } from "~/utils/retry.utils";
import {
  type Account,
  type Candle,
  type Fill,
  type Market,
  type Order,
  type Position,
  type Ticker,
  type FetchOHLCVParams,
  type PlaceOrderOpts,
  ExchangeName,
  OrderType,
  type ExchangeConfig,
} from "~/types/lib.types";
import { omitUndefined } from "~/utils/omit-undefined.utils";
import { orderBy } from "~/utils/order-by.utils";
import { stringify } from "~/utils/query-string.utils";
import { adjust } from "~/utils/safe-math.utils";

export const fetchBinanceMarkets = async (config: ExchangeConfig) => {
  const response = await retry(() =>
    fetch(`${config.PUBLIC_API_URL}${BINANCE_ENDPOINTS.PUBLIC.MARKETS}`),
  );

  const { symbols }: { symbols: BinanceInstrument[] } = await response.json();

  const leverageResponse = await retry(() =>
    fetch(
      `${config.PUBLIC_API_URL}${BINANCE_ENDPOINTS.PRIVATE.LEVERAGE_BRACKET}`,
    ),
  );

  const leverageBrackets: BinanceLeverageBracket[] =
    await leverageResponse.json();

  const markets: Record<string, Market> = symbols.reduce(
    (acc, instrument) => {
      if (instrument.contractType !== "PERPETUAL") return acc;
      if (instrument.marginAsset !== "USDT") return acc;
      if (instrument.status !== "TRADING") return acc;

      const priceFilter = instrument.filters.find(
        (f) => f.filterType === "PRICE_FILTER",
      );
      const lotSizeFilter = instrument.filters.find(
        (f) => f.filterType === "LOT_SIZE",
      );
      const marketLotSizeFilter = instrument.filters.find(
        (f) => f.filterType === "MARKET_LOT_SIZE",
      );

      const leverageBracket = leverageBrackets.find(
        (b) => b.symbol === instrument.symbol,
      );

      if (!priceFilter || !lotSizeFilter || !leverageBracket) return acc;

      acc[instrument.symbol] = {
        id: instrument.symbol,
        exchange: ExchangeName.BINANCE,
        symbol: instrument.symbol,
        base: instrument.baseAsset,
        quote: instrument.quoteAsset,
        active: instrument.status === "TRADING",
        precision: {
          amount: parseFloat(lotSizeFilter.stepSize!),
          price: parseFloat(priceFilter.tickSize!),
        },
        limits: {
          amount: {
            min: parseFloat(lotSizeFilter.minQty!),
            max: parseFloat(lotSizeFilter.maxQty!),
            maxMarket: parseFloat(
              marketLotSizeFilter?.maxQty || lotSizeFilter.maxQty!,
            ),
          },
          leverage: {
            min: leverageBracket.brackets[0]?.initialLeverage || 1,
            max: Math.max(
              ...leverageBracket.brackets.map((b) => b.initialLeverage),
            ),
          },
        },
      };

      return acc;
    },
    {} as { [key: string]: Market },
  );

  return markets;
};

export const fetchBinanceTickers = async ({
  config,
  markets,
}: {
  config: ExchangeConfig;
  markets?: Record<string, Market>;
}) => {
  const [ticker24hResponse, bookTickerResponse, premiumIndexResponse] =
    await Promise.all([
      retry(() =>
        fetch(
          `${config.PUBLIC_API_URL}${BINANCE_ENDPOINTS.PUBLIC.TICKERS_24H}`,
        ),
      ),
      retry(() =>
        fetch(
          `${config.PUBLIC_API_URL}${BINANCE_ENDPOINTS.PUBLIC.TICKERS_BOOK}`,
        ),
      ),
      retry(() =>
        fetch(
          `${config.PUBLIC_API_URL}${BINANCE_ENDPOINTS.PUBLIC.TICKERS_PRICE}`,
        ),
      ),
    ]);

  const [ticker24hData, bookTickerData, premiumIndexData] = await Promise.all([
    ticker24hResponse.json() as Promise<BinanceTicker[]>,
    bookTickerResponse.json() as Promise<BinanceBookTicker[]>,
    premiumIndexResponse.json() as Promise<BinancePremiumIndex[]>,
  ]);

  const tickers: Record<string, Ticker> = ticker24hData.reduce(
    (acc, ticker24h) => {
      if (markets && markets[ticker24h.symbol] === undefined) return acc;

      const bookTicker = bookTickerData.find(
        (bt) => bt.symbol === ticker24h.symbol,
      );
      const premiumIndex = premiumIndexData.find(
        (pi) => pi.symbol === ticker24h.symbol,
      );

      if (!bookTicker || !premiumIndex) return acc;

      const ticker = mapBinanceTicker(ticker24h, bookTicker, premiumIndex);
      acc[ticker.symbol] = ticker;

      return acc;
    },
    {} as Record<string, Ticker>,
  );

  return tickers;
};

export const fetchBinanceBalance = async ({
  config,
  account,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const response = await binance<BinanceBalance[] | any>({
    key: account.apiKey,
    secret: account.apiSecret,
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.BALANCE}`,
    params: {},
    retries: 3,
  });

  // Handle both array response and object response
  const balances = Array.isArray(response) ? response : response.data || [];
  return mapBinanceBalance(balances);
};

export const fetchBinancePositions = async ({
  account,
  config,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const response = await binance<BinancePosition[] | any>({
    key: account.apiKey,
    secret: account.apiSecret,
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.POSITIONS}`,
    params: {},
    retries: 3,
  });

  // Handle both array response and object response
  const positionsData = Array.isArray(response)
    ? response
    : response.data || [];
  const positions: Position[] = positionsData
    .map((p: BinancePosition) =>
      mapBinancePosition({ position: p, accountId: account.id }),
    )
    .filter((p: Position | null): p is Position => p !== null);

  return positions;
};

export const fetchBinanceSymbolPositions = async ({
  config,
  account,
  symbol,
}: {
  config: ExchangeConfig;
  account: Account;
  symbol: string;
}) => {
  const response = await binance<BinancePosition[] | any>({
    key: account.apiKey,
    secret: account.apiSecret,
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.POSITIONS}`,
    params: { symbol },
    retries: 3,
  });

  // Handle both array response and object response
  const positionsData = Array.isArray(response)
    ? response
    : response.data || [];
  const positions: Position[] = positionsData
    .map((p: BinancePosition) =>
      mapBinancePosition({ position: p, accountId: account.id }),
    )
    .filter((p: Position | null): p is Position => p !== null);

  return positions;
};

export const fetchBinanceOrders = async ({
  account,
  config,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const response = await binance<BinanceOrder[] | any>({
    key: account.apiKey,
    secret: account.apiSecret,
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.OPEN_ORDERS}`,
    params: {},
    retries: 3,
  });

  // Handle both array response and object response
  const ordersData = Array.isArray(response) ? response : response.data || [];
  const orders: Order[] = ordersData.map((o: BinanceOrder) =>
    mapBinanceOrder({ accountId: account.id, order: o }),
  );

  return orders;
};

export const fetchBinanceOrdersHistory = async ({
  config,
  account,
}: {
  config: ExchangeConfig;
  account: Account;
}): Promise<Fill[]> => {
  const recursiveFetch = async (
    fromId: number = 0,
    orders: BinanceOrder[] = [],
  ): Promise<BinanceOrder[]> => {
    const params: Record<string, string | number> = {
      limit: 1000,
    };

    if (fromId > 0) {
      params.orderId = fromId;
    }

    const response = await binance<BinanceOrder[]>({
      key: account.apiKey,
      secret: account.apiSecret,
      url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.ORDERS_HISTORY}`,
      params,
    });

    const ordersList = Array.isArray(response) ? response : [];
    const filledOrders = ordersList.filter(
      (order) => order.status === "FILLED" && parseFloat(order.executedQty) > 0,
    );

    if (ordersList.length < 1000 || filledOrders.length >= 250) {
      return orders.concat(filledOrders);
    }

    const lastOrderId = ordersList[ordersList.length - 1]?.orderId;
    if (lastOrderId && orders.length <= 250) {
      return recursiveFetch(lastOrderId + 1, orders.concat(filledOrders));
    }

    return orders.concat(filledOrders);
  };

  const binanceOrders: BinanceOrder[] = await recursiveFetch();
  const fills: Fill[] = binanceOrders.map(mapBinanceFill);

  return fills;
};

export const fetchBinanceOHLCV = async ({
  config,
  params,
}: {
  config: ExchangeConfig;
  params: FetchOHLCVParams;
}) => {
  const limit = Math.min(params.limit || 500, 1500);
  const interval = INTERVAL[params.timeframe];

  const urlParams = omitUndefined({
    symbol: params.symbol,
    interval,
    startTime: params.from,
    endTime: params.to,
    limit,
  });

  const response = await retry(() =>
    fetch(
      `${config.PUBLIC_API_URL}${BINANCE_ENDPOINTS.PUBLIC.KLINE}?${stringify(urlParams)}`,
    ),
  );

  const klineData: BinanceKline[] = await response.json();

  const candles: Candle[] = klineData.map((kline) => {
    const candle = mapBinanceKline(kline);
    candle.symbol = params.symbol;
    candle.timeframe = params.timeframe;
    return candle;
  });

  return orderBy(candles, ["timestamp"], ["asc"]);
};

export const setBinanceLeverage = async ({
  account,
  config,
  symbol,
  leverage,
}: {
  account: Account;
  config: ExchangeConfig;
  symbol: string;
  leverage: number;
}) => {
  const response = await binance<{ code: number; msg?: string }>({
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.SET_LEVERAGE}`,
    method: "POST",
    params: {
      symbol,
      leverage,
    },
    key: account.apiKey,
    secret: account.apiSecret,
  });

  if (response.code && response.code !== 200) {
    // TODO: Log error
  }

  return !response.code || response.code === 200;
};

export const createBinanceTradingStop = async ({
  order,
  market,
  ticker,
  account,
  config,
  isHedged,
}: {
  order: PlaceOrderOpts;
  market: Market;
  ticker: Ticker;
  account: Account;
  config: ExchangeConfig;
  isHedged?: boolean;
}) => {
  const price = adjust(order.price ?? 0, market.precision.price);
  const positionSide = isHedged ? getPositionSide(order) : "BOTH";
  const body: Record<string, any> = {
    symbol: order.symbol,
    side: ORDER_SIDE_INVERSE[order.side],
    quantity: `${adjust(order.amount, market.precision.amount)}`,
    reduceOnly: true,
    positionSide,
    workingType: "CONTRACT_PRICE",
    newOrderRespType: "RESULT",
  };

  if (order.type === OrderType.StopLoss) {
    body.type = "STOP_MARKET";
    body.stopPrice = `${price}`;
  }

  if (order.type === OrderType.TakeProfit) {
    body.type = "TAKE_PROFIT_MARKET";
    body.stopPrice = `${price}`;
  }

  if (order.type === OrderType.TrailingStopLoss) {
    const distance = adjust(
      Math.max(ticker.last, price) - Math.min(ticker.last, price),
      market.precision.price,
    );

    body.type = "TRAILING_STOP_MARKET";
    body.activationPrice = `${ticker.last}`;
    body.callbackRate = `${((distance / ticker.last) * 100).toFixed(2)}`;
  }

  const response = await binance<BinanceOrder>({
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.ORDER}`,
    method: "POST",
    params: body,
    key: account.apiKey,
    secret: account.apiSecret,
  });

  return response;
};

export const cancelSymbolBinanceOrders = async ({
  account,
  config,
  symbol,
}: {
  account: Account;
  config: ExchangeConfig;
  symbol: string;
}) => {
  const response = await binance<{ code: number; msg?: string }>({
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.CANCEL_ALL_ORDERS}`,
    method: "DELETE",
    params: {
      symbol,
    },
    key: account.apiKey,
    secret: account.apiSecret,
  });

  if (response.code && response.code !== 200) {
    // TODO: Log error
  }

  return !response.code || response.code === 200;
};

export const cancelAllBinanceOrders = async ({
  account,
  config,
}: {
  account: Account;
  config: ExchangeConfig;
}) => {
  const response = await binance<{ code: number; msg?: string }>({
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.CANCEL_ALL_ORDERS}`,
    method: "DELETE",
    params: {},
    key: account.apiKey,
    secret: account.apiSecret,
  });

  if (response.code && response.code !== 200) {
    // TODO: Log error
  }

  return !response.code || response.code === 200;
};
