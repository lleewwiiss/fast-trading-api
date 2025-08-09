import type { ExchangeConfig } from "~/types/lib.types";

export const ONCHAIN_CONFIG: ExchangeConfig = {
  PUBLIC_API_URL: "https://li.quest/v1",
  PRIVATE_API_URL: "https://graph.codex.io/graphql",
  WS_PUBLIC_URL: "",
  WS_PRIVATE_URL: "",
  WS_TRADE_URL: "",
  options: {
    lifiApiUrl: "https://li.quest/v1",
    codexApiUrl: "https://graph.codex.io/graphql",
    privyAppId: "",
    privyAppSecret: "",
    privyVerificationKey: "",
    timeout: 30000,
    testnet: false,
    corsProxy: {
      enabled: false,
      useLocalProxy: false,
      baseUrl: "",
    },
  },
};
