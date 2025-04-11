import { times, omit } from "lodash";

import type {
  BybitBalance,
  BybitOrder,
  BybitPlaceOrderOpts,
  BybitPosition,
  BybitTicker,
  BybitWebsocketPosition,
} from "./bybit.types";
import {
  ORDER_TIME_IN_FORCE_INVERSE,
  ORDER_SIDE_INVERSE,
  ORDER_TYPE_INVERSE,
  ORDER_SIDE,
  ORDER_STATUS,
  ORDER_TYPE,
} from "./bybit.config";

import {
  OrderSide,
  OrderTimeInForce,
  OrderType,
  PositionSide,
  type Market,
  type Order,
  type PlaceOrderOpts,
  type Position,
} from "~/types/lib.types";
import { adjust, subtract } from "~/utils/safe-math.utils";
import { TICKER_REGEX } from "~/utils/regex.utils";
import { omitUndefined } from "~/utils/omit-undefined.utils";

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
): Position => {
  return {
    symbol: p.symbol,
    side: p.side === "Buy" ? PositionSide.Long : PositionSide.Short,
    entryPrice: parseFloat("avgPrice" in p ? p.avgPrice : p.entryPrice),
    notional: parseFloat(p.positionValue) + parseFloat(p.unrealisedPnl),
    leverage: parseFloat(p.leverage),
    upnl: parseFloat(p.unrealisedPnl),
    contracts: parseFloat(p.size || "0"),
    liquidationPrice: parseFloat(p.liqPrice || "0"),
    isHedged: p.positionIdx !== 0,
  };
};

export const mapBybitOrder = (o: BybitOrder): Order[] => {
  const isStop = o.stopOrderType !== "UNKNOWN" && o.stopOrderType !== "";

  const oPrice = isStop ? o.triggerPrice : o.price;
  const oType = isStop ? o.stopOrderType : o.orderType;

  const orders: Order[] = [
    {
      id: o.orderId,
      status: ORDER_STATUS[o.orderStatus],
      symbol: o.symbol,
      type: ORDER_TYPE[oType as keyof typeof ORDER_TYPE],
      side: ORDER_SIDE[o.side as keyof typeof ORDER_SIDE],
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

export const formatMarkerOrLimitOrder = ({
  order,
  market,
  isHedged,
}: {
  order: PlaceOrderOpts;
  market: Market;
  isHedged?: boolean;
}): BybitPlaceOrderOpts[] => {
  let positionIdx: 0 | 1 | 2 = 0;

  if (isHedged) {
    positionIdx = order.side === OrderSide.Buy ? 1 : 2;
    if (order.reduceOnly) positionIdx = positionIdx === 1 ? 2 : 1;
  }

  const maxSize =
    order.type === OrderType.Market
      ? market.limits.amount.maxMarket
      : market.limits.amount.max;

  const pPrice = market.precision.price;
  const pAmount = market.precision.amount;

  const amount = adjust(order.amount, pAmount);
  const price = order.price ? adjust(order.price, pPrice) : undefined;
  const stopLoss = order.stopLoss ? adjust(order.stopLoss, pPrice) : undefined;
  const takeProfit = order.takeProfit
    ? adjust(order.takeProfit, pPrice)
    : undefined;

  const timeInForce =
    ORDER_TIME_IN_FORCE_INVERSE[
      order.timeInForce || OrderTimeInForce.GoodTillCancel
    ];

  const req = omitUndefined({
    category: "linear",
    symbol: order.symbol,
    side: ORDER_SIDE_INVERSE[order.side],
    orderType: ORDER_TYPE_INVERSE[order.type],
    qty: `${amount}`,
    price: order.type === OrderType.Limit ? `${price}` : undefined,
    stopLoss: order.stopLoss ? `${stopLoss}` : undefined,
    takeProfit: order.takeProfit ? `${takeProfit}` : undefined,
    reduceOnly: order.reduceOnly || false,
    slTriggerBy: order.stopLoss ? "MarkPrice" : undefined,
    tpTriggerBy: order.takeProfit ? "LastPrice" : undefined,
    timeInForce: order.type === OrderType.Limit ? timeInForce : undefined,
    closeOnTrigger: false,
    positionIdx,
  });

  const lots = amount > maxSize ? Math.ceil(amount / maxSize) : 1;
  const rest = amount > maxSize ? adjust(amount % maxSize, pAmount) : 0;

  const lotSize = adjust((amount - rest) / lots, pAmount);

  const payloads = times(lots, (idx) => {
    const payload =
      idx > 0
        ? omit(req, ["stopLoss", "takeProfit", "slTriggerBy", "tpTriggerBy"])
        : req;

    return { ...payload, qty: `${lotSize}` };
  });

  if (rest > 0) {
    payloads.push({ ...req, qty: `${rest}` });
  }

  return payloads;
};
