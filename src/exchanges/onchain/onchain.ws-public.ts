import type { OnchainWorker } from "./onchain.worker";

export class OnchainWsPublic {
  ws: WebSocket | null = null;
  parent: OnchainWorker;
  isConnected = false;
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;
  cleanupFunctions: (() => void)[] = [];
  subscribedTokens = new Set<string>();
  ohlcvSubscriptions: Record<string, () => void> = {};

  constructor({ parent }: { parent: OnchainWorker }) {
    this.parent = parent;
  }

  connect() {
    try {
      if (!this.parent.codexSdk) {
        this.parent.error(
          "No Codex SDK available for public WebSocket connection",
        );
        return;
      }

      this.parent.log("Connecting Codex public WebSocket subscriptions");

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.subscribeToStreams();
    } catch (error) {
      this.parent.error(`Error connecting to Codex public WebSocket: ${error}`);
      this.scheduleReconnect();
    }
  }

  private handlePriceUpdate(priceData: any) {
    if (!priceData) return;

    const tokenAddress = priceData.tokenAddress;
    const currentTicker = this.parent.memory.public.tickers[tokenAddress];

    if (!currentTicker) return;

    // Update ticker with new price data
    const updatedTicker = {
      ...currentTicker,
      last: parseFloat(priceData.priceUsd || "0"),
      mark: parseFloat(priceData.priceUsd || "0"),
      percentage: parseFloat(priceData.priceChange24h || "0"),
      volume: parseFloat(priceData.volume24h || "0"),
    };

    this.parent.emitChanges([
      {
        type: "update",
        path: `public.tickers.${tokenAddress}`,
        value: updatedTicker,
      },
    ]);

    this.parent.log(
      `Updated price for ${tokenAddress}: $${priceData.priceUsd}`,
    );
  }

  private handleBarsUpdate(barsData: any) {
    if (!barsData) return;

    // Convert to Candle format
    const candle = {
      symbol: barsData.tokenAddress,
      timeframe: barsData.interval || "1h",
      timestamp: Math.round(barsData.timestamp / 1000), // Convert to seconds
      open: parseFloat(barsData.open || "0"),
      high: parseFloat(barsData.high || "0"),
      low: parseFloat(barsData.low || "0"),
      close: parseFloat(barsData.close || "0"),
      volume: parseFloat(barsData.volume || "0"),
    };

    // Emit candle data (same as other exchanges)
    this.parent.emitCandle(candle);

    this.parent.log(`Updated bars for ${barsData.tokenAddress}`);
  }

  private subscribeToStreams() {
    if (!this.parent.codexSdk) return;

    // Subscribe to market data for tokens with balances
    const markets = this.parent.memory.public.markets;
    for (const symbol in markets) {
      this.subscribeToToken(symbol);
    }

    this.parent.log("Subscribed to Codex public WebSocket streams");
  }

  subscribeToToken(tokenAddress: string) {
    if (!this.parent.codexSdk || this.subscribedTokens.has(tokenAddress))
      return;

    // Subscribe to price/metadata updates
    const metadataCleanup = this.parent.codexSdk.subscribe(
      `subscription onPairMetadataUpdated($tokenAddress: String!) {
        onPairMetadataUpdated(tokenAddress: $tokenAddress) {
          tokenAddress
          priceUsd
          priceChange24h
          volume24h
          marketCap
          liquidity
          timestamp
        }
      }`,
      { tokenAddress },
      {
        next: (data: any) => {
          this.handlePriceUpdate(data.data?.onPairMetadataUpdated);
        },
        error: (error: any) => {
          const errorMsg =
            error instanceof Error
              ? error.message
              : typeof error === "object"
                ? JSON.stringify(error)
                : String(error);
          this.parent.error(
            `Price subscription error for ${tokenAddress}: ${errorMsg}`,
          );
        },
        complete: () => {
          // Subscription completed
        },
      },
    );

    // Subscribe to price bars/OHLCV updates
    const barsCleanup = this.parent.codexSdk.subscribe(
      `subscription onTokenBarsUpdated($tokenAddress: String!) {
        onTokenBarsUpdated(tokenAddress: $tokenAddress) {
          tokenAddress
          timestamp
          open
          high
          low
          close
          volume
          interval
        }
      }`,
      { tokenAddress },
      {
        next: (data: any) => {
          this.handleBarsUpdate(data.data?.onTokenBarsUpdated);
        },
        error: (error: any) => {
          const errorMsg =
            error instanceof Error
              ? error.message
              : typeof error === "object"
                ? JSON.stringify(error)
                : String(error);
          this.parent.error(
            `Bars subscription error for ${tokenAddress}: ${errorMsg}`,
          );
        },
        complete: () => {
          // Subscription completed
        },
      },
    );

    this.cleanupFunctions.push(metadataCleanup, barsCleanup);
    this.subscribedTokens.add(tokenAddress);

    this.parent.log(`Subscribed to price data for token: ${tokenAddress}`);
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.parent.error(
        "Max reconnection attempts reached for onchain public WebSocket",
      );
      return;
    }

