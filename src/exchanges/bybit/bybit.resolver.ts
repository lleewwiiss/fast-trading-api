import { bybit } from "./bybit.api";
import { BYBIT_API } from "./bybit.config";
import type {
  BybitBalance,
  BybitInstrument,
  BybitOrder,
  BybitPosition,
  BybitTicker,
} from "./bybit.types";
import {
  mapBybitBalance,
  mapBybitOrder,
  mapBybitPosition,
  mapBybitTicker,
} from "./bybit.utils";

import type {
  ExchangeMarket,
  ExchangeOrder,
  ExchangePosition,
  ExchangeTicker,
} from "~/types";

export const fetchBybitMarkets = async () => {
  const response = await fetch(
    `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.MARKETS}?category=linear&limit=1000`,
  );

  const {
    result: { list },
  }: { result: { list: BybitInstrument[] } } = await response.json();

  const markets: Record<string, ExchangeMarket> = list.reduce(
    (acc, market) => {
      if (market.quoteCoin !== "USDT") return acc;
      if (market.contractType !== "LinearPerpetual") return acc;

      acc[market.symbol] = {
        id: market.symbol,
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
    {} as { [key: string]: ExchangeMarket },
  );

  return markets;
};

export const fetchBybitTickers = async (
  markets: Record<string, ExchangeMarket>,
) => {
  const response = await fetch(
    `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.TICKERS}?category=linear&limit=1000`,
  );

  const {
    result: { list },
  }: { result: { list: BybitTicker[] } } = await response.json();

  const tickers: Record<string, ExchangeTicker> = list.reduce(
    (acc, t) => {
      if (markets[t.symbol] === undefined) return acc;

      const ticker = mapBybitTicker(t);
      acc[ticker.symbol] = ticker;

      return acc;
    },
    {} as Record<string, ExchangeTicker>,
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

export const fetchBybitPositions = async ({
  key,
  secret,
}: {
  key: string;
  secret: string;
}) => {
  const json = await bybit<{ result: { list: BybitPosition[] } }>({
    key,
    secret,
    url: `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.POSITIONS}`,
    params: {
      category: "linear",
      settleCoin: "USDT",
      limit: 200,
    },
  });

  const positions: ExchangePosition[] = json.result.list.map(mapBybitPosition);
  return positions;
};

export const fetchBybitOrders = async ({
  key,
  secret,
}: {
  key: string;
  secret: string;
}) => {
  const recursiveFetch = async (
    cursor: string = "",
    orders: BybitOrder[] = [],
  ) => {
    const json = await bybit<{
      result: { list: BybitOrder[]; nextPageCursor?: string };
    }>({
      key,
      secret,
      url: `${BYBIT_API.BASE_URL}${BYBIT_API.ENDPOINTS.ORDERS}`,
      params: {
        category: "linear",
        settleCoin: "USDT",
        openOnly: 0,
        limit: 50,
        cursor,
      },
    });

    const ordersList = Array.isArray(json.result.list) ? json.result.list : [];

    if (ordersList.length === 0) {
      return orders;
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
  const orders: ExchangeOrder[] = bybitOrders.flatMap(mapBybitOrder);

  return orders;
};
