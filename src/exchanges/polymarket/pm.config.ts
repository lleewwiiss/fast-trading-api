export const PM_MAX_DECIMALS = 4;
export const PM_TICK_SIZE = 0.0001;
export const PM_MIN_SIZE = 0.0001;

export const PM_ENDPOINTS = {
  PUBLIC: {
    MARKETS: "/markets",
    MARKET: "/markets/:id",
    ORDER_BOOK: "/book",
    TRADES: "/trades",
    TICKER: "/price",
    CANDLES: "/prices-history",
    SAMPLING_CANDLES: "/sampling-simplified-prices",
  },
  PRIVATE: {
    ORDERS: "/order",
    CANCEL: "/cancel",
    CANCEL_ALL: "/cancel-all",
    ORDER_BOOK: "/order-book",
    POSITIONS: "/positions",
    BALANCE: "/balance",
    ORDER_HISTORY: "/order-history",
    TRADES: "/trades",
  },
};

export const PM_WS_CHANNELS = {
  USER: "USER",
  MARKET: "MARKET",
};

export const PM_ORDER_TYPES = {
  GTC: "GTC", // Good Till Cancelled
  FOK: "FOK", // Fill Or Kill
  GTD: "GTD", // Good Till Date
  FAK: "FAK", // Fill And Kill
};

export const PM_ORDER_SIDES = {
  BUY: "BUY",
  SELL: "SELL",
};

export const PM_EIP712_DOMAIN = {
  name: "ClobAuthDomain",
  version: "1",
  chainId: 137, // Polygon Chain ID
};

export const PM_OPERATOR_ADDRESS = "0x4bFb41d5B3570DeFd03C3c26f0dF6b34b76d8BaD";

export const PM_RATE_LIMITS = {
  REST_API: 10, // requests per second
  WS_MESSAGES: 100, // messages per second
  ORDER_PLACEMENT: 5, // orders per second
};

export const PM_DEFAULT_EXPIRATION = 86400; // 24 hours in seconds
export const PM_MAX_ORDERS_PER_BATCH = 10;
export const PM_RECONNECT_DELAY = 5000; // 5 seconds
export const PM_HEARTBEAT_INTERVAL = 30000; // 30 seconds

export const PM_CONFIG = {
  PUBLIC_API_URL: "https://gamma-api.polymarket.com",
  PRIVATE_API_URL: "https://clob.polymarket.com",
  WS_PUBLIC_URL: "wss://ws-subscriptions-clob.polymarket.com/ws/market",
  WS_PRIVATE_URL: "wss://ws-subscriptions-clob.polymarket.com/ws/user",
  WS_TRADE_URL: "",
  options: {
    tickSize: PM_TICK_SIZE,
    minSize: PM_MIN_SIZE,
    maxDecimals: PM_MAX_DECIMALS,
    defaultExpiration: PM_DEFAULT_EXPIRATION,
    maxOrdersPerBatch: PM_MAX_ORDERS_PER_BATCH,
    operatorAddress: PM_OPERATOR_ADDRESS,
    rateLimits: PM_RATE_LIMITS,
    // CORS proxy configuration
    corsProxy: {
      enabled: false, // Set to true to enable CORS proxy
      baseUrl: "https://corsproxy.io/?key=68cf79d5&url=",
      // Alternative proxies:
      // baseUrl: "https://cors-anywhere.herokuapp.com/",
      // baseUrl: "https://api.allorigins.win/raw?url=",
    },
  },
};
