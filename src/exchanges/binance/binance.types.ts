export type BinanceInstrument = {
  symbol: string;
  pair: string;
  contractType: string;
  deliveryDate: number;
  onboardDate: number;
  status: string;
  mainMarginPercent: string;
  requiredMarginPercent: string;
  baseAsset: string;
  quoteAsset: string;
  marginAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  baseAssetPrecision: number;
  quotePrecision: number;
  underlyingType: string;
  underlyingSubType: string[];
  settlePlan: number;
  triggerProtect: string;
  liquidationFee: string;
  marketTakeBound: string;
  maxMoveOrderLimit: number;
  filters: Array<{
    filterType: string;
    minPrice?: string;
    maxPrice?: string;
    tickSize?: string;
    minQty?: string;
    maxQty?: string;
    stepSize?: string;
    limit?: number;
    minNotional?: string;
    applyMinToMarket?: boolean;
    maxNumOrders?: number;
    maxNumAlgoOrders?: number;
  }>;
  orderTypes: string[];
  timeInForce: string[];
};

export type BinanceTicker = {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  lastPrice: string;
  lastQty: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
};

export type BinanceBookTicker = {
  symbol: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
  time: number;
};

export type BinancePremiumIndex = {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  estimatedSettlePrice: string;
  lastFundingRate: string;
  interestRate: string;
  nextFundingTime: number;
  time: number;
};

export type BinanceBalance = {
  accountAlias: string;
  asset: string;
  balance: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  marginAvailable: boolean;
  updateTime: number;
};

export type BinancePosition = {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  breakEvenPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  maxNotionalValue: string;
  marginType: string;
  isolatedMargin: string;
  isAutoAddMargin: string;
  positionSide: string;
  notional: string;
  isolatedWallet: string;
  updateTime: number;
  bidNotional: string;
  askNotional: string;
};

export type BinanceOrder = {
  orderId: number;
  symbol: string;
  status: string;
  clientOrderId: string;
  price: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  cumQty: string;
  cumQuote: string;
  timeInForce: string;
  type: string;
  reduceOnly: boolean;
  closePosition: boolean;
  side: string;
  positionSide: string;
  stopPrice: string;
  workingType: string;
  priceProtect: boolean;
  origType: string;
  priceMatch: string;
  selfTradePreventionMode: string;
  goodTillDate: number;
  time: number;
  updateTime: number;
};

export type BinancePlaceOrderOpts = {
  symbol: string;
  side: "BUY" | "SELL";
  positionSide?: "BOTH" | "LONG" | "SHORT";
  type:
    | "LIMIT"
    | "MARKET"
    | "STOP"
    | "STOP_MARKET"
    | "TAKE_PROFIT"
    | "TAKE_PROFIT_MARKET"
    | "TRAILING_STOP_MARKET";
  quantity?: string;
  quoteOrderQty?: string;
  price?: string;
  newClientOrderId?: string;
  stopPrice?: string;
  closePosition?: boolean;
  activationPrice?: string;
  callbackRate?: string;
  timeInForce?: "GTC" | "IOC" | "FOK" | "GTX";
  reduceOnly?: boolean;
  workingType?: "MARK_PRICE" | "CONTRACT_PRICE";
  priceProtect?: boolean;
  newOrderRespType?: "ACK" | "RESULT";
  priceMatch?:
    | "OPPONENT"
    | "OPPONENT_5"
    | "OPPONENT_10"
    | "OPPONENT_20"
    | "QUEUE"
    | "QUEUE_5"
    | "QUEUE_10"
    | "QUEUE_20";
  selfTradePreventionMode?:
    | "NONE"
    | "EXPIRE_TAKER"
    | "EXPIRE_MAKER"
    | "EXPIRE_BOTH";
  goodTillDate?: number;
  recvWindow?: number;
  timestamp?: number;
};

export type BinanceKline = [
  number, // Open time
  string, // Open
  string, // High
  string, // Low
  string, // Close
  string, // Volume
  number, // Close time
  string, // Quote asset volume
  number, // Number of trades
  string, // Taker buy base asset volume
  string, // Taker buy quote asset volume
  string, // Ignore
];

export type BinanceLeverageBracket = {
  symbol: string;
  brackets: Array<{
    bracket: number;
    initialLeverage: number;
    notionalCap: number;
    notionalFloor: number;
    maintMarginRatio: number;
    cum: number;
  }>;
};

export type BinanceOrderBook = {
  lastUpdateId: number;
  E: number; // Message output time
  T: number; // Transaction time
  bids: [string, string][]; // [price, quantity]
  asks: [string, string][]; // [price, quantity]
};

export type BinanceListenKey = BinanceListenKeyResponse;

export type BinanceAccountInfo = {
  feeTier: number;
  canTrade: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  updateTime: number;
  multiAssetsMargin: boolean;
  tradeGroupId: number;
  totalInitialMargin: string;
  totalMaintMargin: string;
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  totalMarginBalance: string;
  totalPositionInitialMargin: string;
  totalOpenOrderInitialMargin: string;
  totalCrossWalletBalance: string;
  totalCrossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  assets: BinanceBalance[];
  positions: BinancePosition[];
};

// WebSocket specific types matching Bybit pattern
export type BinanceWebSocketMessage<T = any> = {
  stream: string;
  data: T;
};

export type BinanceWebSocketSubscription = {
  method: "SUBSCRIBE" | "UNSUBSCRIBE";
  params: string[];
  id: number;
};

export type BinanceWebSocketResponse = {
  result: any;
  id: number;
};

