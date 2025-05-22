import { ExchangeName, type ExchangeConfig } from "./types";

export const DEFAULT_CONFIG: Record<ExchangeName, ExchangeConfig> = {
  [ExchangeName.BYBIT]: {
    PUBLIC_API_URL: "https://api.bybit.com",
    PRIVATE_API_URL: "https://api.bybit.com",
    WS_PUBLIC_URL: "wss://stream.bybit.com/v5/public/linear",
    WS_PRIVATE_URL: "wss://stream.bybit.com/v5/private",
    WS_TRADE_URL: "wss://stream.bybit.com/v5/trade",
  },
  [ExchangeName.HL]: {
    PUBLIC_API_URL: "https://api.hyperliquid.xyz",
    PRIVATE_API_URL: "",
    WS_PUBLIC_URL: "wss://api.hyperliquid.xyz/ws",
    WS_PRIVATE_URL: "wss://api.hyperliquid.xyz/ws",
    WS_TRADE_URL: "",
  },
};
