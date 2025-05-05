import { BaseExchange } from "../base.exchange";

import { FastTradingApi } from "~/lib/fast-trading-api.lib";
import { ExchangeName } from "~/types/lib.types";

export const createBybitExchange = ({ api }: { api: FastTradingApi }) => {
  return new BaseExchange({
    name: ExchangeName.BYBIT,
    parent: api,
    createWorker() {
      return new Worker(new URL("./bybit.worker", import.meta.url), {
        type: "module",
      });
    },
  });
};