// Order update WebSocket message
export type BinanceOrderUpdate = {
  e: "ORDER_TRADE_UPDATE";
  E: number; // Event time
  T: number; // Transaction time
  o: {
    s: string; // Symbol
    c: string; // Client order ID
    S: string; // Side
    o: string; // Order type
    f: string; // Time in force
    q: string; // Original quantity
    p: string; // Original price
    ap: string; // Average price
    sp: string; // Stop price
    x: string; // Execution type
    X: string; // Order status
    i: number; // Order ID
    l: string; // Last executed quantity
    z: string; // Cumulative filled quantity
    L: string; // Last executed price
    n: string; // Commission amount
    N: string; // Commission asset
    T: number; // Transaction time
    t: number; // Trade ID
    b: string; // Bids notional
    a: string; // Ask notional
    m: boolean; // Is this trade the maker side?
    R: boolean; // Is this reduce only
    wt: string; // Stop price working type
    ot: string; // Original order type
    ps: string; // Position side
    cp: boolean; // If Close-All, pushed with conditional order
    AP: string; // Activation price, only pushed with TRAILING_STOP_MARKET order
    cr: string; // Callback rate, only pushed with TRAILING_STOP_MARKET order
    rp: string; // Realized profit of the trade
    pP: boolean; // If conditional order trigger is protected
    si: number; // Ignore
    ss: number; // Ignore
  };
};

// Account update WebSocket message
export type BinanceAccountUpdate = {
  e: "ACCOUNT_UPDATE";
  E: number; // Event time
  T: number; // Transaction time
  a: {
    m: string; // Event reason type
    B: Array<{
      a: string; // Asset
      wb: string; // Wallet balance
      cw: string; // Cross wallet balance
      bc: string; // Balance change except PnL and commission
    }>;
    P: Array<{
      s: string; // Symbol
      pa: string; // Position amount
      ep: string; // Entry price
      cr: string; // (Pre-fee) accumulated realized
      up: string; // Unrealized PnL
      mt: string; // Margin type
      iw: string; // Isolated wallet (if isolated position)
      ps: string; // Position side
      ma: string; // Position margin
    }>;
  };
};

// Ticker stream data
export type BinanceTickerStream = {
  e: "24hrTicker";
  E: number; // Event time
  s: string; // Symbol
  p: string; // Price change
  P: string; // Price change percent
  w: string; // Weighted average price
  c: string; // Last price
  Q: string; // Last quantity
  o: string; // Open price
  h: string; // High price
  l: string; // Low price
  v: string; // Total traded base asset volume
  q: string; // Total traded quote asset volume
  O: number; // Statistics open time
  C: number; // Statistics close time
  F: number; // First trade ID
  L: number; // Last trade ID
  n: number; // Total number of trades
};

// Kline/Candlestick stream data
export type BinanceKlineStream = {
  e: "kline";
  E: number; // Event time
  s: string; // Symbol
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    f: number; // First trade ID
    L: number; // Last trade ID
    o: string; // Open price
    c: string; // Close price
    h: string; // High price
    l: string; // Low price
    v: string; // Base asset volume
    n: number; // Number of trades
    x: boolean; // Is this kline closed?
    q: string; // Quote asset volume
    V: string; // Taker buy base asset volume
    Q: string; // Taker buy quote asset volume
    B: string; // Ignore
  };
};

// Depth/OrderBook stream data
export type BinanceDepthStream = {
  e: "depthUpdate";
  E: number; // Event time
  T: number; // Transaction time
  s: string; // Symbol
  U: number; // First update ID in event
  u: number; // Final update ID in event
  pu: number; // Final update ID in last stream
  b: [string, string][]; // Bids to be updated [price, quantity]
  a: [string, string][]; // Asks to be updated [price, quantity]
};

// Listen key response type
export type BinanceListenKeyResponse = {
  listenKey: string;
};

// Error response type
export type BinanceApiError = {
  code: number;
  msg: string;
};

// Margin type for positions
export type BinanceMarginType = "ISOLATED" | "CROSSED";

// Position side for hedged mode
export type BinancePositionSideType = "BOTH" | "LONG" | "SHORT";

// Batch order response
export type BinanceBatchOrderResponse = {
  orderId: number;
  symbol: string;
  status: string;
  clientOrderId: string;
  price: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  cumQty: string;
  cumQuote: string;
  timeInForce: string;
  type: string;
  reduceOnly: boolean;
  closePosition: boolean;
  side: string;
  positionSide: string;
  stopPrice: string;
  workingType: string;
  priceProtect: boolean;
  origType: string;
  time: number;
  updateTime: number;
};

// Account configuration types
export type BinanceAccountConfig = {
  symbol: string;
  leverage: number;
  marginType: BinanceMarginType;
};

// Income history types
export type BinanceIncomeType =
  | "TRANSFER"
  | "WELCOME_BONUS"
  | "REALIZED_PNL"
  | "FUNDING_FEE"
  | "COMMISSION"
  | "INSURANCE_CLEAR"
  | "REFERRAL_KICKBACK"
  | "COMMISSION_REBATE"
  | "API_REBATE"
  | "CONTEST_REWARD"
  | "CROSS_COLLATERAL_TRANSFER"
  | "OPTIONS_PREMIUM_FEE"
  | "OPTIONS_SETTLE_PROFIT"
  | "INTERNAL_TRANSFER"
  | "AUTO_EXCHANGE"
  | "DELIVERED_SETTELMENT"
  | "COIN_SWAP_DEPOSIT"
  | "COIN_SWAP_WITHDRAW"
  | "POSITION_LIMIT_INCREASE_FEE";

export type BinanceIncomeHistory = {
  symbol: string;
  incomeType: BinanceIncomeType;
  income: string;
  asset: string;
  info: string;
  time: number;
  tranId: number;
  tradeId: string;
};

// WebSocket stream subscription parameters
export type BinanceStreamParams = {
  method: "SUBSCRIBE" | "UNSUBSCRIBE";
  params: string[];
  id: number;
};
