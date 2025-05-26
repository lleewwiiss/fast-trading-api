import type { HLUserAccount, HLUserOrder } from "./hl.types";
import { HL_MAX_FIGURES } from "./hl.config";

import { adjust, multiply, subtract } from "~/utils/safe-math.utils";
import {
  ExchangeName,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
  type Account,
  type Balance,
  type Market,
  type Order,
  type PlaceOrderOpts,
  type Ticker,
} from "~/types/lib.types";
import { countFigures } from "~/utils/count-figures.utils";
import { sumBy } from "~/utils/sum-by.utils";

export const mapHLUserAccount = ({
  accountId,
  data: { assetPositions, crossMarginSummary },
}: {
  accountId: Account["id"];
  data: HLUserAccount;
}) => {
  const positions = assetPositions.map((p) => {
    const contracts = parseFloat(p.position.szi);

    return {
      accountId,
      exchange: ExchangeName.HL,
      symbol: p.position.coin,
      side: contracts > 0 ? PositionSide.Long : PositionSide.Short,
      entryPrice: parseFloat(p.position.entryPx),
      notional: parseFloat(p.position.positionValue),
      leverage: p.position.leverage.value,
      upnl: parseFloat(p.position.unrealizedPnl),
      rpnl: 0,
      contracts: Math.abs(contracts),
      liquidationPrice: parseFloat(p.position.liquidationPx) || 0,
      isHedged: p.type !== "oneWay",
    };
  });

  const used = parseFloat(crossMarginSummary.totalMarginUsed);
  const total = parseFloat(crossMarginSummary.accountValue);
  const free = subtract(total, used);
  const upnl = sumBy(positions, (p) => p.upnl);

  const balance: Balance = { used, free, total, upnl };

  return {
    balance,
    positions,
  };
};

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

  const pPrice = market.precision.price;
  const pAmount = market.precision.amount;

  const isBuy = order.side === OrderSide.Buy;
  const isStop =
    order.type === OrderType.StopLoss ||
    order.type === OrderType.TakeProfit ||
    order.type === OrderType.TrailingStopLoss;

  const amount = adjust(order.amount, pAmount);

  let price = order.price;

  // HyperLiquid always need a price of order
  // if no price is provided we apply 1% slippage from last price
  if (!price) {
    price = isBuy
      ? ticker.last + ticker.last / 100
      : ticker.last - ticker.last / 100;
  }

  // We apply the adjust() function to round to maximal decimals accepted
  price = adjust(price, pPrice);

  // Now we check if we don't have too many "significant figures" in the price
  // meaning removing leading and trailling zeros and calculate the count of figures
  const significantFiguresCount = countFigures(price);

  if (significantFiguresCount > HL_MAX_FIGURES && !Number.isInteger(price)) {
    const diff = significantFiguresCount - HL_MAX_FIGURES;
    // we apply Math.min(1, xxx) because any integer is accepted
    // we just want to remove decimals if there are too many
    const newPrecision = Math.min(1, multiply(pPrice, 10 ** diff));
    price = adjust(price, newPrecision);
  }

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
