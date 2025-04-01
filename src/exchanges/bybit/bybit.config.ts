export const RECV_WINDOW = 5000;
export const BROKER_ID = "Gi000266";

export const BYBIT_API = {
  BASE_URL: "https://api.bybit.com",
  BASE_WS_PUBLIC_URL: "wss://stream.bybit.com/v5/public/linear",
  BASE_WS_PRIVATE_URL: "wss://stream.bybit.com/v5/private",
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
