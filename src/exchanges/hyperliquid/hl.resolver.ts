import { HL_ENDPOINTS } from "./hl.config";
import type {
  HLCandle,
  HLMetaAndAssetCtxs,
  HLUserAccount,
  HLUserOrder,
} from "./hl.types";

import { TICKER_REGEX } from "~/utils/regex.utils";
import {
  ExchangeName,
  PositionSide,
  type Position,
  type Account,
  type Balance,
  type ExchangeConfig,
  type Market,
  type Ticker,
  type Order,
  OrderStatus,
  OrderType,
  OrderSide,
  type FetchOHLCVParams,
  type Candle,
} from "~/types/lib.types";
import { request } from "~/utils/request.utils";
import { subtract } from "~/utils/safe-math.utils";
import { sumBy } from "~/utils/sum-by.utils";
import { omitUndefined } from "~/utils/omit-undefined.utils";
import { orderBy } from "~/utils/order-by.utils";

export const fetchHLMarketsAndTickers = async (config: ExchangeConfig) => {
  const [{ universe }, assets] = await request<HLMetaAndAssetCtxs>({
    url: `${config.PUBLIC_API_URL}${HL_ENDPOINTS.PUBLIC.INFO}`,
    method: "POST",
    body: {
      type: "metaAndAssetCtxs",
    },
  });

  const markets: Record<string, Market> = universe.reduce(
    (acc, market) => {
      const sizeDecimals = 10 / 10 ** (market.szDecimals + 1);
      const priceDecimals = 10 / 10 ** (6 - market.szDecimals + 1);

      acc[market.name] = {
        id: market.name,
        exchange: ExchangeName.HL,
        symbol: market.name,
        base: market.name,
        quote: "USDC",
        active: true,
        precision: {
          amount: sizeDecimals,
          price: priceDecimals,
        },
        limits: {
          amount: {
            min: sizeDecimals,
            max: Infinity,
            maxMarket: Infinity,
          },
          leverage: {
            min: 1,
            max: market.maxLeverage,
          },
        },
      };

      return acc;
    },
    {} as Record<string, Market>,
  );

  const tickers: Record<string, Ticker> = assets.reduce(
    (acc, t, idx) => {
      const last = t.midPx ? parseFloat(t.midPx) : 0;
      const prevDay = parseFloat(t.prevDayPx);
      const percentage = ((last - prevDay) / prevDay) * 100;
      const symbol = universe[idx].name;

      acc[symbol] = {
        id: symbol,
        exchange: ExchangeName.HL,
        symbol,
        cleanSymbol: symbol.replace(TICKER_REGEX, ""),
        bid: t.impactPxs ? parseFloat(t.impactPxs[0]) : 0,
        ask: t.impactPxs ? parseFloat(t.impactPxs[1]) : 0,
        last,
        mark: parseFloat(t.markPx),
        index: parseFloat(t.oraclePx),
        percentage,
        openInterest: parseFloat(t.openInterest),
        fundingRate: parseFloat(t.funding),
        volume: parseFloat(t.dayBaseVlm),
        quoteVolume: parseFloat(t.dayNtlVlm),
      };

      return acc;
    },
    {} as Record<string, Ticker>,
  );

  return {
    markets,
    tickers,
  };
};

export const fetchHLUserAccount = async ({
  config,
  account,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const response = await request<HLUserAccount>({
    url: `${config.PUBLIC_API_URL}${HL_ENDPOINTS.PUBLIC.INFO}`,
    method: "POST",
    body: {
      type: "clearinghouseState",
      user: account.apiKey,
    },
  });

  const positions: Position[] = response.assetPositions.map((p) => {
    const contracts = parseFloat(p.position.szi);

    return {
      accountId: account.id,
      exchange: ExchangeName.HL,
      symbol: p.position.coin,
      side: contracts > 0 ? PositionSide.Long : PositionSide.Short,
      entryPrice: parseFloat(p.position.entryPx),
      notional: parseFloat(p.position.positionValue),
      leverage: p.position.leverage.value,
      upnl: parseFloat(p.position.unrealizedPnl),
      rpnl: 0,
      contracts: Math.abs(contracts),
      liquidationPrice: parseFloat(p.position.liquidationPx),
      isHedged: p.type !== "oneWay",
    };
  });

  const used = parseFloat(response.crossMarginSummary.totalMarginUsed);
  const total = parseFloat(response.crossMarginSummary.accountValue);
  const free = subtract(total, used);
  const upnl = sumBy(positions, (p) => p.upnl);

  const balance: Balance = { used, free, total, upnl };

  return {
    balance,
    positions,
  };
};

export const fetchHLUserOrders = async ({
  config,
  account,
}: {
  config: ExchangeConfig;
  account: Account;
}) => {
  const response = await request<HLUserOrder[]>({
    url: `${config.PUBLIC_API_URL}${HL_ENDPOINTS.PUBLIC.INFO}`,
    method: "POST",
    body: {
      type: "frontendOpenOrders",
      user: account.apiKey,
    },
  });

  const orders: Order[] = response.map((o) => {
    const amount = parseFloat(o.origSz);
    const remaining = parseFloat(o.sz);
    const filled = subtract(amount, remaining);

    return {
      id: o.oid,
      exchange: ExchangeName.HL,
      accountId: account.id,
      status: OrderStatus.Open,
      symbol: o.coin,
      type: OrderType.Limit,
      side: o.side === "A" ? OrderSide.Buy : OrderSide.Sell,
      price: parseFloat(o.limitPx),
      amount,
      filled,
      remaining,
      reduceOnly: o.reduceOnly,
    };
  });

  return orders;
};

export const fetchHLOHLCV = async ({
  config,
  params,
}: {
  config: ExchangeConfig;
  params: FetchOHLCVParams;
}) => {
  const limit = Math.min(params.limit || 500, 1000);
  const body = omitUndefined({
    type: "candleSnapshot",
    req: {
      coin: params.symbol,
      interval: params.timeframe,
      endTime: params.to,
      startTime: params.from,
      limit,
    },
  });

  const response = await request<HLCandle[]>({
    url: `${config.PUBLIC_API_URL}${HL_ENDPOINTS.PUBLIC.INFO}`,
    method: "POST",
    body,
  });

  const candles: Candle[] = response.map((c) => ({
    symbol: params.symbol,
    timeframe: params.timeframe,
    timestamp: Math.round(c.T / 1000),
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }));

  return orderBy(candles, ["timestamp"], ["asc"]);
};
