import { BaseExchange } from "../base.exchange";

import { ONCHAIN_CONFIG } from "./onchain.config";

import type { FastTradingApi } from "~/lib/fast-trading-api.lib";
import type { ExchangeConfig } from "~/types/lib.types";

export function createOnchainExchange(
  parent: FastTradingApi,
  config?: Partial<ExchangeConfig>,
): BaseExchange {
  const finalConfig = { ...ONCHAIN_CONFIG, ...config };

  return new BaseExchange({
    name: "onchain",
    config: finalConfig,
    parent,
    createWorker: () =>
      new Worker(new URL("./onchain.worker.js", import.meta.url)),
  });
}
