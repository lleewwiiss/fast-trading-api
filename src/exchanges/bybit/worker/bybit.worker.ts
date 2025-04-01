import {
  fetchBybitBalance,
  fetchBybitMarkets,
  fetchBybitOrders,
  fetchBybitPositions,
  fetchBybitTickers,
} from "../bybit.resolver";

import { BybitWsPublic } from "./bybit-ws-public";
import { BybitWsPrivate } from "./bybit-ws-private";

import { retry } from "~/utils/retry.utils";
import {
  PositionSide,
  type ExchangeAccount,
  type ExchangeBalance,
  type ExchangeMarket,
  type ExchangeOrder,
  type ExchangePosition,
  type ExchangeTicker,
} from "~/types";

export class BybitWorker {
  private publicWs: BybitWsPublic | null = null;
  private privateWs: BybitWsPrivate[] = [];

  private accounts: ExchangeAccount[] = [];

  private markets: Record<string, ExchangeMarket> = {};
  private tickers: Record<string, ExchangeTicker> = {};
  private balances: Record<string, ExchangeBalance> = {};
  private positions: Record<string, ExchangePosition[]> = {};
  private orders: Record<string, ExchangeOrder[]> = {};

  private async start() {
    // 1. Fetch markets & tickers
    this.markets = await retry(() => fetchBybitMarkets());
    this.tickers = await retry(() => fetchBybitTickers(this.markets));
    this.emitUpdate();

    // 2. Start public websocket
    this.publicWs = new BybitWsPublic({
      parent: this,
      markets: Object.keys(this.markets),
    });

    // 3. Fetch and poll balance per account
    await Promise.all(
      this.accounts.map(async (account) => {
        const promise = async () => {
          const balance = await fetchBybitBalance({
            key: account.apiKey,
            secret: account.apiSecret,
          });

          this.balances[account.id] = balance;
          this.emitUpdate();
        };

        await promise();
        setInterval(promise, 1000);
      }),
    );

    // 4. Fetch positions per account
    await Promise.all(
      this.accounts.map(async (account) => {
        const positions = await fetchBybitPositions({
          key: account.apiKey,
          secret: account.apiSecret,
        });

        this.positions[account.id] = positions;
        this.emitUpdate();
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

      this.orders[account.id] = orders;
      this.emitUpdate();
    }
  }

  public onMessage({
    data,
  }: MessageEvent<
    | { type: "start" }
    | { type: "stop" }
    | { type: "login"; data: ExchangeAccount[] }
  >) {
    if (data.type === "start") return this.start();
    if (data.type === "login") return this.login(data.data);
    if (data.type === "stop") return this.stop();
  }

  public updateTicker(ticker: ExchangeTicker) {
    this.tickers[ticker.symbol] = ticker;
    this.emitUpdate();
  }

  public updateTickerDelta(
    ticker: Partial<ExchangeTicker> & { symbol: string },
  ) {
    this.tickers[ticker.symbol] = { ...this.tickers[ticker.symbol], ...ticker };

    if (ticker.last) {
      const last = ticker.last;
      Object.values(this.positions).forEach((positions) => {
        const idx = positions.findIndex((p) => p.symbol === ticker.symbol);

        if (idx > -1) {
          const pos = positions[idx];
          pos.notional = last * pos.contracts;
          pos.unrealizedPnl =
            pos.side === PositionSide.Long
              ? pos.contracts * last - pos.contracts * pos.entryPrice
              : pos.contracts * pos.entryPrice - pos.contracts * last;
        }
      });
    }

    this.emitUpdate();
  }

  public updateAccountPositions({
    accountId,
    positions,
  }: {
    accountId: string;
    positions: ExchangePosition[];
  }) {
    this.positions[accountId] = positions;
    this.emitUpdate();
  }

  public updateAccountBalance({
    accountId,
    balance,
  }: {
    accountId: string;
    balance: ExchangeBalance;
  }) {
    this.balances[accountId] = balance;
    this.emitUpdate();
  }

  private login(accounts: ExchangeAccount[]) {
    this.accounts = accounts;
  }

  private stop() {
    if (this.publicWs) {
      this.publicWs.stop();
      this.publicWs = null;
    }

    this.privateWs.forEach((ws, idx) => {
      ws.stop();
      this.privateWs.splice(idx, 1);
    });
  }

  private emitUpdate() {
    self.postMessage({
      type: "update",
      data: {
        markets: this.markets,
        tickers: this.tickers,
        balances: this.balances,
        positions: this.positions,
        orders: this.orders,
      },
    });
  }
}

const worker = new BybitWorker();

self.addEventListener("message", (message) => worker.onMessage(message));
self.postMessage({ type: "ready" });
