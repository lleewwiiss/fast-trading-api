import type { HLUserOrder } from "./hl.types";

import { adjust, subtract } from "~/utils/safe-math.utils";
import {
  ExchangeName,
  OrderSide,
  OrderStatus,
  OrderType,
  type Market,
  type Order,
  type PlaceOrderOpts,
  type Ticker,
} from "~/types/lib.types";

const mapOrderType = (type: string) => {
  switch (type) {
    case "Limit":
      return OrderType.Limit;
    case "Take Profit Market":
      return OrderType.TakeProfit;
    case "Stop Market":
      return OrderType.StopLoss;
    default:
      return OrderType.Limit;
  }
};

export const mapHlOrder = ({
  order,
  accountId,
}: {
  order: HLUserOrder;
  accountId: string;
}): Order => {
  const amount = parseFloat(order.origSz);
  const remaining = parseFloat(order.sz);
  const filled = subtract(amount, remaining);

  return {
    id: order.oid,
    exchange: ExchangeName.HL,
    accountId,
    status: OrderStatus.Open,
    symbol: order.coin,
    type: mapOrderType(order.orderType),
    side: order.side === "A" ? OrderSide.Sell : OrderSide.Buy,
    price: order.isPositionTpsl
      ? parseFloat(order.triggerPx)
      : parseFloat(order.limitPx),
    amount,
    filled,
    remaining,
    reduceOnly: order.reduceOnly || order.isPositionTpsl,
  };
};

export const formatHlOrder = ({
  order,
  tickers,
  markets,
}: {
  order: PlaceOrderOpts;
  tickers: Record<string, Ticker>;
  markets: Record<string, Market>;
}) => {
  const ticker = tickers[order.symbol];
  const market = markets[order.symbol];

  const isBuy = order.side === OrderSide.Buy;
  const isStop =
    order.type === OrderType.StopLoss ||
    order.type === OrderType.TakeProfit ||
    order.type === OrderType.TrailingStopLoss;

  const last = ticker.last;

  const amount = adjust(order.amount, market.precision.amount);
  const price = adjust(
    order.price ?? (isBuy ? last + last / 100 : last - last / 100),
    market.precision.price,
  );

  return {
    a: tickers[order.symbol].id as number,
    b: isBuy,
    p: price.toString(),
    s: amount.toString(),
    r: order.reduceOnly,
    t: isStop
      ? {
          trigger: {
            isMarket: true,
            triggerPx: price.toString(),
            tpsl: order.type === OrderType.StopLoss ? "sl" : "tp",
          },
        }
      : {
          limit: {
            tif: order.type === OrderType.Market ? "Ioc" : "Gtc",
          },
        },
  };
};
