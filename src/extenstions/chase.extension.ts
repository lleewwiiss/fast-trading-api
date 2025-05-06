import type { BaseWorker } from "~/exchanges/base.worker";
import {
  OrderSide,
  OrderTimeInForce,
  OrderType,
  type ChaseOpts,
  type ChaseState,
  type PlaceOrderOpts,
} from "~/types/lib.types";
import { adjust } from "~/utils/safe-math.utils";
import { genId } from "~/utils/gen-id.utils";
import { watchObjPath } from "~/utils";

class ChaseInstance {
  id: string;
  accountId: string;
  worker: BaseWorker;
  opts: ChaseOpts;

  orderIds: string[] = [];
  isPlacingOrder = false;
  isStopped = false;

  disposeWatchNotifications: () => void;
  disposeWatchTicker: () => void;

  get state() {
    const state = this.worker.memory.private[this.accountId].chases.find(
      (chase) => chase.id === this.id,
    );

    if (!state) {
      throw new Error(`Chase ${this.id} state not found`);
    }

    return state;
  }

  get ticker() {
    return this.worker.memory.public.tickers[this.opts.symbol];
  }

  get market() {
    return this.worker.memory.public.markets[this.opts.symbol];
  }

  get orderPrice() {
    const priceKey = this.opts.side === OrderSide.Buy ? "ask" : "bid";
    const price = this.ticker[priceKey];

    if (this.opts.stalk) {
      const delta = (this.opts.distance / 100) * price;
      return adjust(
        this.opts.side === OrderSide.Buy ? price - delta : price + delta,
        this.market.precision.price,
      );
    }

    const chasePrice = adjust(
      this.opts.side === OrderSide.Buy
        ? price - this.market.precision.price
        : price + this.market.precision.price,
      this.market.precision.price,
    );

    if (this.opts.infinite) {
      return chasePrice;
    }

    return Math.max(Math.min(chasePrice, this.opts.max), this.opts.min);
  }

  constructor({
    id,
    accountId,
    opts,
    worker,
  }: {
    id: string;
    accountId: string;
    opts: ChaseOpts;
    worker: BaseWorker;
  }) {
    this.id = id;
    this.accountId = accountId;
    this.worker = worker;
    this.opts = opts;

    this.setState({
      id: this.id,
      accountId: this.accountId,
      side: this.opts.side,
      symbol: this.opts.symbol,
      max: this.opts.max,
      min: this.opts.min,
      amount: this.opts.amount,
      stalk: this.opts.stalk,
      price: this.orderPrice,
    });

    // We watch notifications to stop the chase when we get a fill
    // or when the order is partially filled too
    const onNotificationsChange = () => {
      if (
        this.worker.memory.private[this.accountId].notifications.find(
          (n) =>
            n.type === "order_fill" &&
            n.accountId === this.accountId &&
            this.orderIds.includes(n.data.id),
        )
      ) {
        this.stop();
      }
    };

    this.disposeWatchNotifications = watchObjPath(
      this.worker.memory,
      `private.${this.accountId}.notifications`,
      onNotificationsChange,
    );

    // We watch the ticker changes to place the order
    // only if the order is not getting created already
    // and only if the price is different from the last order price
    const onTickerChange = () => {
      if (!this.isPlacingOrder && this.state.price !== this.orderPrice) {
        this.infinitePlaceOrder();
      }
    };

    this.disposeWatchTicker = watchObjPath(
      this.worker.memory,
      `public.tickers.${this.opts.symbol}`,
      onTickerChange,
    );
  }

  infinitePlaceOrder = async () => {
    this.isPlacingOrder = true;

    await this.cancelOrders();

    // we return early if the chase is stopped
    if (this.isStopped) return;

    const order: PlaceOrderOpts & { price: number } = {
      symbol: this.opts.symbol,
      side: this.opts.side,
      type: OrderType.Limit,
      price: this.orderPrice,
      amount: this.opts.amount,
      reduceOnly: this.opts.reduceOnly,
      timeInForce: OrderTimeInForce.PostOnly,
    };

    this.setState({ ...this.state, price: order.price });

    const orderIds = await this.worker.placeOrders({
      requestId: genId(),
      accountId: this.accountId,
      orders: [order],
      priority: true,
    });

    if (orderIds.length > 0) {
      this.orderIds = orderIds;
      this.isPlacingOrder = false;
    } else {
      await this.infinitePlaceOrder();
    }
  };

  cancelOrders = async () => {
    if (this.orderIds.length > 0) {
      await this.worker.cancelOrders({
        requestId: genId(),
        orderIds: this.orderIds,
        accountId: this.accountId,
        priority: true,
      });

      this.orderIds = [];
    }
  };

  stop = () => {
    this.isStopped = true;

    this.disposeWatchNotifications();
    this.disposeWatchTicker();

    this.isPlacingOrder = false;
    this.cancelOrders();

    const chaseIdx = this.worker.memory.private[
      this.accountId
    ].chases.findIndex((chase) => chase.id === this.id);

    if (chaseIdx !== -1) {
      this.worker.emitChanges([
        {
          type: "removeArrayElement",
          path: `private.${this.accountId}.chases` as const,
          index: chaseIdx,
        },
      ]);
    }
  };

  setState(state: ChaseState) {
    const idx = this.worker.memory.private[this.accountId].chases.findIndex(
      (chase) => chase.id === this.id,
    );

    const updateIdx =
      idx === -1
        ? this.worker.memory.private[this.accountId].chases.length
        : idx;

    this.worker.emitChanges([
      {
        type: "update",
        path: `private.${this.accountId}.chases.${updateIdx}` as const,
        value: state,
      },
    ]);
  }
}

export class ChaseExtension {
  worker: BaseWorker;
  instances: Map<string, ChaseInstance> = new Map();

  constructor({ worker }: { worker: BaseWorker }) {
    this.worker = worker;
  }

  start({ accountId, chase }: { accountId: string; chase: ChaseOpts }) {
    const id = genId();

    const instance = new ChaseInstance({
      id,
      accountId,
      opts: chase,
      worker: this.worker,
    });

    this.instances.set(id, instance);
  }

  stop({ chaseId }: { accountId: string; chaseId: string }) {
    this.instances.get(chaseId)?.stop();
    this.instances.delete(chaseId);
  }
}
