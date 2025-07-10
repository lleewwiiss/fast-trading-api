import { INTERVAL } from "./binance.config";
import type { BinanceTicker, BinanceKline } from "./binance.types";
import { mapBinanceKline } from "./binance.utils";
import type { BinanceWorker } from "./binance.worker";

import { calcOrderBookTotal, sortOrderBook } from "~/utils/orderbook.utils";
import {
  ExchangeName,
  type Candle,
  type OrderBook,
  type Ticker,
  type Timeframe,
} from "~/types/lib.types";
import { ReconnectingWebSocket } from "~/utils/reconnecting-websocket.utils";
import { tryParse } from "~/utils/try-parse.utils";

export class BinanceWsPublic {
  parent: BinanceWorker;
  isStopped = false;

  ws: ReconnectingWebSocket | null = null;
  interval: NodeJS.Timeout | null = null;

  messageHandlers: Record<string, (event: MessageEvent) => void> = {};

  orderBookTopics = new Set<string>();
  orderBookTimeouts = new Map<string, NodeJS.Timeout>();

  ohlcvTopics = new Set<string>();
  ohlcvTimeouts = new Map<string, NodeJS.Timeout>();

  subscriptionId = 1;
  streams = new Set<string>();

  constructor({ parent }: { parent: BinanceWorker }) {
    this.parent = parent;
    this.messageHandlers.ticker = this.handleTicker;
    this.messageHandlers.orderbook = this.handleOrderBook;
    this.messageHandlers.kline = this.handleKline;
    this.listenWebsocket();
  }

  listenWebsocket = () => {
    this.ws = new ReconnectingWebSocket(this.parent.config.WS_PUBLIC_URL);
    this.ws.addEventListener("open", this.onOpen);
    this.ws.addEventListener("message", this.onMessage);
    this.ws.addEventListener("close", this.onClose);
  };

  onOpen = () => {
    this.parent.log(`Binance Public Websocket Opened`);

    // Subscribe to all market tickers
    const tickerStreams = Object.keys(this.parent.memory.public.markets).map(
      (symbol) => `${symbol.toLowerCase()}@ticker`,
    );
    this.subscribeToStreams(tickerStreams);

    // Re-subscribe to existing orderbook and kline streams
    if (this.orderBookTopics.size > 0) {
      this.subscribeToStreams(Array.from(this.orderBookTopics));
    }

    if (this.ohlcvTopics.size > 0) {
      this.subscribeToStreams(Array.from(this.ohlcvTopics));
    }
  };

  // Batch subscriptions to avoid overwhelming the WebSocket
  private subscriptionQueue: string[] = [];
  private subscriptionTimer: NodeJS.Timeout | null = null;

  subscribeToStreams = (streamNames: string[]) => {
    if (streamNames.length === 0) return;

    // Add to queue
    this.subscriptionQueue.push(...streamNames);

    // Clear existing timer
    if (this.subscriptionTimer) {
      clearTimeout(this.subscriptionTimer);
    }

    // Batch subscriptions with a small delay
    this.subscriptionTimer = setTimeout(() => {
      if (this.subscriptionQueue.length > 0) {
        // Remove duplicates
        const uniqueStreams = Array.from(new Set(this.subscriptionQueue));

        // Subscribe in chunks to avoid message size limits
        const chunkSize = 100;
        for (let i = 0; i < uniqueStreams.length; i += chunkSize) {
          const chunk = uniqueStreams.slice(i, i + chunkSize);

          const message = {
            method: "SUBSCRIBE",
            params: chunk,
            id: this.subscriptionId++,
          };

          this.send(message);
          chunk.forEach((stream) => this.streams.add(stream));
        }

        // Clear the queue
        this.subscriptionQueue = [];
      }
      this.subscriptionTimer = null;
    }, 50); // 50ms delay for batching
  };

  unsubscribeFromStreams = (streamNames: string[]) => {
    if (streamNames.length === 0) return;

    const message = {
      method: "UNSUBSCRIBE",
      params: streamNames,
      id: this.subscriptionId++,
    };

    this.send(message);
    streamNames.forEach((stream) => this.streams.delete(stream));
  };

  onMessage = (event: MessageEvent) => {
    for (const key in this.messageHandlers) {
      this.messageHandlers[key](event);
    }
  };

  handleTicker = (event: MessageEvent) => {
    if (event.data.includes('"e":"24hrTicker"')) {
      const json = tryParse<{ stream: string; data: BinanceTicker }>(
        event.data,
      );
      if (!json?.data) return;

      // For now, create a basic ticker from 24hr data only
      // TODO: Combine with book ticker and premium index data for complete ticker
      const ticker: Ticker = {
        id: json.data.symbol,
        exchange: ExchangeName.BINANCE,
        symbol: json.data.symbol,
        cleanSymbol: json.data.symbol.replace(/USDT$/, ""),
        bid: 0, // Not available in 24hr ticker, would need book ticker
        ask: 0, // Not available in 24hr ticker, would need book ticker
        last: parseFloat(json.data.lastPrice),
        mark: parseFloat(json.data.lastPrice),
        index: parseFloat(json.data.lastPrice),
        percentage: parseFloat(json.data.priceChangePercent),
        openInterest: 0, // Not available in 24hr ticker
        fundingRate: 0, // Not available in 24hr ticker
        volume: parseFloat(json.data.volume),
        quoteVolume: parseFloat(json.data.quoteVolume),
      };
      this.parent.updateTicker(ticker);
    }
  };

