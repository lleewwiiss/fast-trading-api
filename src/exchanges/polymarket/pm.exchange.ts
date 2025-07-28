import { BaseExchange } from "../base.exchange";

import { FastTradingApi } from "~/lib/fast-trading-api.lib";
import { ExchangeName } from "~/types/lib.types";

export const createPolymarketExchange = (api: FastTradingApi) => {
  return new BaseExchange({
    name: ExchangeName.POLYMARKET,
    config: api.config[ExchangeName.POLYMARKET],
    parent: api,
    createWorker() {
      return new Worker(new URL("./pm.worker", import.meta.url), {
        type: "module",
      });
    },
  });
};
