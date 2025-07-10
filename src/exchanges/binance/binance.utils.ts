import type {
  BinanceBalance,
  BinanceOrder,
  BinancePlaceOrderOpts,
  BinancePosition,
  BinanceTicker,
  BinanceBookTicker,
  BinancePremiumIndex,
  BinanceKline,
} from "./binance.types";
import {
  ORDER_TIME_IN_FORCE_INVERSE,
  ORDER_SIDE_INVERSE,
  ORDER_TYPE_INVERSE,
  ORDER_SIDE,
  ORDER_STATUS,
  ORDER_TYPE,
} from "./binance.config";

import {
  ExchangeName,
  OrderSide,
  OrderTimeInForce,
  OrderType,
  PositionSide,
  type Candle,
  type Fill,
  type Market,
  type Order,
  type PlaceOrderOpts,
  type Position,
  type Ticker,
} from "~/types/lib.types";
import { adjust, subtract } from "~/utils/safe-math.utils";
import { TICKER_REGEX } from "~/utils/regex.utils";
import { omitUndefined } from "~/utils/omit-undefined.utils";
import { times } from "~/utils/times.utils";
import { toUSD } from "~/utils/to-usd.utils";

export const mapBinanceTicker = (
  ticker24h: BinanceTicker,
  bookTicker: BinanceBookTicker,
  premiumIndex: BinancePremiumIndex,
): Ticker => {
  return {
    id: ticker24h.symbol,
    symbol: ticker24h.symbol,
    exchange: ExchangeName.BINANCE,
    cleanSymbol: ticker24h.symbol.replace(TICKER_REGEX, ""),
    bid: parseFloat(bookTicker.bidPrice),
    ask: parseFloat(bookTicker.askPrice),
    last: parseFloat(ticker24h.lastPrice),
    mark: parseFloat(premiumIndex.markPrice),
    index: parseFloat(premiumIndex.indexPrice),
    percentage: parseFloat(ticker24h.priceChangePercent),
    openInterest: 0, // Binance doesn't provide this in ticker endpoint
    fundingRate: parseFloat(premiumIndex.lastFundingRate),
    volume: parseFloat(ticker24h.volume),
    quoteVolume: parseFloat(ticker24h.quoteVolume),
  };
};

export const mapBinanceBalance = (balances: BinanceBalance[]) => {
  const usdtBalance = balances.find((b) => b.asset === "USDT");

  if (!usdtBalance) {
    return { total: 0, upnl: 0, used: 0, free: 0 };
  }

  const total = toUSD(parseFloat(usdtBalance.balance));
  const available = toUSD(parseFloat(usdtBalance.availableBalance));
  const crossUnPnl = toUSD(parseFloat(usdtBalance.crossUnPnl));
  const used = total - available;
  const free = available;

  return {
    total,
    upnl: crossUnPnl,
    used,
    free,
  };
};

export const mapBinancePosition = ({
  position: p,
  accountId,
}: {
  position: BinancePosition;
  accountId: string;
}): Position | null => {
  const contracts = parseFloat(p.positionAmt);

  // Skip positions with zero contracts
  if (contracts === 0) {
    return null;
  }

  const side = contracts > 0 ? PositionSide.Long : PositionSide.Short;
  const entryPrice = parseFloat(p.entryPrice);
  const markPrice = parseFloat(p.markPrice);
  const unrealizedPnl = parseFloat(p.unRealizedProfit);

  return {
    exchange: ExchangeName.BINANCE,
    accountId,
    symbol: p.symbol,
    side,
    entryPrice,
    notional: toUSD(Math.abs(contracts) * markPrice),
    leverage: parseFloat(p.leverage),
    upnl: toUSD(unrealizedPnl),
    rpnl: 0, // Binance doesn't provide realized PnL in position endpoint
    contracts: Math.abs(contracts),
    liquidationPrice: parseFloat(p.liquidationPrice),
    isHedged: p.positionSide !== "BOTH",
  };
};

export const mapBinanceOrder = ({
  order: o,
  accountId,
}: {
  order: BinanceOrder;
  accountId: string;
}): Order => {
  return {
    id: o.orderId.toString(),
    exchange: ExchangeName.BINANCE,
    accountId,
    status: ORDER_STATUS[o.status],
    symbol: o.symbol,
    type: ORDER_TYPE[o.type as keyof typeof ORDER_TYPE],
    side: ORDER_SIDE[o.side as keyof typeof ORDER_SIDE],
    price: parseFloat(o.price),
    amount: parseFloat(o.origQty),
    filled: parseFloat(o.executedQty),
    reduceOnly: o.reduceOnly || false,
    remaining: subtract(parseFloat(o.origQty), parseFloat(o.executedQty)),
    timestamp: o.updateTime,
  };
};

export const mapBinanceKline = (kline: BinanceKline): Candle => {
  return {
    symbol: "", // Will be set by caller
    timeframe: "1m", // Will be set by caller
    timestamp: kline[0] / 1000,
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5]),
  };
};

export const formatBinanceOrder = ({
  order,
  market,
  isHedged,
}: {
  order: PlaceOrderOpts;
  market: Market;
  isHedged?: boolean;
}): BinancePlaceOrderOpts[] => {
  const maxSize =
    order.type === OrderType.Market
      ? market.limits.amount.maxMarket
      : market.limits.amount.max;

  const pPrice = market.precision.price;
  const pAmount = market.precision.amount;

  const amount = adjust(order.amount, pAmount);
  const price = order.price ? adjust(order.price, pPrice) : undefined;

  const timeInForce =
    ORDER_TIME_IN_FORCE_INVERSE[
      order.timeInForce || OrderTimeInForce.GoodTillCancel
    ];

  const positionSide = isHedged ? getPositionSide(order) : "BOTH";

  const req = omitUndefined({
    symbol: order.symbol,
    side: ORDER_SIDE_INVERSE[order.side],
    type: ORDER_TYPE_INVERSE[order.type],
    quantity: `${amount}`,
    price: order.type === OrderType.Limit ? `${price}` : undefined,
    timeInForce: order.type === OrderType.Limit ? timeInForce : undefined,
    reduceOnly: order.reduceOnly,
    positionSide,
    workingType: "CONTRACT_PRICE" as const,
    priceProtect: false,
    newOrderRespType: "RESULT" as const,
  });

  const lots = amount > maxSize ? Math.ceil(amount / maxSize) : 1;
  const rest = amount > maxSize ? adjust(amount % maxSize, pAmount) : 0;

  const lotSize = adjust((amount - rest) / lots, pAmount);
  const payloads = times(lots, () => ({ ...req, quantity: `${lotSize}` }));
  if (rest > 0) payloads.push({ ...req, quantity: `${rest}` });

  return payloads;
};

export const getPositionSide = (
  order: Pick<PlaceOrderOpts, "side" | "reduceOnly">,
): "BOTH" | "LONG" | "SHORT" => {
  if (order.side === OrderSide.Buy) {
    return order.reduceOnly ? "SHORT" : "LONG";
  }

  if (order.side === OrderSide.Sell) {
    return order.reduceOnly ? "LONG" : "SHORT";
  }

  throw new Error(`Invalid order side: ${order.side}`);
};

export const mapBinanceFill = (o: BinanceOrder): Fill => {
  return {
    symbol: o.symbol,
    side: ORDER_SIDE[o.side as keyof typeof ORDER_SIDE],
    price: parseFloat(o.avgPrice || o.price),
    amount: parseFloat(o.executedQty || o.origQty),
    timestamp: o.updateTime,
  };
};
