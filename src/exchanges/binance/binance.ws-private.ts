import { binance } from "./binance.api";
import { BINANCE_ENDPOINTS } from "./binance.config";
import type { BinanceOrder, BinanceListenKey } from "./binance.types";
import { mapBinanceBalance, mapBinancePosition } from "./binance.utils";
import type { BinanceWorker } from "./binance.worker";

import { ReconnectingWebSocket } from "~/utils/reconnecting-websocket.utils";
import { tryParse } from "~/utils/try-parse.utils";
import type { Account } from "~/types/lib.types";

export class BinanceWsPrivate {
  parent: BinanceWorker;
  isStopped = false;
  isListening = false;

  ws: ReconnectingWebSocket | null = null;
  interval: NodeJS.Timeout | null = null;
  listenKeyInterval: NodeJS.Timeout | null = null;

  account: Account;
  listenKey: string | null = null;

  constructor({
    parent,
    account,
  }: {
    parent: BinanceWorker;
    account: Account;
  }) {
    this.parent = parent;
    this.account = account;
  }

  start = async () => {
    // Get listen key for authentication
    await this.getListenKey();
    this.startListenKeyPing();
    this.listenWebsocket();
  };

  startListening = () => {
    // We simply toggle handle message from websocket
    // because we don't want to handle messages before fetching initial data
    // but we still want to initiate the connection
    this.isListening = true;
  };

  getListenKey = async () => {
    try {
      const response = await binance<BinanceListenKey>({
        key: this.account.apiKey,
        secret: this.account.apiSecret,
        method: "POST",
        url: `${this.parent.config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.LISTEN_KEY}`,
      });

      this.listenKey = response.listenKey;
      this.parent.log(
        `Got Binance listen key for account [${this.account.id}]`,
      );
    } catch (error) {
      this.parent.error(`Failed to get Binance listen key: ${error}`);
    }
  };

  startListenKeyPing = () => {
    // Binance requires listen key to be refreshed every 30 minutes
    this.listenKeyInterval = setInterval(async () => {
      if (this.listenKey) {
        try {
          await binance({
            key: this.account.apiKey,
            secret: this.account.apiSecret,
            method: "POST",
            url: `${this.parent.config.PRIVATE_API_URL}${BINANCE_ENDPOINTS.PRIVATE.LISTEN_KEY}`,
            params: { listenKey: this.listenKey },
          });
        } catch (error) {
          this.parent.error(`Failed to ping Binance listen key: ${error}`);
          // Get new listen key if ping fails
          await this.getListenKey();
        }
      }
    }, 1800000); // 30 minutes
  };

  listenWebsocket = () => {
    if (!this.listenKey) return;

    const wsUrl = `${this.parent.config.WS_PRIVATE_URL}/${this.listenKey}`;
    this.ws = new ReconnectingWebSocket(wsUrl);
    this.ws.addEventListener("open", this.onOpen);
    this.ws.addEventListener("message", this.onMessage);
    this.ws.addEventListener("close", this.onClose);
  };

  onOpen = () => {
    this.parent.log(
      `Binance Private Websocket Opened for account [${this.account.id}]`,
    );
  };

  onMessage = (event: MessageEvent) => {
    // We don't want to handle messages before fetching initial data
    if (!this.isListening) return;

    const parsed = tryParse<{ e: string; [key: string]: any }>(event.data);
    if (!parsed) return;

    if (parsed.e === "ORDER_TRADE_UPDATE") {
      // Handle order updates
      this.onOrderUpdate(parsed);
      return;
    }

    if (parsed.e === "ACCOUNT_UPDATE") {
      // Handle account updates (balance, position changes)
      this.onAccountUpdate(parsed);
      return;
    }
  };

