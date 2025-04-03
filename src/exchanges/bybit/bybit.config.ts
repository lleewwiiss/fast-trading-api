import type { ExchangeTimeframe } from "~/types/exchange.types";

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