  handleOrderBook = (event: MessageEvent) => {
    if (event.data.includes('"e":"depthUpdate"')) {
      const json = tryParse<{ stream: string; data: any }>(event.data);
      if (!json?.data) return;

      const data = json.data;
      const symbol = data.s;
      const bids =
        data.b?.map(([price, qty]: [string, string]) => ({
          price: parseFloat(price),
          amount: parseFloat(qty),
        })) || [];
      const asks =
        data.a?.map(([price, qty]: [string, string]) => ({
          price: parseFloat(price),
          amount: parseFloat(qty),
        })) || [];

      const orderBook: OrderBook = {
        bids,
        asks,
      };

      sortOrderBook(orderBook);
      calcOrderBookTotal(orderBook);
      this.parent.emitOrderBook({ symbol, orderBook });
    }
  };

  handleKline = (event: MessageEvent) => {
    if (event.data.includes('"e":"kline"')) {
      const json = tryParse<{ stream: string; data: { k: BinanceKline } }>(
        event.data,
      );
      if (!json?.data?.k) return;

      const kline = json.data.k;
      const candle: Candle = mapBinanceKline(kline);
      this.parent.emitCandle(candle);
    }
  };

  onClose = () => {
    this.parent.log(`Binance Public Websocket Closed`);
  };

  stop = () => {
    this.isStopped = true;

    // Clear subscription timer
    if (this.subscriptionTimer) {
      clearTimeout(this.subscriptionTimer);
      this.subscriptionTimer = null;
    }

    // Clear all orderbook timeouts
    for (const timeout of this.orderBookTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.orderBookTimeouts.clear();

    // Clear all ohlcv timeouts
    for (const timeout of this.ohlcvTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.ohlcvTimeouts.clear();

    // Clear interval
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Close WebSocket
    this.ws?.close();
    this.ws = null;

    // Clear all data
    this.streams.clear();
    this.orderBookTopics.clear();
    this.ohlcvTopics.clear();
    this.subscriptionQueue = [];
  };

  send = (message: any) => {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  };

  listenOHLCV = (symbol: string, timeframe: Timeframe) => {
    const interval = INTERVAL[timeframe];
    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;

    this.ohlcvTopics.add(streamName);
    this.subscribeToStreams([streamName]);

    // Clear any existing timeout
    const timeoutKey = `${symbol}_${timeframe}`;
    if (this.ohlcvTimeouts.has(timeoutKey)) {
      clearTimeout(this.ohlcvTimeouts.get(timeoutKey));
    }

    // Set timeout to auto-unsubscribe after 5 minutes of inactivity
    const timeout = setTimeout(() => {
      this.unlistenOHLCV(symbol, timeframe);
    }, 300000);

    this.ohlcvTimeouts.set(timeoutKey, timeout);
  };

  unlistenOHLCV = (symbol: string, timeframe: Timeframe) => {
    const interval = INTERVAL[timeframe];
    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;

    this.ohlcvTopics.delete(streamName);
    this.unsubscribeFromStreams([streamName]);

    // Clear timeout
    const timeoutKey = `${symbol}_${timeframe}`;
    if (this.ohlcvTimeouts.has(timeoutKey)) {
      clearTimeout(this.ohlcvTimeouts.get(timeoutKey));
      this.ohlcvTimeouts.delete(timeoutKey);
    }
  };

  listenOrderBook = (symbol: string) => {
    const streamName = `${symbol.toLowerCase()}@depth`;

    this.orderBookTopics.add(streamName);
    this.subscribeToStreams([streamName]);

    // Clear any existing timeout
    if (this.orderBookTimeouts.has(symbol)) {
      clearTimeout(this.orderBookTimeouts.get(symbol));
    }

    // Set timeout to auto-unsubscribe after 5 minutes of inactivity
    const timeout = setTimeout(() => {
      this.unlistenOrderBook(symbol);
    }, 300000);

    this.orderBookTimeouts.set(symbol, timeout);
  };

  unlistenOrderBook = (symbol: string) => {
    const streamName = `${symbol.toLowerCase()}@depth`;

    this.orderBookTopics.delete(streamName);
    this.unsubscribeFromStreams([streamName]);

    // Clear timeout
    if (this.orderBookTimeouts.has(symbol)) {
      clearTimeout(this.orderBookTimeouts.get(symbol));
      this.orderBookTimeouts.delete(symbol);
    }
  };
}
