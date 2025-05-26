import type { HyperLiquidWorker } from "./hl.worker";
import { signL1Action } from "./hl.signer";
import { formatHlOrder } from "./hl.utils";
import type {
  HLAction,
  HLPostCancelOrdersResponse,
  HLPostPlaceOrdersResponse,
} from "./hl.types";

import type { Account, Order, PlaceOrderOpts } from "~/types/lib.types";
import { chunk } from "~/utils/chunk.utils";
import { genIntId } from "~/utils/gen-id.utils";
import { ReconnectingWebSocket } from "~/utils/reconnecting-websocket.utils";

export class HyperLiquidWsPrivate {
  parent: HyperLiquidWorker;
  account: Account;

  ws: ReconnectingWebSocket | null = null;
  interval: NodeJS.Timeout | null = null;

  pendingRequests = new Map<number, (data: any) => void>();

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

  ping = () => {
    this.interval = setInterval(() => {
      this.send({ method: "ping" });
    }, 10_000);
  };

  placeOrders = async ({
    orders,
  }: {
    orders: PlaceOrderOpts[];
    priority?: boolean;
  }) => {
    const orderIds: Array<Order["id"]> = [];

    return new Promise<Array<Order["id"]>>(async (resolve) => {
      const reqId = genIntId();

      this.pendingRequests.set(reqId, (json: HLPostPlaceOrdersResponse) => {
        if (json?.data?.response?.payload?.status === "ok") {
          json.data.response.payload.response.data.statuses.forEach(
            (status: any) => {
              orderIds.push(status.resting?.oid ?? status.filled?.oid);
            },
          );
        }

        resolve(orderIds);
      });

      const action = {
        type: "order" as const,
        orders: orders.map((o) =>
          formatHlOrder({
            order: o,
            tickers: this.parent.memory.public.tickers,
            markets: this.parent.memory.public.markets,
          }),
        ),
        grouping: "na",
      } as HLAction;

      const nonce = Date.now();
      const signature = await signL1Action({
        privateKey: this.account.apiSecret,
        action,
        nonce,
      });

      this.send({
        method: "post",
        id: reqId,
        request: {
          type: "action",
          payload: {
            action,
            nonce,
            signature,
          },
        },
      });
    });
  };

  cancelOrders = async ({
    orders,
  }: {
    orders: Order[];
    priority?: boolean;
  }) => {
    return new Promise(async (resolve) => {
      const batches = chunk(orders, 20);
      const responses: any[] = [];

      for (const batch of batches) {
        const reqId = genIntId();

        this.pendingRequests.set(reqId, (json: HLPostCancelOrdersResponse) => {
          if (json?.data?.response?.payload?.status === "err") {
            this.parent.error(
              `[${this.account.id}] HyperLiquid cancel order error`,
            );
            this.parent.error(json.data.response.payload.response);
          }

          responses.push(json);

          if (responses.length === batches.length) {
            resolve(responses);
          }
        });

        const action = {
          type: "cancel" as const,
          cancels: batch.map((o) => ({
            a: this.parent.memory.public.markets[o.symbol].id as number,
            o: o.id as number,
          })),
        };

        const nonce = Date.now();
        const signature = await signL1Action({
          privateKey: this.account.apiSecret,
          action,
          nonce,
        });

        this.send({
          method: "post",
          id: reqId,
          request: {
            type: "action",
            payload: {
              action,
              nonce,
              signature,
            },
          },
        });
      }
    });
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

  send = (data: Record<string, any>) => {
    if (!this.isStopped) this.ws?.send(JSON.stringify(data));
  };

  subscribe = (subscription: Record<string, string> & { type: string }) => {
    this.send({ method: "subscribe", subscription });
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
