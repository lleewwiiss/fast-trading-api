import { BaseWorker } from "../base.worker";

import {
  fetchHLMarketsAndTickers,
  fetchHLUserAccount,
  fetchHLUserOrders,
} from "./hl.resolver";
import { HyperLiquidWs } from "./hl.ws";

import { DEFAULT_CONFIG } from "~/config";
import {
  ExchangeName,
  type Account,
  type ExchangeConfig,
} from "~/types/lib.types";

export class HyperLiquidWorker extends BaseWorker {
  ws: HyperLiquidWs | null = null;

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
    // 1. fetch markets and tickers
    const { markets, tickers } = await fetchHLMarketsAndTickers(this.config);

    this.emitChanges([
      { type: "update", path: "loaded.markets", value: true },
      { type: "update", path: "loaded.tickers", value: true },
      { type: "update", path: "public.markets", value: markets },
      { type: "update", path: "public.tickers", value: tickers },
    ]);

    this.log(`Loaded ${Object.keys(markets).length} HyperLiquid markets`);

    // 2. start websocket connection
    this.ws = new HyperLiquidWs({ parent: this });
  }

  async addAccounts({
    accounts,
    requestId,
  }: {
    accounts: Account[];
    requestId?: string;
  }) {
    super.addAccounts({ accounts, requestId });

    await Promise.all(
      accounts.map(async (account) => {
        const { balance, positions } = await fetchHLUserAccount({
          config: this.config,
          account,
        });

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.positions`,
            value: positions,
          },
          {
            type: "update",
            path: `private.${account.id}.balance`,
            value: balance,
          },
          {
            type: "update",
            path: `private.${account.id}.metadata.leverage`,
            value: Object.fromEntries(
              positions.map((p) => [p.symbol, p.leverage]),
            ),
          },
          {
            type: "update",
            path: `private.${account.id}.metadata.hedgedPosition`,
            value: Object.fromEntries(
              positions.map((p) => [p.symbol, p.isHedged ?? false]),
            ),
          },
        ]);

        this.log(
          `Loaded ${positions.length} HyperLiquid positions for account [${account.id}]`,
        );
      }),
    );

    for (const account of accounts) {
      // Start listening on user data
      this.ws?.listenAccount(account);

      // Fetch user orders
      const orders = await fetchHLUserOrders({ config: this.config, account });
      this.emitChanges([
        {
          type: "update",
          path: `private.${account.id}.orders`,
          value: orders,
        },
      ]);

      this.log(
        `Loaded ${orders.length} HyperLiquid orders for account [${account.id}]`,
      );
    }

    if (requestId) {
      this.emitResponse({ requestId });
    }
  }
}

new HyperLiquidWorker({
  name: ExchangeName.HL,
  config: DEFAULT_CONFIG[ExchangeName.HL],
  parent: self,
});
