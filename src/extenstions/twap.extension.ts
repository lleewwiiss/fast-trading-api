import type { BaseWorker } from "~/exchanges/base.worker";
import {
  OrderSide,
  OrderType,
  PositionSide,
  TWAPStatus,
  type PlaceOrderOpts,
  type TWAPOpts,
  type TWAPState,
} from "~/types/lib.types";
import { genId } from "~/utils/gen-id.utils";
import { random } from "~/utils/random.utils";
import { adjust } from "~/utils/safe-math.utils";

class TWAPInstance {
  id: string;
  accountId: string;
  opts: TWAPOpts;
  worker: BaseWorker;

  timeoutId: NodeJS.Timeout | null = null;

  get state() {
    const state = this.worker.memory.private[this.accountId].twaps.find(
      (twap) => twap.id === this.id,
    );

    if (!state) {
      throw new Error(`TWAP ${this.id} state not found`);
    }

    return state;
  }

  get position() {
    const posSide =
      this.opts.side === OrderSide.Buy ? PositionSide.Long : PositionSide.Short;

    return this.worker.memory.private[this.accountId].positions.find(
      (p) => p.symbol === this.opts.symbol && p.side === posSide,
    );
  }

  get ticker() {
    return this.worker.memory.public.tickers[this.opts.symbol];
  }

  get market() {
    return this.worker.memory.public.markets[this.opts.symbol];
  }

  constructor({
    id,
    accountId,
    opts,
    worker,
  }: {
    id: string;
    accountId: string;
    opts: TWAPOpts;
    worker: BaseWorker;
  }) {
    this.id = id;
    this.accountId = accountId;
    this.opts = opts;
    this.worker = worker;

    const quotient = Math.floor(opts.lotsCount / 2);
    const remaining = opts.lotsCount % 2;

    const halfLots = Array(quotient).fill(opts.amount / opts.lotsCount);
    const lots = halfLots.flatMap((lot) => {
      const rand = random(0, opts.randomness);
      const diff = Math.abs(lot * rand);

      const lotA = lot + diff;
      const lotB = lot - diff;

      return [lotA, lotB];
    });

    if (remaining > 0) {
      lots.push(opts.amount / opts.lotsCount);
    }

    this.setState({
      id: this.id,
      accountId: this.accountId,
      symbol: opts.symbol,
      amount: opts.amount,
      amountExecuted: 0,
      lots: lots.map((lot) => adjust(lot, this.market.precision.amount)),
      side: opts.side,
      status: TWAPStatus.Running,
      lotsCount: opts.lotsCount,
      lotsExecuted: 0,
      nextOrderAt: Date.now(),
    });

    this.placeOrder();
  }

  placeOrder = () => {
    const orderFreq = this.opts.duration / this.opts.lotsCount;
    const rand = random(-this.opts.randomness, this.opts.randomness);
    const wait = orderFreq * 60 * 1000;
    const waitWithJitter = wait + wait * rand;
    const nextOrderAt = Date.now() + waitWithJitter;

    // pause TWAP if in profit when pauseInProfit is enabled
    if (!this.opts.reduceOnly && this.opts.pauseInProfit) {
      if (this.position && this.position?.upnl > 0) {
        this.setState({ ...this.state, nextOrderAt });
        this.timeoutId = setTimeout(() => this.placeOrder(), waitWithJitter);
        return;
      }
    }

    const lotSize = this.state.lots.shift();
    if (!lotSize) throw new Error(`TWAP should be over by now...`);

    const order: PlaceOrderOpts = {
      symbol: this.opts.symbol,
      side: this.opts.side,
      type: this.opts.limitOrders ? OrderType.Limit : OrderType.Market,
      price: this.opts.limitOrders ? this.ticker.last : undefined,
      amount: lotSize,
      reduceOnly: this.opts.reduceOnly,
    };

    this.worker.placeOrders({
      requestId: genId(),
      accountId: this.accountId,
      orders: [order],
    });

    this.setState({
      ...this.state,
      status: TWAPStatus.Running,
      amountExecuted: this.state.amountExecuted + lotSize,
      lotsExecuted: this.state.lotsExecuted + 1,
      nextOrderAt,
    });

    if (this.state.lots.length === 0) {
      this.stop();
    } else {
      this.timeoutId = setTimeout(() => this.placeOrder(), waitWithJitter);
    }
  };

  resume = () => {
    this.placeOrder();
  };

  pause = () => {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.setState({ ...this.state, status: TWAPStatus.Paused });
  };

  stop = () => {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const twapIdx = this.worker.memory.private[this.accountId].twaps.findIndex(
      (twap) => twap.id === this.id,
    );

    if (twapIdx !== -1) {
      this.worker.emitChanges([
        {
          type: "removeArrayElement",
          path: `private.${this.accountId}.twaps` as const,
          index: twapIdx,
        },
      ]);
    }
  };

  setState(state: TWAPState) {
    const idx = this.worker.memory.private[this.accountId].twaps.findIndex(
      (twap) => twap.id === this.id,
    );

    const updateIdx =
      idx === -1
        ? this.worker.memory.private[this.accountId].twaps.length
        : idx;

    this.worker.emitChanges([
      {
        type: "update",
        path: `private.${this.accountId}.twaps.${updateIdx}`,
        value: state,
      },
    ]);
  }
}

export class TWAPExtension {
  worker: BaseWorker;
  instances: Map<string, TWAPInstance> = new Map();

  constructor({ worker }: { worker: BaseWorker }) {
    this.worker = worker;
  }

  start({ accountId, twap }: { accountId: string; twap: TWAPOpts }) {
    const id = genId();

    const instance = new TWAPInstance({
      id,
      accountId,
      opts: twap,
      worker: this.worker,
    });

    this.instances.set(id, instance);
  }

  pause({ twapId }: { accountId: string; twapId: string }) {
    this.instances.get(twapId)?.pause();
  }

  resume({ twapId }: { accountId: string; twapId: string }) {
    this.instances.get(twapId)?.resume();
  }

  stop({ twapId }: { accountId: string; twapId: string }) {
    this.instances.get(twapId)?.stop();
    this.instances.delete(twapId);
  }
}
