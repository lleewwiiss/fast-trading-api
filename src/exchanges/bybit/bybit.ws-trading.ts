import { bybitWebsocketAuth } from "./bybit.api";
import { BROKER_ID, BYBIT_API, RECV_WINDOW } from "./bybit.config";
import type {
  BybitPlaceOrderBatchResponse,
  BybitPlaceOrderOpts,
} from "./bybit.types";
import type { BybitWorker } from "./bybit.worker";
import { getHedgedOrderPositionIdx } from "./bybit.utils";

import { chunk } from "~/utils/chunk.utils";
import type { Account, Market, Order } from "~/types/lib.types";
import { genId } from "~/utils/gen-id.utils";
import { adjust } from "~/utils/safe-math.utils";
import { sleep } from "~/utils/sleep.utils";
import { ReconnectingWebSocket } from "~/lib/reconnecting-websocket.lib";

type Data = {
  op: string;
  reqId?: string;
  header?: Record<string, string>;
  args?: string[] | Record<string, any>[];
};

export class BybitWsTrading {
  private account: Account;
  private parent: BybitWorker;

  private isStopped = false;

  private ws: ReconnectingWebSocket | null = null;
  private interval: NodeJS.Timeout | null = null;

  private pendingRequests = new Map<string, (data: any) => void>();

  private queue: { payload: Data; consume: number }[] = [];
  private isProcessing = false;
  private rateLimit = 10;
  private queueInterval = 1000 / this.rateLimit;

  constructor({ account, parent }: { account: Account; parent: BybitWorker }) {
    this.account = account;
    this.parent = parent;
    this.listenWebsocket();
  }

  private listenWebsocket = () => {
    this.ws = new ReconnectingWebSocket(BYBIT_API.BASE_WS_TRADE_URL);
    this.ws.addEventListener("open", this.onOpen);
    this.ws.addEventListener("message", this.onMessage);
    this.ws.addEventListener("close", this.onClose);
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

  private onClose = () => {
    this.parent.error(
      `Bybit Trading Websocket Closed for account [${this.account.id}]`,
    );

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  };

  private send = (data: Data) => {
    if (!this.isStopped) this.ws?.send(JSON.stringify(data));
  };

  public placeOrderBatch = ({
    orders,
    priority = false,
    retry = true,
  }: {
    orders: BybitPlaceOrderOpts[];
    priority?: boolean;
    retry?: boolean;
  }) => {
    return new Promise<string[]>((resolve) => {
      const batches = chunk(orders, 10);

      const responses: BybitPlaceOrderBatchResponse["data"]["list"] = [];
      const toRetry: BybitPlaceOrderOpts[] = [];

      for (const batch of batches) {
        const reqId = genId();

        this.pendingRequests.set(
          reqId,
          async (data: BybitPlaceOrderBatchResponse) => {
            data.retExtInfo.list.forEach((res, idx) => {
              if (
                res.code === 10001 &&
                res.msg === "position idx not match position mode"
              ) {
                const order = batch[idx];
                const positionIdx = getHedgedOrderPositionIdx(order);
                this.parent.hedgedCache[this.account.id][order.symbol] = true;
                toRetry.push({ ...order, positionIdx });
              }
            });

            responses.push(...data.data.list);

            if (responses.length === orders.length) {
              const orderIds: string[] = [];

              if (toRetry.length > 0 && retry) {
                const retriedOrderIds = await this.placeOrderBatch({
                  orders: toRetry,
                  priority,
                  retry: false,
                });

                orderIds.push(...retriedOrderIds);
              }

              orderIds.push(
                ...responses
                  .filter((o) => o.orderId !== "")
                  .map((o) => o.orderId),
              );

              resolve(orderIds);
            }
          },
        );

        this.enqueueSend({
          consume: batch.length,
          priority,
          payload: {
            op: "order.create-batch",
            reqId,
            args: [{ category: "linear", request: batch }],
          },
        });
      }
    });
  };

  public updateOrders = ({
    updates,
    priority = false,
  }: {
    updates: {
      order: Order;
      market: Market;
      update: { price: number } | { amount: number };
    }[];
    priority?: boolean;
  }) => {
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

        this.enqueueSend({
          consume: batch.length,
          priority,
          payload: {
            op: "order.amend-batch",
            reqId,
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

                  return amendedOrder;
                }),
              },
            ],
          },
        });
      }
    });
  };

  public cancelOrders = ({
    orders,
    priority = false,
  }: {
    orders: Order[];
    priority?: boolean;
  }) => {
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

        this.enqueueSend({
          consume: batch.length,
          priority,
          payload: {
            op: "order.cancel-batch",
            reqId,
            args: [
              {
                category: "linear",
                request: batch.map((o) => ({
                  symbol: o.symbol,
                  orderId: o.id,
                })),
              },
            ],
          },
        });
      }
    });
  };

  private enqueueSend = ({
    payload,
    consume = 1,
    priority = false,
  }: {
    payload: Data;
    consume?: number;
    priority?: boolean;
  }) => {
    if (priority) {
      this.queue.unshift({ payload, consume });
    } else {
      this.queue.push({ payload, consume });
    }

    if (!this.isProcessing) {
      this.processQueue();
    }
  };

  private processQueue = async () => {
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();

      if (item) {
        const { payload, consume } = item;

        this.send({
          ...payload,
          header: {
            "X-BAPI-TIMESTAMP": `${Date.now()}`,
            "X-BAPI-RECV-WINDOW": `${RECV_WINDOW}`,
            Referer: BROKER_ID,
          },
        });

        await sleep(this.queueInterval * consume);
      }
    }

    this.isProcessing = false;
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
