import {
  OrderSide,
  OrderStatus,
  OrderTimeInForce,
  OrderType,
  PositionSide,
  type Timeframe,
} from "~/types/lib.types";
import { inverseObj } from "~/utils/inverse-obj.utils";

export const RECV_WINDOW = 5000;

export const BINANCE_ENDPOINTS = {
  PUBLIC: {
    MARKETS: "/fapi/v1/exchangeInfo",
    TICKERS_24H: "/fapi/v1/ticker/24hr",
    TICKERS_BOOK: "/fapi/v1/ticker/bookTicker",
    TICKERS_PRICE: "/fapi/v1/premiumIndex",
    KLINE: "/fapi/v1/klines",
    ORDERBOOK: "/fapi/v1/depth",
  },
  PRIVATE: {
    BALANCE: "/fapi/v2/balance",
    ACCOUNT: "/fapi/v2/account",
    POSITIONS: "/fapi/v2/positionRisk",
    LEVERAGE_BRACKET: "/fapi/v1/leverageBracket",
    HEDGE_MODE: "/fapi/v1/positionSide/dual",
    SET_LEVERAGE: "/fapi/v1/leverage",
    OPEN_ORDERS: "/fapi/v1/openOrders",
    ORDERS_HISTORY: "/fapi/v1/allOrders",
    CANCEL_SYMBOL_ORDERS: "/fapi/v1/allOpenOrders",
    ORDER: "/fapi/v1/order",
    BATCH_ORDERS: "/fapi/v1/batchOrders",
    LISTEN_KEY: "/fapi/v1/listenKey",
  },
};

export const PUBLIC_ENDPOINTS = [
  BINANCE_ENDPOINTS.PUBLIC.MARKETS,
  BINANCE_ENDPOINTS.PUBLIC.TICKERS_24H,
  BINANCE_ENDPOINTS.PUBLIC.TICKERS_BOOK,
  BINANCE_ENDPOINTS.PUBLIC.TICKERS_PRICE,
  BINANCE_ENDPOINTS.PUBLIC.KLINE,
  BINANCE_ENDPOINTS.PUBLIC.ORDERBOOK,
];

export const INTERVAL: Record<Timeframe, string> = {
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "6h": "6h",
  "12h": "12h",
  "1d": "1d",
  "1w": "1w",
};

export const ORDER_STATUS: Record<string, OrderStatus> = {
  NEW: OrderStatus.Open,
  PARTIALLY_FILLED: OrderStatus.Open,
  FILLED: OrderStatus.Filled,
  CANCELED: OrderStatus.Canceled,
  PENDING_CANCEL: OrderStatus.Canceled,
  REJECTED: OrderStatus.Closed,
  EXPIRED: OrderStatus.Closed,
};

export const ORDER_TYPE = {
  LIMIT: OrderType.Limit,
  MARKET: OrderType.Market,
  STOP_MARKET: OrderType.StopLoss,
  TAKE_PROFIT_MARKET: OrderType.TakeProfit,
  TRAILING_STOP_MARKET: OrderType.TrailingStopLoss,
};

export const ORDER_SIDE = {
  BUY: OrderSide.Buy,
  SELL: OrderSide.Sell,
};

export const POSITION_SIDE = {
  LONG: PositionSide.Long,
  SHORT: PositionSide.Short,
};

export const ORDER_TIME_IN_FORCE = {
  GTC: OrderTimeInForce.GoodTillCancel,
  IOC: OrderTimeInForce.ImmediateOrCancel,
  FOK: OrderTimeInForce.FillOrKill,
  GTX: OrderTimeInForce.PostOnly,
};

export const ORDER_TIME_IN_FORCE_INVERSE = inverseObj(ORDER_TIME_IN_FORCE);
export const ORDER_SIDE_INVERSE = inverseObj(ORDER_SIDE);
export const ORDER_TYPE_INVERSE = inverseObj(ORDER_TYPE);
export const POSITION_SIDE_INVERSE = inverseObj(POSITION_SIDE);