  onOrderUpdate = (data: any) => {
    // Convert Binance order update to BinanceOrder format
    const order = data.o;
    const binanceOrder: BinanceOrder = {
      orderId: order.i,
      symbol: order.s,
      status: order.X,
      clientOrderId: order.c,
      price: order.p,
      avgPrice: order.ap,
      origQty: order.q,
      executedQty: order.z,
      cumQty: order.z,
      cumQuote: order.Z,
      timeInForce: order.f,
      type: order.o,
      reduceOnly: order.R,
      closePosition: false,
      side: order.S,
      positionSide: order.ps,
      stopPrice: order.sp,
      workingType: order.wt,
      priceProtect: false,
      origType: order.ot,
      priceMatch: "NONE",
      selfTradePreventionMode: "NONE",
      goodTillDate: 0,
      time: order.T,
      updateTime: order.T,
    };

    this.parent.updateAccountOrders({
      accountId: this.account.id,
      binanceOrders: [binanceOrder],
    });
  };

  onAccountUpdate = (data: any) => {
    // Handle balance and position updates
    // data.a contains account update information
    if (data.a) {
      // Update balances if available
      if (data.a.B && Array.isArray(data.a.B)) {
        const balanceUpdates = data.a.B.filter(
          (b: any) => parseFloat(b.wb || "0") !== 0,
        );
        if (balanceUpdates.length > 0) {
          // Convert to BinanceBalance format
          const binanceBalances = balanceUpdates.map((b: any) => ({
            accountAlias: "",
            asset: b.a,
            balance: b.wb,
            crossWalletBalance: b.cw,
            crossUnPnl: "0",
            availableBalance: b.wb,
            maxWithdrawAmount: b.wb,
            marginAvailable: true,
            updateTime: Date.now(),
          }));

          // Update parent with new balance data
          this.parent.updateAccountBalance({
            accountId: this.account.id,
            balance: mapBinanceBalance(binanceBalances),
          });
        }
      }

      // Update positions if available
      if (data.a.P && Array.isArray(data.a.P)) {
        const positionUpdates = data.a.P.filter(
          (p: any) => parseFloat(p.pa || "0") !== 0,
        );
        if (positionUpdates.length > 0) {
          // Convert to BinancePosition format and then to internal Position format
          const positions = positionUpdates
            .map((p: any) => {
              const binancePosition = {
                symbol: p.s,
                positionAmt: p.pa,
                entryPrice: p.ep,
                breakEvenPrice: "0",
                markPrice: "0", // Will be updated from ticker
                unRealizedProfit: p.up,
                liquidationPrice: "0",
                leverage: "1",
                maxNotionalValue: "0",
                marginType: p.mt,
                isolatedMargin: p.iw,
                isAutoAddMargin: "false",
                positionSide: p.ps,
                notional: "0",
                isolatedWallet: p.iw,
                updateTime: Date.now(),
                bidNotional: "0",
                askNotional: "0",
              };

              return mapBinancePosition({
                position: binancePosition,
                accountId: this.account.id,
              });
            })
            .filter((p: any) => p !== null);

          if (positions.length > 0) {
            this.parent.updateAccountPositions({
              accountId: this.account.id,
              positions: positions.map((p: any) => {
                // Calculate notional using current ticker price
                const ticker = this.parent.memory.public.tickers[p.symbol];
                const notional = ticker
                  ? p.contracts * ticker.last
                  : p.notional;
                return { ...p, notional };
              }),
            });
          }
        }
      }
    }
  };

  onClose = () => {
    this.parent.log(`Binance Private Websocket Closed`);
  };

  stop = () => {
    this.isStopped = true;
    if (this.interval) clearInterval(this.interval);
    if (this.listenKeyInterval) clearInterval(this.listenKeyInterval);
    this.ws?.close();
  };

  send = (message: any) => {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  };

  addAccount = (account: Account) => {
    // Binance private websocket is account-specific
    // Each account needs its own connection with its own listen key
    this.account = account;
  };

  removeAccount = (_accountId: string) => {
    // Close the websocket when account is removed
    this.stop();
  };
}
