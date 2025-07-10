import type { OnchainWorker } from "./onchain.worker";

import {
  ExchangeName,
  OrderStatus,
  OrderType,
  OrderSide,
  type Order,
  type Account,
} from "~/types/lib.types";

export class OnchainWsPrivate {
  ws: WebSocket | null = null;
  parent: OnchainWorker;
  account: Account;
  isConnected = false;
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;
  cleanupFunctions: (() => void)[] = [];

  constructor({ parent, account }: { parent: OnchainWorker; account: any }) {
    this.parent = parent;
    this.account = account;
  }

  connect() {
    try {
      if (!this.parent.codexSdk) {
        this.parent.error("No Codex SDK available for WebSocket connection");
        return;
      }

      this.parent.log(
        `Connecting Codex WebSocket subscriptions for account ${this.account.id}`,
      );

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.subscribeToStreams();
    } catch (error) {
      this.parent.error(`Error connecting to Codex WebSocket: ${error}`);
      this.scheduleReconnect();
    }
  }

  private handleConfirmedEvent(events: any[]) {
    if (!events || !Array.isArray(events)) return;

    events.forEach((event) => {
      if (!event.transactionHash) return;

      this.parent.log(
        `Confirmed transaction for ${this.account.id}: ${event.transactionHash}`,
      );

      this.handleOrderStateTransition(event);
    });

    // Update positions (confirmed transactions change token balances)
    this.parent.loadAccountData(this.account.id);
  }

  private handleOrderStateTransition(event: any) {
    if (!this.parent.memory.private[this.account.id]) return;

    const currentOrders =
      this.parent.memory.private[this.account.id].orders || [];
    const orderIndex = currentOrders.findIndex(
      (o) => o.id === event.transactionHash,
    );

    if (orderIndex === -1) {
      // No matching pending order found
      return;
    }

    const order = currentOrders[orderIndex];

    // Extract fill information from the confirmed event
    const tokenAmount = parseFloat(event.data?.amountNonLiquidityToken || "0");
    const priceUsd = parseFloat(event.data?.priceUsd || "0");
    const pricePerToken =
      tokenAmount > 0 && priceUsd > 0 ? priceUsd / tokenAmount : order.price;

    // Create fill notification
    const currentNotifications =
      this.parent.memory.private[this.account.id].notifications || [];
    const fillNotification = {
      id: `fill_${event.transactionHash}`,
      accountId: this.account.id,
      type: "order_fill" as const,
      data: {
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        price:
          pricePerToken && pricePerToken > 0
            ? pricePerToken
            : ("MARKET" as const),
        amount: tokenAmount || order.amount,
      },
    };

    // Remove the order from orders array (it's now filled)
    const updatedOrders = currentOrders.filter(
      (_, index) => index !== orderIndex,
    );

    // Add fill notification
    const updatedNotifications = [...currentNotifications, fillNotification];

    this.parent.emitChanges([
      {
        type: "update",
        path: `private.${this.account.id}.orders`,
        value: updatedOrders,
      },
      {
        type: "update",
        path: `private.${this.account.id}.notifications.${updatedNotifications.length - 1}`,
        value: fillNotification,
      },
    ]);

    this.parent.log(
      `Order ${order.symbol} (${event.transactionHash.slice(-8)}) filled: ${tokenAmount} tokens at ${pricePerToken} USD/token`,
    );
  }

  private handleUnconfirmedEvent(events: any[]) {
    if (!events || !Array.isArray(events)) return;

    events.forEach((event) => {
      if (!event.transactionHash) return;

      this.parent.log(
        `Pending transaction for ${this.account.id}: ${event.transactionHash}`,
      );

      // Extract token information from the event data
      const tokenAmount = parseFloat(
        event.data?.amountNonLiquidityToken || "0",
      );
      const priceUsd = parseFloat(event.data?.priceUsd || "0");

      // Calculate price per token if we have both amount and USD value
      const pricePerToken =
        tokenAmount > 0 && priceUsd > 0 ? priceUsd / tokenAmount : 0;

      // Use a more descriptive symbol format
      const symbol = `PENDING_${event.transactionHash.slice(-8)}`;

      // Create pending "order" from unconfirmed transaction
      const pendingOrder: Order = {
        id: event.transactionHash,
        exchange: ExchangeName.ONCHAIN,
        accountId: this.account.id,
        symbol,
        side: event.eventType === "Buy" ? OrderSide.Buy : OrderSide.Sell,
        amount: tokenAmount,
        price: pricePerToken,
        filled: 0,
        remaining: tokenAmount,
        status: OrderStatus.Open,
        timestamp: event.timestamp || Date.now(),
        type: OrderType.Market,
        reduceOnly: false,
      };

      // Ensure the account memory structure exists
      if (!this.parent.memory.private[this.account.id]) {
        this.parent.log(
          `Initializing memory structure for account ${this.account.id}`,
        );
        return; // Skip this event, memory will be initialized by loadAccountData
      }

      const currentOrders =
        this.parent.memory.private[this.account.id].orders || [];

      // Check if this order already exists to avoid duplicates
      const existingOrder = currentOrders.find(
        (o) => o.id === event.transactionHash,
      );
      if (existingOrder) {
        this.parent.log(
          `Order ${event.transactionHash} already exists, skipping`,
        );
        return;
      }

      const newOrders = [...currentOrders, pendingOrder];

      this.parent.emitChanges([
        {
          type: "update",
          path: `private.${this.account.id}.orders`,
          value: newOrders,
        },
      ]);

      this.parent.log(
        `Added pending order ${symbol} for ${tokenAmount} tokens at ${pricePerToken} USD/token`,
      );
    });
  }

