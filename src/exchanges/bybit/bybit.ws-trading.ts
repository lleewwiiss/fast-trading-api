import { bybitWebsocketAuth } from "./bybit.api";
import { BYBIT_API } from "./bybit.config";
import type {
  BybitPlaceOrderBatchResponse,
  BybitPlaceOrderOpts,
} from "./bybit.types";
import type { BybitWorker } from "./bybit.worker";

import { chunk } from "~/utils/chunk.utils";
import type { Account, Market, Order } from "~/types/lib.types";
import { genId } from "~/utils/gen-id.utils";
import { adjust } from "~/utils/safe-math.utils";

export class BybitWsTrading {
  private account: Account;
  private parent: BybitWorker;

  private isStopped = false;

  private ws: WebSocket | null = null;
  private interval: NodeJS.Timeout | null = null;

  private pendingRequests = new Map<string, (data: any) => void>();

  constructor({ account, parent }: { account: Account; parent: BybitWorker }) {
    this.account = account;
    this.parent = parent;
    this.listenWebsocket();
  }

  private listenWebsocket = () => {
    this.ws = new WebSocket(BYBIT_API.BASE_WS_TRADE_URL);
    this.ws.onopen = this.onOpen;
    this.ws.onerror = this.onError;
    this.ws.onmessage = this.onMessage;
    this.ws.onclose = this.onClose;
  };

  private onOpen = async () => {
    this.parent.log(
      `Bybit Trading Websocket Opened for account [${this.account.id}]`,
    );

    await this.auth();
    this.ping();
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
    if (event.data.includes("reqId")) {
      const data = JSON.parse(event.data);
      const callback = this.pendingRequests.get(data.reqId);

      if (callback) {
        callback(data);
        this.pendingRequests.delete(data.reqId);
      }
    }
  };

  private onError = (error: Event) => {
    this.parent.error(
      `Bybit Trading Websocket Error for account [${this.account.id}]`,
    );
    this.parent.error(error);
  };

  private onClose = () => {
    this.parent.log(
      `Bybit Trading Websocket Closed for account [${this.account.id}]`,
    );

    if (this.isStopped) return;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.ws = null;
    this.listenWebsocket();
  };

  private send = (data: {
    op: string;
    reqId?: string;
    header?: Record<string, string>;
    args?: string[] | Record<string, any>[];
  }) => {
    if (!this.isStopped) this.ws?.send(JSON.stringify(data));
  };

  public placeOrderBatch = (orders: BybitPlaceOrderOpts[]) => {
    return new Promise<string[]>((resolve) => {
      const batches = chunk(orders, 20);
      const responses: BybitPlaceOrderBatchResponse[] = [];

      for (const batch of batches) {
        const reqId = genId();

        this.pendingRequests.set(
          reqId,
          (data: BybitPlaceOrderBatchResponse) => {
            responses.push(data);

            if (responses.length === batches.length) {
              const orderIds = responses.flatMap((res) =>
                res.data.list
                  .filter((o) => o.orderId !== "")
                  .map((o) => o.orderId),
              );

              resolve(orderIds);
            }
          },
        );

        this.send({
          op: "order.create-batch",
          reqId,
          header: {
            "X-BAPI-TIMESTAMP": Date.now().toString(),
            "X-BAPI-RECV-WINDOW": "5000",
          },
          args: [
            {
              category: "linear",
              request: batch,
            },
          ],
        });
      }
    });
  };

  public updateOrders = (
    updates: {
      order: Order;
      market: Market;
      update: { price: number } | { amount: number };
    }[],
  ) => {
    return new Promise((resolve) => {
      const batches = chunk(updates, 10);
      const responses: any[] = [];

      for (const batch of batches) {
        const reqId = genId();

        this.pendingRequests.set(reqId, (data: any) => {
          responses.push(data);

          if (responses.length === batches.length) {
            resolve(responses);
          }
        });

        this.send({
          op: "order.amend-batch",
          reqId,
          header: {
            "X-BAPI-TIMESTAMP": Date.now().toString(),
            "X-BAPI-RECV-WINDOW": "5000",
          },
          args: [
            {
              category: "linear",
              request: batch.map(({ order, market, update }) => {
                const amendedOrder: Record<string, string> = {
                  symbol: order.symbol,
                  orderId: order.id,
                };

                if ("price" in update) {
                  amendedOrder["price"] = adjust(
                    update.price,
                    market.precision.price,
                  ).toString();
                }

                if ("amount" in update) {
                  amendedOrder["qty"] = adjust(
                    update.amount,
                    market.precision.amount,
                  ).toString();
                }
              }),
            },
          ],
        });
      }
    });
  };

  public cancelOrders = (orders: Order[]) => {
    return new Promise((resolve) => {
      const batches = chunk(orders, 10);
      const responses: any[] = [];

      for (const batch of batches) {
        const reqId = genId();

        this.pendingRequests.set(reqId, (data: any) => {
          responses.push(data);

          if (responses.length === batches.length) {
            resolve(responses);
          }
        });

        this.send({
          op: "order.cancel-batch",
          reqId,
          header: {
            "X-BAPI-TIMESTAMP": Date.now().toString(),
            "X-BAPI-RECV-WINDOW": "5000",
          },
          args: [
            {
              category: "linear",
              request: batch.map((o) => ({ symbol: o.symbol, orderId: o.id })),
            },
          ],
        });
      }
    });
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
