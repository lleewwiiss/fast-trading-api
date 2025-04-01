import { BYBIT_API } from "../bybit.config";
import type { BybitTicker } from "../bybit.types";
import { mapBybitTicker } from "../bybit.utils";

import type { BybitWorker } from "./bybit.worker";

import type { ExchangeTicker } from "~/types";

export class BybitWsPublic {
  private parent: BybitWorker;
  private isStopped = false;

  private ws: WebSocket | null = null;
  private interval: NodeJS.Timeout | null = null;

  private markets: string[] = [];
  private messageHandlers: Record<string, (event: MessageEvent) => void> = {};

  constructor({ parent, markets }: { parent: BybitWorker; markets: string[] }) {
    this.parent = parent;
    this.markets = markets;
    this.messageHandlers.tickers = this.handleTickers;

    this.listenWebsocket();
  }

  private listenWebsocket = () => {
    this.ws = new WebSocket(BYBIT_API.BASE_WS_PUBLIC_URL);
    this.ws.onopen = this.onOpen;
    this.ws.onerror = this.onError;
    this.ws.onmessage = this.onMessage;
    this.ws.onclose = this.onClose;
  };

  private onOpen = () => {
    this.ping();
    this.send({
      op: "subscribe",
      args: this.markets.map((m) => `tickers.${m}`),
    });
  };

  private ping = () => {
    this.interval = setInterval(() => {
      this.send({ op: "ping" });
    }, 10_000);
  };

  private onMessage = (event: MessageEvent) => {
    Object.values(this.messageHandlers).forEach((handler) => handler(event));
  };

  private onError = () => {};

  private handleTickers = (event: MessageEvent) => {
    if (event.data.startsWith('{"topic":"tickers.')) {
      const json = JSON.parse(event.data);

      if (json.type === "snapshot") {
        const d: BybitTicker = json.data;
        const t: ExchangeTicker = mapBybitTicker(d);
        this.parent.updateTicker(t);
      }

      if (json.type === "delta") {
        const d: BybitTicker = json.data;
        const t: Partial<ExchangeTicker> & { symbol: string } = {
          symbol: d.symbol,
        };

        if (d.bid1Price) t.bid = parseFloat(d.bid1Price);
        if (d.ask1Price) t.ask = parseFloat(d.ask1Price);
        if (d.lastPrice) t.last = parseFloat(d.lastPrice);
        if (d.markPrice) t.mark = parseFloat(d.markPrice);
        if (d.indexPrice) t.index = parseFloat(d.indexPrice);
        if (d.price24hPcnt) t.percentage = parseFloat(d.price24hPcnt) * 100;
        if (d.openInterest) t.openInterest = parseFloat(d.openInterest);
        if (d.fundingRate) t.fundingRate = parseFloat(d.fundingRate);
        if (d.volume24h) t.volume = parseFloat(d.volume24h);
        if (d.turnover24h) t.quoteVolume = parseFloat(d.turnover24h);

        this.parent.updateTickerDelta(t);
      }
    }
  };

  private onClose = () => {
    if (this.isStopped) return;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.ws = null;
    this.listenWebsocket();
  };

  private send = (data: { op: string; args?: string[] }) => {
    if (!this.isStopped) this.ws?.send(JSON.stringify(data));
  };

  public stop = () => {
    this.isStopped = true;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  };
}
