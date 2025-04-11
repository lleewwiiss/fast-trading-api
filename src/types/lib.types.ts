import type { ObjectChangeCommand, ObjectPaths } from "./misc.types";

export interface FastTradingApiOptions {
  accounts: Account[];
  store?: Store;
}

export interface Store {
  memory: StoreMemory;
  applyChanges<P extends ObjectPaths<StoreMemory>>(
    changes: ObjectChangeCommand<StoreMemory, P>[],
  ): void;
}

export interface StoreMemory extends Record<ExchangeName, ExchangeMemory> {}

export interface ExchangeMemory {
  private: Record<Account["id"], ExchangeAccountMemory>;
  public: {
    tickers: Record<string, Ticker>;
    markets: Record<string, Market>;
    orderBooks: Record<string, OrderBook>;
    ohlcv: Record<string, Record<Timeframe, Candle>>;
  };
}

export interface ExchangeAccountMemory {
  balance: Balance;
  positions: Position[];
  orders: Order[];
  notifications: Notification[];
}

export interface FetchOHLCVParams {
  symbol: string;
  timeframe: Timeframe;
  from?: number;
  to?: number;
  limit?: number;
}

export enum ExchangeName {
  BYBIT = "bybit",
}

export interface Account {
  id: string;
  exchange: ExchangeName;
  apiKey: string;
  apiSecret: string;
}

export interface Balance {
  used: number;
  free: number;
  total: number;
  upnl: number;
}

export interface Ticker {
  id: string;
  symbol: string;
  cleanSymbol: string;
  bid: number;
  ask: number;
  last: number;
  mark: number;
  index: number;
  percentage: number;
  openInterest: number;
  fundingRate: number;
  volume: number;
  quoteVolume: number;
}

export interface Market {
  id: string;
  symbol: string;
  base: string;
  quote: string;
  active: boolean;
  precision: {
    amount: number;
    price: number;
  };
  limits: {
    amount: {
      min: number;
      max: number;
      maxMarket: number;
    };
    leverage: {
      min: number;
      max: number;
    };
  };
}

export enum PositionSide {
  Long = "long",
  Short = "short",
}

export interface Position {
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  notional: number;
  leverage: number;
  upnl: number;
  contracts: number;
  liquidationPrice: number;
  isHedged?: boolean;
}

export enum OrderStatus {
  Open = "open",
  Closed = "closed",
  Canceled = "canceled",
}

export enum OrderType {
  Market = "market",
  Limit = "limit",
  StopLoss = "stop_market",
  TakeProfit = "take_profit_market",
  TrailingStopLoss = "trailing_stop_market",
}

export enum OrderSide {
  Buy = "buy",
  Sell = "sell",
}

export enum OrderTimeInForce {
  GoodTillCancel = "GoodTillCancel",
  ImmediateOrCancel = "ImmediateOrCancel",
  FillOrKill = "FillOrKill",
  PostOnly = "PostOnly",
}

export interface Order {
  id: string;
  parentId?: string;
  status: OrderStatus;
  symbol: string;
  type: OrderType;
  side: OrderSide;
  price: number;
  amount: number;
  filled: number;
  remaining: number;
  reduceOnly: boolean;
}

export interface OrderBookOrder {
  price: number;
  amount: number;
  total: number;
}

export interface OrderBook {
  bids: OrderBookOrder[];
  asks: OrderBookOrder[];
}

export type Notification = {
  type: "order_fill";
  data: {
    side: OrderSide;
    amount: number;
    symbol: Order["symbol"];
    price: number | "MARKET";
  };
};

export type Timeframe =
  | "1d"
  | "1h"
  | "1m"
  | "1w"
  | "2h"
  | "3m"
  | "4h"
  | "5m"
  | "6h"
  | "12h"
  | "15m"
  | "30m";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PlaceOrderOpts {
  symbol: string;
  type: OrderType;
  side: OrderSide;
  amount: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  reduceOnly?: boolean;
  timeInForce?: OrderTimeInForce;
}