    const delay = Math.pow(2, this.reconnectAttempts) * 1000;
    this.reconnectAttempts++;

    setTimeout(() => {
      this.parent.log(
        `Attempting to reconnect onchain public WebSocket (attempt ${this.reconnectAttempts})`,
      );
      this.connect();
    }, delay);
  }

  subscribe(channel: string, symbol?: string) {
    if (channel === "ticker" && symbol) {
      this.subscribeToToken(symbol);
    }
  }

  unsubscribe(channel: string, symbol?: string) {
    if (channel === "ticker" && symbol) {
      this.subscribedTokens.delete(symbol);
      this.parent.log(`Unsubscribed from ${symbol}`);
    }
  }

  listenOHLCV(opts: { symbol: string; timeframe: string }) {
    // Check if we already have a subscription for this symbol+timeframe
    const subscriptionKey = `${opts.symbol}_${opts.timeframe}`;

    if (this.ohlcvSubscriptions[subscriptionKey]) {
      this.parent.log(`Already listening to OHLCV for ${subscriptionKey}`);
      return;
    }

    if (!this.parent.codexSdk) {
      this.parent.error("No Codex SDK available for OHLCV streaming");
      return;
    }

    // Convert timeframe to Codex format
    const timeframeMap: Record<string, string> = {
      "1m": "1m",
      "5m": "5m",
      "15m": "15m",
      "30m": "30m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
      "1w": "1w",
    };

    const codexTimeframe = timeframeMap[opts.timeframe] || "1h";

    try {
      // Subscribe to real-time token bars updates using onTokenBarsUpdated
      // Store cleanup function
      this.ohlcvSubscriptions[subscriptionKey] = this.parent.codexSdk.subscribe(
        `subscription onTokenBarsUpdated($tokenAddress: String!, $timeframe: String!) {
          onTokenBarsUpdated(tokenAddress: $tokenAddress, timeframe: $timeframe) {
            timestamp
            open
            high
            low
            close
            volume
            tokenAddress
            timeframe
          }
        }`,
        {
          tokenAddress: opts.symbol,
          timeframe: codexTimeframe,
        },
        {
          next: (data: any) => {
            const bar = data.data?.onTokenBarsUpdated;
            if (bar && bar.timestamp) {
              // Emit candle data to parent thread
              this.parent.emitCandle({
                symbol: opts.symbol,
                timeframe: opts.timeframe as any,
                timestamp: bar.timestamp,
                open: parseFloat(bar.open || "0"),
                high: parseFloat(bar.high || "0"),
                low: parseFloat(bar.low || "0"),
                close: parseFloat(bar.close || "0"),
                volume: parseFloat(bar.volume || "0"),
              });
            }
          },
          error: (error: any) => {
            const errorMsg =
              error instanceof Error
                ? error.message
                : typeof error === "object"
                  ? JSON.stringify(error)
                  : String(error);
            this.parent.error(
              `Error in OHLCV subscription for ${subscriptionKey}: ${errorMsg}`,
            );
          },
          complete: () => {
            // Subscription completed
          },
        },
      );
      this.parent.log(`Started OHLCV streaming for ${subscriptionKey}`);
    } catch (error) {
      this.parent.error(
        `Error starting OHLCV subscription for ${subscriptionKey}: ${error}`,
      );
    }
  }

  unlistenOHLCV(opts: { symbol: string; timeframe: string }) {
    const subscriptionKey = `${opts.symbol}_${opts.timeframe}`;

    if (this.ohlcvSubscriptions[subscriptionKey]) {
      // Call cleanup function to unsubscribe
      this.ohlcvSubscriptions[subscriptionKey]();
      delete this.ohlcvSubscriptions[subscriptionKey];
      this.parent.log(`Stopped OHLCV streaming for ${subscriptionKey}`);
    } else {
      this.parent.log(
        `No active OHLCV subscription found for ${subscriptionKey}`,
      );
    }
  }

  disconnect() {
    // Clean up OHLCV subscriptions
    Object.keys(this.ohlcvSubscriptions).forEach((key) => {
      this.ohlcvSubscriptions[key]();
    });
    this.ohlcvSubscriptions = {};

    // Clean up Codex WebSocket subscriptions
    this.cleanupFunctions.forEach((cleanup) => cleanup());
    this.cleanupFunctions = [];
    this.subscribedTokens.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;

    this.parent.log("Disconnected Codex public WebSocket subscriptions");
  }
}
