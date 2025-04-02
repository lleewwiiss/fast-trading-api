import { BybitWsPublic } from "./bybit.ws-public";
import { BybitWsPrivate } from "./bybit.ws-private";
import {
  fetchBybitOrders,
  fetchBybitBalance,
  fetchBybitMarkets,
  fetchBybitPositions,
  fetchBybitTickers,
} from "./bybit.resolver";

import { applyChanges } from "~/utils/update-obj-path.utils";
import {
  ExchangeName,
  PositionSide,
  type ExchangeAccount,
  type ExchangeBalance,
  type ExchangePosition,
  type ExchangeTicker,
} from "~/types/exchange.types";
import type { StoreMemory } from "~/types/lib.types";
import type {
  Entries,
  ObjectChangeCommand,
  ObjectPaths,
} from "~/types/misc.types";

export class BybitWorker {
  private accounts: ExchangeAccount[] = [];
  private memory: StoreMemory[ExchangeName] = {
    public: { tickers: {}, markets: {} },
    private: {},
  };

  private publicWs: BybitWsPublic | null = null;
  private privateWs: BybitWsPrivate[] = [];

  public onMessage = (
    event: MessageEvent<
      | { type: "start" }
      | { type: "stop" }
      | { type: "login"; accounts: ExchangeAccount[] }
    >,
  ) => {
    if (event.data.type === "start") this.start();
    if (event.data.type === "login") this.login(event.data.accounts);
    if (event.data.type === "stop") this.stop();
  };

  private login(accounts: ExchangeAccount[]) {
    this.accounts = accounts;
    this.emitChanges(
      this.accounts.map((acc) => ({
        type: "update",
        path: `private.${acc.id}`,
        value: {
          balance: { used: 0, free: 0, total: 0, upnl: 0 },
          positions: [],
          orders: [],
        },
      })),
    );
  }

  private stop() {
    if (this.publicWs) {
      this.publicWs.stop();
      this.publicWs = null;
    }

    if (this.privateWs.length > 0) {
      this.privateWs.forEach((ws) => ws.stop());
      this.privateWs = [];
    }
  }

  private async start() {
    // 1. Fetch markets and tickers
    const markets = await fetchBybitMarkets();
    const tickers = await fetchBybitTickers(markets);

    this.emitChanges([
      { type: "update", path: "public.markets", value: markets },
      { type: "update", path: "public.tickers", value: tickers },
    ]);

    // 2. Start public websocket
    this.publicWs = new BybitWsPublic({
      parent: this,
      markets: Object.values(markets).map((m) => m.symbol),
    });

    // 3. Fetch and poll balance per account
    await Promise.all(
      this.accounts.map(async (account) => {
        const balance = await fetchBybitBalance({
          key: account.apiKey,
          secret: account.apiSecret,
        });

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.balance`,
            value: balance,
          },
        ]);
      }),
    );

    // 4. Fetch positions per account
    await Promise.all(
      this.accounts.map(async (account) => {
        const positions = await fetchBybitPositions({
          key: account.apiKey,
          secret: account.apiSecret,
        });

        this.emitChanges([
          {
            type: "update",
            path: `private.${account.id}.positions`,
            value: positions,
          },
        ]);
      }),
    );

    // 5. Start private websocket per account
    for (const account of this.accounts) {
      this.privateWs.push(
        new BybitWsPrivate({
          parent: this,
          account,
        }),
      );
    }

    // 6. Fetch orders per account
    for (const account of this.accounts) {
      const orders = await fetchBybitOrders({
        key: account.apiKey,
        secret: account.apiSecret,
      });

      this.emitChanges([
        {
          type: "update",
          path: `private.${account.id}.orders`,
          value: orders,
        },
      ]);
    }
  }

  public updateAccountBalance({
    accountId,
    balance,
  }: {
    accountId: ExchangeAccount["id"];
    balance: ExchangeBalance;
  }) {
    this.emitChanges([
      {
        type: "update",
        path: `private.${accountId}.balance`,
        value: balance,
      },
    ]);
  }

  public updateAccountPositions({
    accountId,
    positions,
  }: {
    accountId: ExchangeAccount["id"];
    positions: ExchangePosition[];
  }) {
    this.emitChanges([
      {
        type: "update",
        path: `private.${accountId}.positions`,
        value: positions,
      },
    ]);
  }

  public updateTicker(ticker: ExchangeTicker) {
    this.emitChanges([
      {
        type: "update",
        path: `public.tickers.${ticker.symbol}`,
        value: ticker,
      },
    ]);
  }

  public updateTickerDelta(
    ticker: Partial<ExchangeTicker> & { symbol: string },
  ) {
    const tickerChanges = (
      Object.entries(ticker) as Entries<ExchangeTicker>
    ).map(([key, value]) => ({
      type: "update" as const,
      path: `public.tickers.${ticker.symbol}.${key}` as const,
      value,
    }));

    if (!ticker.last) {
      this.emitChanges(tickerChanges);
      return;
    }

    const positionsChanges = this.accounts.flatMap((acc) => {
      const positions = this.memory.private[acc.id].positions;
      return positions
        .filter((p) => p.symbol === ticker.symbol)
        .flatMap((p) => {
          const idx = positions.indexOf(p);
          return [
            {
              type: "update" as const,
              path: `private.${acc.id}.positions.${idx}.notional` as const,
              value: ticker.last! * p.contracts,
            },
            {
              type: "update" as const,
              path: `private.${acc.id}.positions.${idx}.unrealizedPnl` as const,
              value:
                p.side === PositionSide.Long
                  ? p.contracts * ticker.last! - p.contracts * p.entryPrice
                  : p.contracts * p.entryPrice - p.contracts * ticker.last!,
            },
          ];
        });
    });

    this.emitChanges([...tickerChanges, ...positionsChanges]);
  }

  public emitChanges = <P extends ObjectPaths<StoreMemory[ExchangeName]>>(
    changes: ObjectChangeCommand<StoreMemory[ExchangeName], P>[],
  ) => {
    self.postMessage({
      type: "update",
      changes: changes.map(({ path, ...rest }) => ({
        ...rest,
        path: `${ExchangeName.BYBIT}.${path}`,
      })),
    });

    applyChanges({ obj: this.memory, changes });
  };
}

const worker = new BybitWorker();

self.addEventListener("message", worker.onMessage);
self.postMessage({ type: "ready" });
