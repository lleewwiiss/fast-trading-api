import type {
  BybitBalance,
  BybitOrder,
  BybitPosition,
  BybitTicker,
  BybitWebsocketPosition,
} from "./bybit.types";

import {
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
  type ExchangeOrder,
  type ExchangePosition,
} from "~/types";
import { subtract } from "~/utils/safe-math.utils";
import { TICKER_REGEX } from "~/utils/regex.utils";

export const ORDER_STATUS: Record<string, OrderStatus> = {
  Created: OrderStatus.Open,
  New: OrderStatus.Open,
  Active: OrderStatus.Open,
  Untriggered: OrderStatus.Open,
  PartiallyFilled: OrderStatus.Open,
  Rejected: OrderStatus.Closed,
  Filled: OrderStatus.Closed,
  Deactivated: OrderStatus.Closed,
  Triggered: OrderStatus.Closed,
  PendingCancel: OrderStatus.Canceled,
  Cancelled: OrderStatus.Canceled,
};

export const ORDER_TYPE: Record<string, OrderType> = {
  Limit: OrderType.Limit,
  Market: OrderType.Market,
  StopLoss: OrderType.StopLoss,
  TakeProfit: OrderType.TakeProfit,
  TrailingStop: OrderType.TrailingStopLoss,
};

export const ORDER_SIDE: Record<string, OrderSide> = {
  Buy: OrderSide.Buy,
  Sell: OrderSide.Sell,
};

export const mapBybitTicker = (t: BybitTicker) => {
  return {
    id: t.symbol,
    symbol: t.symbol,
    cleanSymbol: t.symbol.replace(TICKER_REGEX, ""),
    bid: parseFloat(t.bid1Price),
    ask: parseFloat(t.ask1Price),
    last: parseFloat(t.lastPrice),
    mark: parseFloat(t.markPrice),
    index: parseFloat(t.indexPrice),
    percentage: parseFloat(t.price24hPcnt) * 100,
    openInterest: parseFloat(t.openInterest),
    fundingRate: parseFloat(t.fundingRate),
    volume: parseFloat(t.volume24h),
    quoteVolume: parseFloat(t.volume24h) * parseFloat(t.lastPrice),
  };
};

export const mapBybitBalance = (b?: BybitBalance) => {
  if (!b) {
    return { total: 0, upnl: 0, used: 0, free: 0 };
  }

  const upnl = parseFloat(b.totalPerpUPL);
  const total = parseFloat(b.totalEquity) - upnl;

  return {
    total,
    upnl,
    used:
      parseFloat(b.totalMaintenanceMargin) + parseFloat(b.totalInitialMargin),
    free: parseFloat(b.totalMarginBalance),
  };
};

export const mapBybitPosition = (
  p: BybitPosition | BybitWebsocketPosition,
): ExchangePosition => {
  return {
    symbol: p.symbol,
    side: p.side === "Buy" ? PositionSide.Long : PositionSide.Short,
    entryPrice: parseFloat("avgPrice" in p ? p.avgPrice : p.entryPrice),
    notional: parseFloat(p.positionValue) + parseFloat(p.unrealisedPnl),
    leverage: parseFloat(p.leverage),
    unrealizedPnl: parseFloat(p.unrealisedPnl),
    contracts: parseFloat(p.size || "0"),
    liquidationPrice: parseFloat(p.liqPrice || "0"),
    isHedged: p.positionIdx !== 0,
  };
};

export const mapBybitOrder = (o: BybitOrder): ExchangeOrder[] => {
  const isStop = o.stopOrderType !== "UNKNOWN" && o.stopOrderType !== "";

  const oPrice = isStop ? o.triggerPrice : o.price;
  const oType = isStop ? o.stopOrderType : o.orderType;

  const orders: ExchangeOrder[] = [
    {
      id: o.orderId,
      status: ORDER_STATUS[o.orderStatus],
      symbol: o.symbol,
      type: ORDER_TYPE[oType],
      side: ORDER_SIDE[o.side],
      price: parseFloat(oPrice),
      amount: parseFloat(o.qty || "0"),
      filled: parseFloat(o.cumExecQty || "0"),
      reduceOnly: o.reduceOnly || false,
      remaining: subtract(
        parseFloat(o.qty || "0"),
        parseFloat(o.cumExecQty || "0"),
      ),
    },
  ];

  const sl = parseFloat(o.stopLoss);
  const tp = parseFloat(o.takeProfit);

  const inverseSide =
    orders[0].side === OrderSide.Buy ? OrderSide.Sell : OrderSide.Buy;

  if (sl > 0) {
    orders.push({
      ...orders[0],
      id: `${o.orderId}__stop_loss`,
      type: OrderType.StopLoss,
      side: inverseSide,
      price: sl,
      filled: 0,
      remaining: orders[0].amount,
    });
  }

  if (tp > 0) {
    orders.push({
      ...orders[0],
      id: `${o.orderId}__take_profit`,
      type: OrderType.TakeProfit,
      side: inverseSide,
      price: tp,
      filled: 0,
      remaining: orders[0].amount,
    });
  }

  return orders;
};
