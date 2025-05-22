import type { HyperLiquidWorker } from "./hl.worker";

import type { Account } from "~/types/lib.types";
import { ReconnectingWebSocket } from "~/utils/reconnecting-websocket.utils";

export class HyperLiquidWsPrivate {
  parent: HyperLiquidWorker;
  account: Account;

  ws: ReconnectingWebSocket | null = null;
  interval: NodeJS.Timeout | null = null;

  pendingRequests = new Map<string, (data: any) => void>();

  isStopped = false;
  isListening = false;

  constructor({
    parent,
    account,
  }: {
    parent: HyperLiquidWorker;
    account: Account;
  }) {
    this.parent = parent;
    this.account = account;
    this.listenWebsocket();
  }

  listenWebsocket = () => {
    this.ws = new ReconnectingWebSocket(this.parent.config.WS_PRIVATE_URL);
    this.ws.addEventListener("open", this.onOpen);
    this.ws.addEventListener("message", this.onMessage);
    this.ws.addEventListener("close", this.onClose);
  };

  startListening = () => {
    // We simply toggle handle message from websocket
    // because we don't want to handle messages before fetching initial data
    // but we still want to initiate the connection
    this.isListening = true;
  };

  onOpen = () => {
    this.parent.log(
      `HyperLiquid Private WebSocket Opened for account [${this.account.id}]`,
    );

    this.ping();

    this.subscribe({ type: "notifications", user: this.account.apiKey });
    this.subscribe({ type: "web2Data", user: this.account.apiKey });
    this.subscribe({ type: "orderUpdates", user: this.account.apiKey });
    this.subscribe({ type: "userEvents", user: this.account.apiKey });
    this.subscribe({ type: "userFills", user: this.account.apiKey });
  };

  ping = () => {
    this.interval = setInterval(() => {
      this.send({ method: "ping" });
    }, 10_000);
  };

  send = (data: Record<string, any>) => {
    if (!this.isStopped) this.ws?.send(JSON.stringify(data));
  };

  subscribe = (subscription: Record<string, string> & { type: string }) => {
    this.send({ method: "subscribe", subscription });
  };

  onMessage = (event: MessageEvent) => {
    // We don't want to handle messages before fetching initial data
    if (!this.isListening) return;

    try {
      const json = JSON.parse(event.data);

      if (json.channel === "orderUpdates") {
        this.parent.updateAccountOrders({
          accountId: this.account.id,
          hlOrders: json.data,
        });
      }

      if (json.channel === "post" && json.data.id) {
        const callback = this.pendingRequests.get(json.data.id);

        if (callback) {
          callback(json);
          this.pendingRequests.delete(json.data.id);
        }
      }
    } catch (error: any) {
      this.parent.error(`HyperLiquid WebSocket message error`);
      this.parent.error(error.message);
    }
  };

  onClose = () => {
    this.parent.error(
      `HyperLiquid Private Websocket Closed for account [${this.account.id}]`,
    );

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  };

  stop = () => {
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
