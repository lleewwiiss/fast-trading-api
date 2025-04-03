import { bybitWebsocketAuth } from "./bybit.api";
import { BYBIT_API } from "./bybit.config";
import type {
  BybitBalance,
  BybitOrder,
  BybitWebsocketPosition,
} from "./bybit.types";
import { mapBybitBalance, mapBybitPosition } from "./bybit.utils";
import type { BybitWorker } from "./bybit.worker";

import type { ExchangeAccount } from "~/types/exchange.types";

export class BybitWsPrivate {
  private parent: BybitWorker;
  private isStopped = false;

  private ws: WebSocket | null = null;
  private interval: NodeJS.Timeout | null = null;

  private account: ExchangeAccount;

  constructor({
    parent,
    account,
  }: {
    parent: BybitWorker;
    account: ExchangeAccount;
  }) {
    this.parent = parent;
    this.account = account;

    this.listenWebsocket();
  }

  private listenWebsocket = () => {
    this.ws = new WebSocket(BYBIT_API.BASE_WS_PRIVATE_URL);
    this.ws.onopen = this.onOpen;
    this.ws.onerror = this.onError;
    this.ws.onmessage = this.onMessage;
    this.ws.onclose = this.onClose;
  };

  private onOpen = async () => {
    await this.auth();
    this.ping();
    this.send({ op: "subscribe", args: ["position.linear"] });
    this.send({ op: "subscribe", args: ["order.linear"] });
    this.send({ op: "subscribe", args: ["wallet"] });
  };

  private auth = async () => {
    const authArgs = await bybitWebsocketAuth({
      key: this.account.apiKey,
      secret: this.account.apiSecret,
    });

    this.send({ op: "auth", args: authArgs });
  };

  private ping = () => {
    this.interval = setInterval(() => {
      this.send({ op: "ping" });
    }, 10_000);
  };

  private onMessage = (event: MessageEvent) => {
    if (event.data.includes('"topic":"position.linear"')) {
      const { data }: { data: BybitWebsocketPosition[] } = JSON.parse(
        event.data,
      );

      this.parent.updateAccountPositions({
        accountId: this.account.id,
        positions: data.map(mapBybitPosition),
      });
    }

    if (event.data.includes('"topic":"wallet"')) {
      const { data }: { data: BybitBalance[] } = JSON.parse(event.data);

      this.parent.updateAccountBalance({
        accountId: this.account.id,
        balance: mapBybitBalance(data[0]),
      });
    }

    if (event.data.includes('"topic":"order.linear"')) {
      const { data }: { data: BybitOrder[] } = JSON.parse(event.data);

      this.parent.updateAccountOrders({
        accountId: this.account.id,
        bybitOrders: data,
      });
    }
  };

  private onError = () => {};

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
