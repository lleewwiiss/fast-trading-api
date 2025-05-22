import type { HyperLiquidWorker } from "./hl.worker";
import type { HLActiveAssetCtxWs } from "./hl.types";

import type { Account, Ticker } from "~/types";
import { ReconnectingWebSocket } from "~/utils/reconnecting-websocket.utils";

export class HyperLiquidWs {
  parent: HyperLiquidWorker;

  pingAt = 0;
  isStopped = false;

  ws: ReconnectingWebSocket | null = null;
  pingTimeout: NodeJS.Timeout | null = null;

  pendingRequests = new Map<string, (data: any) => void>();
  messageHandlers: Record<string, (data: Record<string, any>) => void> = {};

  subscribedAccounts: Set<Account> = new Set();

  constructor({ parent }: { parent: HyperLiquidWorker }) {
    this.parent = parent;
    this.messageHandlers.pong = this.handlePong;
    this.messageHandlers.post = this.handlePostResponse;
    this.messageHandlers.activeAssetCtx = this.handleactiveAssetCtx;
    this.listenWebSocket();
  }

  listenWebSocket = () => {
    this.ws = new ReconnectingWebSocket(this.parent.config.WS_PUBLIC_URL);
    this.ws.addEventListener("open", this.onOpen);
    this.ws.addEventListener("message", this.onMessage);
    this.ws.addEventListener("close", this.onClose);
  };

  listenAccount = (account: Account) => {
    if (!this.subscribedAccounts.has(account)) {
      this.subscribedAccounts.add(account);
      this.subscribe({ type: "notifications", user: account.apiKey });
      this.subscribe({ type: "web2Data", user: account.apiKey });
      this.subscribe({ type: "orderUpdates", user: account.apiKey });
      this.subscribe({ type: "userEvents", user: account.apiKey });
      this.subscribe({ type: "userFills", user: account.apiKey });
    }
  };

  onOpen = () => {
    this.parent.log(`HyperLiquid WebSocket opened`);
    this.ping();
    for (const ticker in this.parent.memory.public.tickers) {
      this.subscribe({ type: "activeAssetCtx", coin: ticker });
    }
  };

  ping = () => {
    this.pingAt = performance.now();
    this.send({ method: "ping" });
  };

  onMessage = (event: MessageEvent) => {
    try {
      const json = JSON.parse(event.data);
      for (const key in this.messageHandlers) {
        this.messageHandlers[key](json);
      }
    } catch (error: any) {
      this.parent.error(`HyperLiquid WebSocket message error`);
      this.parent.error(error.message);
    }
  };

  handlePong = (json: Record<string, any>) => {
    if (json.channel === "pong") {
      const latency = (performance.now() - this.pingAt) / 2;

      this.parent.emitChanges([
        { type: "update", path: "public.latency", value: latency },
      ]);

      this.pingTimeout = setTimeout(() => {
        this.ping();
      }, 10_000);
    }
  };

  handlePostResponse = (json: Record<string, any>) => {
    if (json.channel === "post" && json.data.id) {
      const callback = this.pendingRequests.get(json.data.id);

      if (callback) {
        callback(json);
        this.pendingRequests.delete(json.data.id);
      }
    }
  };

  handleactiveAssetCtx = (json: Record<string, any>) => {
    if (json.channel === "activeAssetCtx") {
      const {
        data: { coin, ctx },
      } = json as HLActiveAssetCtxWs;

      if (coin in this.parent.memory.public.tickers) {
        const ticker = this.parent.memory.public.tickers[coin];
        const t: Partial<Ticker> & { symbol: string } = {
          symbol: coin,
        };

        const last = ctx.midPx ? parseFloat(ctx.midPx) : ticker.last;

        if (ctx.funding) t.fundingRate = parseFloat(ctx.funding);
        if (ctx.openInterest) t.openInterest = parseFloat(ctx.openInterest);
        if (ctx.midPx) t.last = parseFloat(ctx.midPx);
        if (ctx.oraclePx) t.index = parseFloat(ctx.oraclePx);
        if (ctx.markPx) t.mark = parseFloat(ctx.markPx);
        if (ctx.dayNtlVlm) t.quoteVolume = parseFloat(ctx.dayNtlVlm);
        if (ctx.dayBaseVlm) t.volume = parseFloat(ctx.dayBaseVlm);

        if (ctx.impactPxs) {
          t.bid = parseFloat(ctx.impactPxs[0]);
          t.ask = parseFloat(ctx.impactPxs[1]);
        }

        if (ctx.prevDayPx) {
          const prevDay = parseFloat(ctx.prevDayPx);
          t.percentage = ((last - prevDay) / prevDay) * 100;
        }

        this.parent.updateTickerDelta(t);
      }
    }
  };

  onClose = () => {
    this.parent.error(`HyperLiquid WebSocket closed`);

    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  };

  send = (data: Record<string, any>) => {
    if (!this.isStopped) this.ws?.send(JSON.stringify(data));
  };

  subscribe = (subscription: Record<string, string> & { type: string }) => {
    this.send({ method: "subscribe", subscription });
  };

  stop = () => {
    this.isStopped = true;

    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  };
}
