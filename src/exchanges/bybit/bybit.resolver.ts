import { bybit } from "./bybit.api";
import { BYBIT_API, INTERVAL } from "./bybit.config";
import type {
  BybitBalance,
  BybitInstrument,
  BybitOrder,
  BybitPosition,
  BybitTicker,
} from "./bybit.types";
import {
  getHedgedOrderPositionIdx,
  mapBybitBalance,
  mapBybitOrder,
  mapBybitPosition,
  mapBybitTicker,
} from "./bybit.utils";

import { retry } from "~/utils/retry.utils";
import {
  OrderType,
  type Account,
  type Candle,
  type Market,
  type Order,
  type PlaceOrderOpts,
  type Position,
  type Ticker,
  type FetchOHLCVParams,
  ExchangeName,
} from "~/types/lib.types";
import { omitUndefined } from "~/utils/omit-undefined.utils";
import { orderBy } from "~/utils/order-by.utils";
import { adjust } from "~/utils/safe-math.utils";
import { stringify } from "~/utils/query-string.utils";

export const fetchBybitMarkets = async () => {
  const response = await retry(() =>
    fetch(
      `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.MARKETS}?category=linear&limit=1000`,
    ),
  );

  const {
    result: { list },
  }: { result: { list: BybitInstrument[] } } = await response.json();

  const markets: Record<string, Market> = list.reduce(
    (acc, market) => {
      if (market.quoteCoin !== "USDT") return acc;
      if (market.contractType !== "LinearPerpetual") return acc;

      acc[market.symbol] = {
        id: market.symbol,
        exchange: ExchangeName.BYBIT,
        symbol: market.symbol,
        base: market.baseCoin,
        quote: market.quoteCoin,
        active: market.status === "Trading",
        precision: {
          amount: parseFloat(market.lotSizeFilter.qtyStep),
          price: parseFloat(market.priceFilter.tickSize),
        },
        limits: {
          amount: {
            min: parseFloat(market.lotSizeFilter.minOrderQty),
            max: parseFloat(market.lotSizeFilter.maxOrderQty),
            maxMarket: parseFloat(market.lotSizeFilter.maxMktOrderQty),
          },
          leverage: {
            min: parseFloat(market.leverageFilter.minLeverage),
            max: parseFloat(market.leverageFilter.maxLeverage),
          },
        },
      };

      return acc;
    },
    {} as { [key: string]: Market },
  );

  return markets;
};

export const fetchBybitTickers = async (markets?: Record<string, Market>) => {
  const response = await retry(() =>
    fetch(
      `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.TICKERS}?category=linear&limit=1000`,
    ),
  );

  const {
    result: { list },
  }: { result: { list: BybitTicker[] } } = await response.json();

  const tickers: Record<string, Ticker> = list.reduce(
    (acc, t) => {
      if (markets && markets[t.symbol] === undefined) return acc;

      const ticker = mapBybitTicker(t);
      acc[ticker.symbol] = ticker;

      return acc;
    },
    {} as Record<string, Ticker>,
  );

  return tickers;
};

export const fetchBybitBalance = async ({
  key,
  secret,
}: {
  key: string;
  secret: string;
}) => {
  const json = await bybit<{ result: { list: BybitBalance[] } }>({
    key,
    secret,
    url: `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.BALANCE}`,
    params: { accountType: "UNIFIED" },
    retries: 3,
  });

  const [firstAccount] = json.result.list || [];
  return mapBybitBalance(firstAccount);
};

export const fetchBybitPositions = async (account: Account) => {
  const json = await bybit<{ result: { list: BybitPosition[] } }>({
    key: account.apiKey,
    secret: account.apiSecret,
    url: `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.POSITIONS}`,
    params: { category: "linear", settleCoin: "USDT", limit: 200 },
    retries: 3,
  });

  const positions: Position[] = json.result.list.map((p) =>
    mapBybitPosition({ position: p, accountId: account.id }),
  );

  return positions;
};

export const fetchBybitOrders = async (account: Account) => {
  const recursiveFetch = async (
    cursor: string = "",
    orders: BybitOrder[] = [],
  ) => {
    const json = await bybit<{
      result: { list: BybitOrder[]; nextPageCursor?: string };
    }>({
      key: account.apiKey,
      secret: account.apiSecret,
      url: `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.ORDERS}`,
      params: {
        category: "linear",
        settleCoin: "USDT",
        openOnly: 0,
        limit: 50,
        cursor,
      },
      retries: 3,
    });

    const ordersList = Array.isArray(json.result.list) ? json.result.list : [];

    if (ordersList.length !== 50) {
      return orders.concat(ordersList);
    }

    if (json.result.nextPageCursor) {
      return recursiveFetch(
        json.result.nextPageCursor,
        orders.concat(ordersList),
      );
    }

    return ordersList;
  };

  const bybitOrders: BybitOrder[] = await recursiveFetch();
  const orders: Order[] = bybitOrders.flatMap((o) =>
    mapBybitOrder({ accountId: account.id, order: o }),
  );

  return orders;
};

export const fetchBybitOHLCV = async (opts: FetchOHLCVParams) => {
  const limit = Math.min(opts.limit || 500, 1000);
  const interval = INTERVAL[opts.timeframe];

  const params = omitUndefined({
    category: "linear",
    symbol: opts.symbol,
    start: opts.from,
    end: opts.to,
    interval,
    limit,
  });

  const response = await retry(() =>
    fetch(
      `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.KLINE}?${stringify(params)}`,
    ),
  );

  const {
    result: { list },
  }: { result: { list: string[][] } } = await response.json();

  const candles: Candle[] = list.map(
    ([time, open, high, low, close, , volume]) => ({
      symbol: opts.symbol,
      timeframe: opts.timeframe,
      timestamp: parseFloat(time) / 1000,
      open: parseFloat(open),
      high: parseFloat(high),
      low: parseFloat(low),
      close: parseFloat(close),
      volume: parseFloat(volume),
    }),
  );

  return orderBy(candles, ["timestamp"], ["asc"]);
};

export const createBybitTradingStop = async ({
  order,
  market,
  ticker,
  account,
  isHedged,
}: {
  order: PlaceOrderOpts;
  market: Market;
  ticker: Ticker;
  account: Account;
  isHedged?: boolean;
}) => {
  const price = adjust(order.price ?? 0, market.precision.price);
  const body: Record<string, any> = {
    category: "linear",
    symbol: order.symbol,
    tpslMode: "Full",
    tpExchangeOrderType: "Market",
    slOrderType: "Market",
    positionIdx: isHedged ? getHedgedOrderPositionIdx(order) : 0,
  };

  if (order.type === OrderType.StopLoss) {
    body.stopLoss = `${price}`;
    body.slTriggerBy = "MarkPrice";
  }

  if (order.type === OrderType.TakeProfit) {
    body.takeProfit = `${price}`;
    body.tpTriggerBy = "LastPrice";
  }

  if (order.type === OrderType.TrailingStopLoss) {
    const distance = adjust(
      Math.max(ticker.last, price) - Math.min(ticker.last, price),
      market.precision.price,
    );

    body.trailingStop = `${distance}`;
  }

  const response = await bybit<{ retCode: number; retMsg: string }>({
    url: `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.TRADING_STOP}`,
    method: "POST",
    body,
    key: account.apiKey,
    secret: account.apiSecret,
  });

  if (response.retCode !== 0) {
    // TODO: Log error
    // use memory store for that as well ?
  }
};
