import { BaseWorker } from "../base.worker";

import { fetchHLMarketsAndTickers } from "./hl.resolver";

import { DEFAULT_CONFIG } from "~/config";
import {
  ExchangeName,
  type Account,
  type ExchangeConfig,
} from "~/types/lib.types";

export class HyperLiquidWorker extends BaseWorker {
  async start({
    accounts,
    config,
    requestId,
  }: {
    accounts: Account[];
    config: ExchangeConfig;
    requestId: string;
  }) {
    await super.start({ accounts, requestId, config });
    await this.fetchPublic();
    this.emitResponse({ requestId });
  }

  async fetchPublic() {
    const { markets, tickers } = await fetchHLMarketsAndTickers(this.config);

    this.emitChanges([
      { type: "update", path: "loaded.markets", value: true },
      { type: "update", path: "loaded.tickers", value: true },
      { type: "update", path: "public.markets", value: markets },
      { type: "update", path: "public.tickers", value: tickers },
    ]);

    this.log(`Loaded ${Object.keys(markets).length} HyperLiquid markets`);
  }

  async addAccounts({
    accounts,
    requestId,
  }: {
    accounts: Account[];
    requestId: string;
  }) {
    super.addAccounts({ accounts, requestId });
  }
}

new HyperLiquidWorker({
  name: ExchangeName.HL,
  config: DEFAULT_CONFIG[ExchangeName.HL],
  parent: self,
});
