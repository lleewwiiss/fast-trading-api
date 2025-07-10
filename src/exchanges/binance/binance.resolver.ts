import { binance } from "./binance.api";
import { BINANCE_ENDPOINTS, INTERVAL } from "./binance.config";
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
  ExchangeName,
  type ExchangeConfig,
} from "~/types/lib.types";
import { omitUndefined } from "~/utils/omit-undefined.utils";
import { orderBy } from "~/utils/order-by.utils";
import { stringify } from "~/utils/query-string.utils";

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
  const json = await binance<BinanceBalance[]>({
    key: account.apiKey,
    secret: account.apiSecret,
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.BALANCE}`,
    params: {},
    retries: 3,
  });

  return mapBinanceBalance(json);
};

export const fetchBinancePositions = async ({
  account,
  config,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const json = await binance<BinancePosition[]>({
    key: account.apiKey,
    secret: account.apiSecret,
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.POSITIONS}`,
    params: {},
    retries: 3,
  });

  const positions: Position[] = json
    .map((p) => mapBinancePosition({ position: p, accountId: account.id }))
    .filter((p): p is Position => p !== null);

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
  const json = await binance<BinancePosition[]>({
    key: account.apiKey,
    secret: account.apiSecret,
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.POSITIONS}`,
    params: { symbol },
    retries: 3,
  });

  const positions: Position[] = json
    .map((p) => mapBinancePosition({ position: p, accountId: account.id }))
    .filter((p): p is Position => p !== null);

  return positions;
};

export const fetchBinanceOrders = async ({
  account,
  config,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const json = await binance<BinanceOrder[]>({
    key: account.apiKey,
    secret: account.apiSecret,
    url: `${config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.OPEN_ORDERS}`,
    params: {},
    retries: 3,
  });

  const orders: Order[] = json.map((o) =>
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
