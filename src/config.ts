import { ExchangeName, type ExchangeConfig } from "./types";
import { ONCHAIN_CONFIG } from "./exchanges/onchain/onchain.config";
import { PM_CONFIG } from "./exchanges/polymarket/pm.config";

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
    options: {
      builderAddress: "",
      builderFees: 0,
    },
  },
  [ExchangeName.BINANCE]: {
    PUBLIC_API_URL: "https://fapi.binance.com",
    PRIVATE_API_URL: "https://fapi.binance.com",
    WS_PUBLIC_URL: "wss://fstream.binance.com/ws",
    WS_PRIVATE_URL: "wss://fstream.binance.com/ws",
    WS_TRADE_URL: "",
  },
  [ExchangeName.ONCHAIN]: ONCHAIN_CONFIG,
  [ExchangeName.POLYMARKET]: PM_CONFIG,
};