  private handleBalanceUpdate(balanceData: any) {
    if (!balanceData) return;

    this.parent.log(
      `Balance update for ${this.account.id}: ${balanceData.token?.symbol || balanceData.token?.address} - ${balanceData.balance} ($${balanceData.balanceUsd})`,
    );

    // Trigger a full account data reload to update positions and balances
    this.parent
      .loadAccountData(this.account.id)
      .catch((error) =>
        this.parent.error(
          `Failed to reload account data after balance update: ${error}`,
        ),
      );
  }

  private subscribeToStreams() {
    if (!this.parent.codexSdk) return;

    const account = this.account;
    const walletAddress = account.walletAddress;

    if (!walletAddress) {
      this.parent.error(`No wallet address found for account ${account.id}`);
      return;
    }

    // Subscribe to confirmed events (position updates)
    const confirmedCleanup = this.parent.codexSdk.subscribe(
      `subscription OnEventsCreatedByMaker {
          onEventsCreatedByMaker(input: {makerAddress: "${walletAddress}"}) {
            events {
              transactionHash
              maker
              eventType
              timestamp
              blockNumber
              networkId
              data {
                ... on SwapEventData {
                  priceUsd
                  amountNonLiquidityToken
                }
              }
            }
            makerAddress
          } 
        }`,
      { operationName: "OnEventsCreatedByMaker" },
      {
        next: (data: any) => {
          this.handleConfirmedEvent(data.data?.onEventsCreatedByMaker?.events);
        },
        error: (error: any) => {
          const errorMsg =
            error instanceof Error
              ? error.message
              : typeof error === "object"
                ? JSON.stringify(error)
                : String(error);
          this.parent.error(`Confirmed events subscription error: ${errorMsg}`);
        },
        complete: () => {
          // Subscription completed
        },
      },
    );
    this.cleanupFunctions.push(confirmedCleanup);

    // Subscribe to unconfirmed events (pending orders)
    const unconfirmedCleanup = this.parent.codexSdk.subscribe(
      `subscription OnUnconfirmedEventsCreatedByMaker {
          onUnconfirmedEventsCreatedByMaker(input: {makerAddress: "${walletAddress}"}) {
            events {
              transactionHash
              maker
              eventType
              timestamp
              networkId
              data {
                ... on SwapEventData {
                  priceUsd
                  amountNonLiquidityToken
                }
              }
            }
            makerAddress
          }
        }`,
      { operationName: "OnUnconfirmedEventsCreatedByMaker" },
      {
        next: (data: any) => {
          this.handleUnconfirmedEvent(
            data.data?.onUnconfirmedEventsCreatedByMaker?.events,
          );
        },
        error: (error: any) => {
          const errorMsg =
            error instanceof Error
              ? error.message
              : typeof error === "object"
                ? JSON.stringify(error)
                : String(error);
          this.parent.error(
            `Unconfirmed events subscription error: ${errorMsg}`,
          );
        },
        complete: () => {
          // Subscription completed
        },
      },
    );
    this.cleanupFunctions.push(unconfirmedCleanup);

    // Subscribe to real-time balance updates
    const balanceCleanup = this.parent.codexSdk.subscribe(
      `subscription OnBalanceUpdated {
          onBalanceUpdated(walletAddress: "${walletAddress}") {
            walletAddress
            balance
            balanceUsd
            token {
              address
              symbol
              name
              decimals
            }
            networkId
            network {
              id
              name
            }
          }
        }`,
      { operationName: "OnBalanceUpdated" },
      {
        next: (data: any) => {
          this.handleBalanceUpdate(data.data?.onBalanceUpdated);
        },
        error: (error: any) => {
          const errorMsg =
            error instanceof Error
              ? error.message
              : typeof error === "object"
                ? JSON.stringify(error)
                : String(error);
          this.parent.error(`Balance subscription error: ${errorMsg}`);
        },
        complete: () => {
          // Subscription completed
        },
      },
    );
    this.cleanupFunctions.push(balanceCleanup);

    this.parent.log(
      `Subscribed to Codex WebSocket streams for account ${account.id} (${walletAddress})`,
    );
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.parent.error(
        `Max reconnection attempts reached for onchain private WebSocket (${this.account.id})`,
      );
      return;
    }

    const delay = Math.pow(2, this.reconnectAttempts) * 1000;
    this.reconnectAttempts++;

    setTimeout(() => {
      this.parent.log(
        `Attempting to reconnect onchain private WebSocket for ${this.account.id} (attempt ${this.reconnectAttempts})`,
      );
      this.connect();
    }, delay);
  }

  subscribe(channel: string) {
    // Placeholder for subscription logic
    this.parent.log(`Subscribing to ${channel} for account ${this.account.id}`);
  }

  unsubscribe(channel: string) {
    // Placeholder for unsubscription logic
    this.parent.log(
      `Unsubscribing from ${channel} for account ${this.account.id}`,
    );
  }

  disconnect() {
    // Clean up Codex WebSocket subscriptions
    this.cleanupFunctions.forEach((cleanup) => cleanup());
    this.cleanupFunctions = [];

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;

    this.parent.log(
      `Disconnected Codex WebSocket subscriptions for account ${this.account.id}`,
    );
  }
}
