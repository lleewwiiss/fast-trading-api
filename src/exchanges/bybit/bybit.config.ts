import {
  OrderSide,
  OrderStatus,
  OrderTimeInForce,
  OrderType,
  type ExchangeTimeframe,
} from "~/types/exchange.types";
import { inverseObj } from "~/utils/inverse-obj.utils";

export const RECV_WINDOW = 5000;
export const BROKER_ID = "Gi000266";

export const BYBIT_API = {
  BASE_URL: "https://api.bybit.com",
  BASE_WS_PUBLIC_URL: "wss://stream.bybit.com/v5/public/linear",
  BASE_WS_PRIVATE_URL: "wss://stream.bybit.com/v5/private",
  BASE_WS_TRADE_URL: "wss://stream.bybit.com/v5/trade",
  ENDPOINTS: {
    MARKETS: "/v5/market/instruments-info",
    TICKERS: "/v5/market/tickers",
    POSITIONS: "/v5/position/list",
    BALANCE: "/v5/account/wallet-balance",
    ORDERS: "/v5/order/realtime",
    KLINE: "/v5/market/kline",
    TRADING_STOP: "/v5/position/trading-stop",
  },
};

export const INTERVAL: Record<ExchangeTimeframe, string> = {
  "1m": "1",
  "3m": "3",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "6h": "360",
  "12h": "720",
  "1d": "D",
  "1w": "W",
};

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

export const ORDER_TYPE = {
  Limit: OrderType.Limit,
  Market: OrderType.Market,
  StopLoss: OrderType.StopLoss,
  TakeProfit: OrderType.TakeProfit,
  TrailingStop: OrderType.TrailingStopLoss,
};

export const ORDER_SIDE = {
  Buy: OrderSide.Buy,
  Sell: OrderSide.Sell,
};

export const ORDER_TIME_IN_FORCE = {
  GTC: OrderTimeInForce.GoodTillCancel,
  IOC: OrderTimeInForce.ImmediateOrCancel,
  FOK: OrderTimeInForce.FillOrKill,
  PostOnly: OrderTimeInForce.PostOnly,
};

export const ORDER_TIME_IN_FORCE_INVERSE = inverseObj(ORDER_TIME_IN_FORCE);
export const ORDER_SIDE_INVERSE = inverseObj(ORDER_SIDE);
export const ORDER_TYPE_INVERSE = inverseObj(ORDER_TYPE);
