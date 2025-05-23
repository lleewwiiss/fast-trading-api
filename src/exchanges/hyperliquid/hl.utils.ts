import type { HLUserOrder } from "./hl.types";

import { subtract } from "~/utils/safe-math.utils";
import {
  ExchangeName,
  OrderSide,
  OrderStatus,
  OrderType,
  type Order,
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
