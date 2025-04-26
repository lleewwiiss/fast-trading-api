import { bybitWebsocketAuth } from "./bybit.api";
import { BYBIT_API } from "./bybit.config";
import type {
  BybitBalance,
  BybitOrder,
  BybitWebsocketPosition,
} from "./bybit.types";
import { mapBybitBalance, mapBybitPosition } from "./bybit.utils";
import type { BybitWorker } from "./bybit.worker";

import { partition } from "~/utils/partition.utils";
import { PositionSide, type Account } from "~/types/lib.types";
import { ReconnectingWebSocket } from "~/lib/reconnecting-websocket.lib";

export class BybitWsPrivate {
  private parent: BybitWorker;
  private isStopped = false;

  private ws: ReconnectingWebSocket | null = null;
  private interval: NodeJS.Timeout | null = null;

  private account: Account;

  constructor({ parent, account }: { parent: BybitWorker; account: Account }) {
    this.parent = parent;
    this.account = account;

    this.listenWebsocket();
  }

  private listenWebsocket = () => {
    this.ws = new ReconnectingWebSocket(BYBIT_API.BASE_WS_PRIVATE_URL);
    this.ws.addEventListener("open", this.onOpen);
    this.ws.addEventListener("message", this.onMessage);
    this.ws.addEventListener("close", this.onClose);
  };

  private onOpen = async () => {
    this.parent.log(
      `Bybit Private Websocket Opened for account [${this.account.id}]`,
    );

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

      const [toRemove, toUpdate] = partition(
        data,
        (p) => p.side === "" || p.size === "0",
      );

      if (toRemove.length > 0) {
        this.parent.removeAccountPositions({
          accountId: this.account.id,
          positions: toRemove.flatMap((p) => {
            if (p.side === "") {
              return [
                { side: PositionSide.Long, symbol: p.symbol },
                { side: PositionSide.Short, symbol: p.symbol },
              ];
            }

            return [
              {
                side: p.side === "Buy" ? PositionSide.Long : PositionSide.Short,
                symbol: p.symbol,
              },
            ];
          }),
        });
      }

      if (toUpdate.length > 0) {
        this.parent.updateAccountPositions({
          accountId: this.account.id,
          positions: toUpdate.map((p) =>
            mapBybitPosition({ position: p, accountId: this.account.id }),
          ),
        });
      }
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

  private onClose = () => {
    this.parent.error(
      `Bybit Private Websocket Closed for account [${this.account.id}]`,
    );

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
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
