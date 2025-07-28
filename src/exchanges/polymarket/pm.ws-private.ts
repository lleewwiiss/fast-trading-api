import type { PolymarketWorker } from "./pm.worker";
import type { PMWSMessage, PMWSSubscription } from "./pm.types";
import {
  formatPMOrder,
  createEip712OrderMessage,
  signEip712Order,
  createL2AuthHeaders,
  mapPMOrder,
} from "./pm.utils";
import { PM_MAX_ORDERS_PER_BATCH } from "./pm.config";

import {
  OrderSide,
  PositionSide,
  type Account,
  type Order,
  type PlaceOrderOpts,
  type UpdateOrderOpts,
} from "~/types/lib.types";
import { chunk } from "~/utils/chunk.utils";
import { genId } from "~/utils/gen-id.utils";
import { ReconnectingWebSocket } from "~/utils/reconnecting-websocket.utils";
import { sleep } from "~/utils/sleep.utils";
import { tryParse } from "~/utils/try-parse.utils";

export class PolymarketWsPrivate {
  parent: PolymarketWorker;
  account: Account;

  ws: ReconnectingWebSocket | null = null;
  heartbeatInterval: NodeJS.Timeout | null = null;

  isStopped = false;
  isListening = false;
  isAuthenticated = false;

  pendingRequests = new Map<string, (data: any) => void>();
  orderNonce = 0;

  // Rate limiting
  queue: { payload: any; consume: number; priority: boolean }[] = [];
  isProcessing = false;
  rateLimit = 5; // orders per second for Polymarket
  queueInterval = 1000 / this.rateLimit;

  get memory() {
    return this.parent.memory.private[this.account.id];
  }

