import { BaseExchange } from "../base.exchange";

import { FastTradingApi } from "~/lib/fast-trading-api.lib";
import { ExchangeName } from "~/types/lib.types";

export const createHyperliquidExchange = (api: FastTradingApi) => {
  return new BaseExchange({
    name: ExchangeName.HL,
    config: api.config[ExchangeName.HL],
    parent: api,
    createWorker() {
      return new Worker(new URL("./hl.worker", import.meta.url), {
        type: "module",
      });
    },
  });
};