  constructor({
    parent,
    account,
  }: {
    parent: PolymarketWorker;
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
    this.isListening = true;
  };

  onOpen = async () => {
    this.parent.log(
      `Polymarket Private WebSocket opened for account [${this.account.id}]`,
    );

    try {
      await this.authenticate();
      this.startHeartbeat();
    } catch (error) {
      this.parent.error(`Failed to authenticate: ${error}`);
    }
  };

  authenticate = async () => {
    const authHeaders = await createL2AuthHeaders(
      this.account,
      "GET",
      "/ws/user",
    );

    const subscription: PMWSSubscription = {
      auth: authHeaders,
      type: "USER",
      markets: Object.keys(this.parent.memory.public.markets),
    };

    this.send(subscription);
    this.isAuthenticated = true;
    this.parent.log(
      `Polymarket WebSocket authenticated for [${this.account.id}]`,
    );
  };

  startHeartbeat = () => {
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: "ping" });
    }, 30000); // 30 seconds
  };

  onMessage = (event: MessageEvent) => {
    if (!this.isListening) return;

    const message = tryParse<PMWSMessage>(event.data);
    if (!message) return;

    this.handleMessage(message);
  };

  handleMessage = (message: PMWSMessage) => {
    const { channel } = message;

    switch (channel) {
      case "pong":
        // Heartbeat response
        break;

      case "order_status":
        this.handleOrderUpdate(message);
        break;

      case "trade":
        this.handleTradeUpdate(message);
        break;

      case "balance_change":
        this.handleBalanceUpdate(message);
        break;

      case "position_change":
        this.handlePositionUpdate(message);
        break;

      default:
        // Handle response to pending requests
        if (message.data && message.data.requestId) {
          const callback = this.pendingRequests.get(message.data.requestId);
          if (callback) {
            callback(message);
            this.pendingRequests.delete(message.data.requestId);
          }
        }
        break;
    }
  };

  handleOrderUpdate = (message: PMWSMessage) => {
    const data = message.data;
    if (!data || !data.order) return;

    try {
      const order = mapPMOrder({
        order: data.order,
        accountId: this.account.id,
      });

      // Update order in memory
      const existingOrderIndex = this.memory.orders.findIndex(
        (o) => o.id === order.id,
      );

      if (existingOrderIndex >= 0) {
        // Update existing order
        this.parent.emitChanges([
          {
            type: "update",
            path: `private.${this.account.id}.orders.${existingOrderIndex}`,
            value: order,
          },
        ]);
      } else {
        // Add new order
        this.parent.emitChanges([
          {
            type: "update",
            path: `private.${this.account.id}.orders.${this.memory.orders.length}`,
            value: order,
          },
        ]);
      }
    } catch (error) {
      this.parent.error(`Failed to handle order update: ${error}`);
    }
  };

  handleTradeUpdate = (message: PMWSMessage) => {
    const data = message.data;
    if (!data) return;

    // Add fill notification
    const notifLength = this.memory.notifications.length;
    const fillsLength = this.memory.fills.length;

    const changes = [
      {
        type: "update",
        path: `private.${this.account.id}.notifications.${notifLength}`,
        value: {
          id: genId(),
          accountId: this.account.id,
          type: "order_fill",
          data: {
            id: data.order_id,
            symbol: data.market || data.asset_id,
            side: data.side === "BUY" ? OrderSide.Buy : OrderSide.Sell,
            price: parseFloat(data.price),
            amount: parseFloat(data.size),
          },
        },
      } as const,
      {
        type: "update",
        path: `private.${this.account.id}.fills.${fillsLength}`,
        value: {
          symbol: data.market || data.asset_id,
          side: data.side === "BUY" ? OrderSide.Buy : OrderSide.Sell,
          price: parseFloat(data.price),
          amount: parseFloat(data.size),
          timestamp: new Date(data.timestamp).getTime(),
        },
      } as const,
    ];

    this.parent.emitChanges(changes);
  };

  handleBalanceUpdate = (message: PMWSMessage) => {
    const data = message.data;
    if (!data) return;

    // Update balance
    const updatedBalance = {
      ...this.memory.balance,
      free: parseFloat(data.available || "0"),
      total: parseFloat(data.total || "0"),
      used: parseFloat(data.used || "0"),
    };

    this.parent.emitChanges([
      {
        type: "update",
        path: `private.${this.account.id}.balance`,
        value: updatedBalance,
      },
    ]);
  };

  handlePositionUpdate = (message: PMWSMessage) => {
    const data = message.data;
    if (!data) return;

    // Find and update position
    const existingPositionIndex = this.memory.positions.findIndex(
      (p) => p.symbol === data.market,
    );

    const updatedPosition = {
      accountId: this.account.id,
      exchange: this.parent.exchangeName,
      symbol: data.market,
      side: parseFloat(data.size) > 0 ? PositionSide.Long : PositionSide.Short,
      entryPrice: parseFloat(data.average_price || "0"),
      notional:
        Math.abs(parseFloat(data.size)) * parseFloat(data.average_price || "0"),
      leverage: 1, // No leverage on prediction markets
      upnl: parseFloat(data.unrealized_pnl || "0"),
      rpnl: parseFloat(data.realized_pnl || "0"),
      contracts: Math.abs(parseFloat(data.size)),
      liquidationPrice: 0, // Not applicable for prediction markets
    };

    if (existingPositionIndex >= 0) {
      this.parent.emitChanges([
        {
          type: "update",
          path: `private.${this.account.id}.positions.${existingPositionIndex}`,
          value: updatedPosition,
        },
      ]);
    } else {
      this.parent.emitChanges([
        {
          type: "update",
          path: `private.${this.account.id}.positions.${this.memory.positions.length}`,
          value: updatedPosition,
        },
      ]);
    }
  };

  placeOrders = ({
    orders,
    priority = false,
  }: {
    orders: PlaceOrderOpts[];
    priority?: boolean;
  }): Promise<string[]> => {
    const orderIds: string[] = [];

    return new Promise(async (resolve, reject) => {
      try {
        const batches = chunk(orders, PM_MAX_ORDERS_PER_BATCH);

        for (const batch of batches) {
          const batchPromises = batch.map((order) =>
            this.placeOrder(order, priority),
          );
          const batchOrderIds = await Promise.all(batchPromises);
          orderIds.push(...batchOrderIds.filter((id) => id !== null));
        }

        resolve(orderIds);
      } catch (error) {
        reject(error);
      }
    });
  };

  placeOrder = async (
    order: PlaceOrderOpts,
    priority = false,
  ): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        const requestId = genId();

        // Format the order for Polymarket
        const orderArgs = formatPMOrder({
          order,
          tickers: this.parent.memory.public.tickers,
          markets: this.parent.memory.public.markets,
        });

        // Create EIP712 order message
        const orderMessage = createEip712OrderMessage(
          orderArgs,
          this.account,
          this.orderNonce++,
        );

        // Sign the order
        const signature = await signEip712Order(
          orderMessage,
          this.account.apiSecret,
        );

        // Prepare order payload
        const orderPayload = {
          ...orderMessage,
          signature,
          requestId,
        };

        // Set up response handler
        this.pendingRequests.set(requestId, (response: any) => {
          if (response.data && response.data.success && response.data.orderId) {
            resolve(response.data.orderId);
          } else {
            reject(new Error(response.data?.error || "Order placement failed"));
          }
        });

        // Send order
        this.enqueueSend({
          payload: {
            type: "place_order",
            data: orderPayload,
          },
          priority,
        });
      } catch (error) {
        reject(error);
      }
    });
  };

  cancelOrders = ({
    orders,
    priority = false,
  }: {
    orders: Order[];
    priority?: boolean;
  }): Promise<string[]> => {
    const cancelledIds: string[] = [];

    return new Promise(async (resolve, reject) => {
      try {
        const batches = chunk(orders, PM_MAX_ORDERS_PER_BATCH);

        for (const batch of batches) {
          const batchPromises = batch.map((order) =>
            this.cancelOrder(order, priority),
          );
          const batchCancelledIds = await Promise.all(batchPromises);
          cancelledIds.push(...batchCancelledIds.filter((id) => id !== null));
        }

        resolve(cancelledIds);
      } catch (error) {
        reject(error);
      }
    });
  };

  cancelOrder = async (order: Order, priority = false): Promise<string> => {
    return new Promise((resolve, reject) => {
      const requestId = genId();

      this.pendingRequests.set(requestId, (response: any) => {
        if (response.data && response.data.success) {
          resolve(order.id.toString());
        } else {
          reject(
            new Error(response.data?.error || "Order cancellation failed"),
          );
        }
      });

      this.enqueueSend({
        payload: {
          type: "cancel_order",
          data: {
            order_id: order.id,
            requestId,
          },
        },
        priority,
      });
    });
  };

  updateOrders = (_args: {
    updates: UpdateOrderOpts[];
    priority?: boolean;
  }): Promise<void> => {
    // Polymarket doesn't support order updates directly
    // This would require canceling and replacing orders
    return Promise.reject(
      new Error("Order updates not supported on Polymarket"),
    );
  };

  onClose = () => {
    this.parent.error(
      `Polymarket Private WebSocket closed for account [${this.account.id}]`,
    );

    this.isAuthenticated = false;
    this.stopHeartbeat();
  };

  onError = (error: Event) => {
    this.parent.error(
      `Polymarket Private WebSocket error for account [${this.account.id}]: ${error}`,
    );
  };

  stopHeartbeat = () => {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  };

  enqueueSend = ({
    payload,
    consume = 1,
    priority = false,
  }: {
    payload: any;
    consume?: number;
    priority?: boolean;
  }) => {
    if (priority) {
      this.queue.unshift({ payload, consume, priority });
    } else {
      this.queue.push({ payload, consume, priority });
    }

    if (!this.isProcessing) {
      this.processQueue();
    }
  };

  processQueue = async () => {
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();

      if (item) {
        const { payload, consume } = item;

        this.send(payload);
        await sleep(this.queueInterval * consume);
      }
    }

    this.isProcessing = false;
  };

  send = (data: any) => {
    if (!this.isStopped && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  };

  stop = () => {
    this.isStopped = true;
    this.stopHeartbeat();

    // Clear pending requests
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  };
}
