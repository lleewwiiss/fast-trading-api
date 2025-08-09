import type { PolymarketWorker } from "./pm.worker";
import type { PMWSMessage } from "./pm.types";
import { PM_HEARTBEAT_INTERVAL } from "./pm.config";

import type { Candle, OrderBook, Ticker, Timeframe } from "~/types/lib.types";
import { ReconnectingWebSocket } from "~/utils/reconnecting-websocket.utils";
import { calcOrderBookTotal, sortOrderBook } from "~/utils/orderbook.utils";
import { tryParse } from "~/utils/try-parse.utils";

export class PolymarketWsPublic {
  parent: PolymarketWorker;

  pingAt = 0;
  isStopped = false;

  ws: ReconnectingWebSocket | null = null;
  heartbeatTimeout: NodeJS.Timeout | null = null;

  messageHandlers: Record<string, (data: PMWSMessage) => void> = {};

  ohlcvTopics = new Set<string>();
  ohlcvTimeouts = new Map<string, NodeJS.Timeout>();

  orderBookTopics = new Set<string>();
  orderBookTimeouts = new Map<string, NodeJS.Timeout>();

  priceUpdateTopics = new Set<string>();

  subscribedAssets = new Set<string>();

  constructor({ parent }: { parent: PolymarketWorker }) {
    this.parent = parent;
    this.setupMessageHandlers();
    this.listenWebSocket();
  }

  setupMessageHandlers = () => {
    this.messageHandlers.price_change = this.handlePriceUpdate;
    this.messageHandlers.book_change = this.handleOrderBookUpdate;
    this.messageHandlers.trade = this.handleTradeUpdate;
  };

  listenWebSocket = () => {
    this.ws = new ReconnectingWebSocket(this.parent.config.WS_PUBLIC_URL);
    this.ws.addEventListener("open", this.onOpen);
    this.ws.addEventListener("message", this.onMessage);
    this.ws.addEventListener("close", this.onClose);
  };

  subscribeToMarketData = (assetIds: string[]) => {
    if (!assetIds.length) return;

    const message = {
      type: "MARKET",
      assets_ids: assetIds,
    };

    this.send(message);

    assetIds.forEach((assetId) => {
      this.subscribedAssets.add(assetId);
    });
  };

  unsubscribeFromMarketData = (assetIds: string[]) => {
    if (!assetIds.length) return;

    const message = {
      type: "UNSUBSCRIBE",
      assets_ids: assetIds,
    };

    this.send(message);

    assetIds.forEach((assetId) => {
      this.subscribedAssets.delete(assetId);
    });
  };

  listenOHLCV = ({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) => {
    const market = this.parent.memory.public.markets[symbol];
    if (!market) return;

    const assetId = market.id.toString();
    const ohlcvTopic = `ohlcv.${symbol}.${timeframe}`;

    if (this.ohlcvTopics.has(ohlcvTopic)) return;
    this.ohlcvTopics.add(ohlcvTopic);

    this.messageHandlers[ohlcvTopic] = (message: PMWSMessage) => {
      if (message.channel === "candle" && message.asset_id === assetId) {
        const data = message.data;

        const candle: Candle = {
          symbol,
          timeframe,
          timestamp: data.timestamp,
          open: parseFloat(data.open),
          high: parseFloat(data.high),
          low: parseFloat(data.low),
          close: parseFloat(data.close),
          volume: parseFloat(data.volume),
        };

        this.parent.emitCandle(candle);
      }
    };

    // Note: Polymarket doesn't have direct OHLCV subscription
    // This would typically be built from trade data or fetched periodically
  };

  unlistenOHLCV({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) {
    const ohlcvTopic = `ohlcv.${symbol}.${timeframe}`;
    const timeout = this.ohlcvTimeouts.get(ohlcvTopic);

    if (timeout) {
      clearTimeout(timeout);
      this.ohlcvTimeouts.delete(ohlcvTopic);
    }

    delete this.messageHandlers[ohlcvTopic];
    this.ohlcvTopics.delete(ohlcvTopic);
  }

  listenOrderBook(symbol: string) {
    const market = this.parent.memory.public.markets[symbol];
    if (!market) return;

    const assetId = market.id.toString();
    const orderBookTopic = `orderbook.${symbol}`;

    if (this.orderBookTopics.has(orderBookTopic)) return;
    this.orderBookTopics.add(orderBookTopic);

    this.messageHandlers[orderBookTopic] = (message: PMWSMessage) => {
      if (message.channel === "book_change" && message.asset_id === assetId) {
        this.handleOrderBookUpdate(message);
      }
    };

    // Subscribe to this asset's order book updates
    this.subscribeToMarketData([assetId]);
  }

  unlistenOrderBook(symbol: string) {
    const market = this.parent.memory.public.markets[symbol];
    if (!market) return;

    const assetId = market.id.toString();
    const orderBookTopic = `orderbook.${symbol}`;
    const timeout = this.orderBookTimeouts.get(orderBookTopic);

    if (timeout) {
      clearTimeout(timeout);
      this.orderBookTimeouts.delete(orderBookTopic);
    }

    delete this.messageHandlers[orderBookTopic];
    this.orderBookTopics.delete(orderBookTopic);

    // Unsubscribe from this asset
    this.unsubscribeFromMarketData([assetId]);
  }

  handlePriceUpdate = (message: PMWSMessage) => {
    if (message.channel !== "price_change") return;

    const assetId = message.asset_id;
    if (!assetId) return;

    // Find the symbol for this asset ID
    const symbol = this.findSymbolByAssetId(assetId);
    if (!symbol || !this.parent.memory.public.tickers[symbol]) return;

    const data = message.data;

    const updatedTicker: Partial<Ticker> & { symbol: string } = {
      symbol,
      last: parseFloat(data.price),
      bid: parseFloat(data.best_bid || data.price),
      ask: parseFloat(data.best_ask || data.price),
      volume: parseFloat(data.volume_24h || "0"),
      percentage: parseFloat(data.price_change_24h || "0"),
    };

    this.parent.updateTickerDelta(updatedTicker);
  };

  handleOrderBookUpdate = (message: PMWSMessage) => {
    if (message.channel !== "book_change") return;

    const assetId = message.asset_id;
    if (!assetId) return;

    const symbol = this.findSymbolByAssetId(assetId);
    if (!symbol) return;

    const data = message.data;
    const orderBook: OrderBook = {
      bids: [],
      asks: [],
    };

    // Process bids
    if (data.bids) {
      data.bids.forEach((bid: { price: string; size: string }) => {
        const price = parseFloat(bid.price);
        const amount = parseFloat(bid.size);
        if (amount > 0) {
          orderBook.bids.push({ price, amount, total: 0 });
        }
      });
    }

    // Process asks
    if (data.asks) {
      data.asks.forEach((ask: { price: string; size: string }) => {
        const price = parseFloat(ask.price);
        const amount = parseFloat(ask.size);
        if (amount > 0) {
          orderBook.asks.push({ price, amount, total: 0 });
        }
      });
    }

    sortOrderBook(orderBook);
    calcOrderBookTotal(orderBook);

    this.parent.emitOrderBook({ symbol, orderBook });
  };

  handleTradeUpdate = (message: PMWSMessage) => {
    if (message.channel !== "trade") return;

    const assetId = message.asset_id;
    if (!assetId) return;

    const symbol = this.findSymbolByAssetId(assetId);
    if (!symbol) return;

    const data = message.data;

    // Emit trade data for potential processing
    this.parent.log(`Trade update for ${symbol}: ${data.price} x ${data.size}`);
  };

  findSymbolByAssetId = (assetId: string): string | undefined => {
    for (const [symbol, market] of Object.entries(
      this.parent.memory.public.markets,
    )) {
      if (market.id.toString() === assetId) {
        return symbol;
      }
    }
    return undefined;
  };

  onOpen = () => {
    this.parent.log(`Polymarket Public WebSocket opened`);
    this.startHeartbeat();

    // Subscribe to all tracked assets
    const assetIds = Object.values(this.parent.memory.public.markets).map(
      (market) => market.id.toString(),
    );

    if (assetIds.length > 0) {
      this.subscribeToMarketData(assetIds);
    }
  };

  startHeartbeat = () => {
    this.heartbeatTimeout = setTimeout(() => {
      this.ping();
      this.startHeartbeat();
    }, PM_HEARTBEAT_INTERVAL);
  };

  ping = () => {
    this.pingAt = performance.now();
    this.send({ type: "ping" });
  };

  onMessage = (event: MessageEvent) => {
    const message = tryParse<PMWSMessage>(event.data);
    if (!message) return;

    // Handle pong response
    if (message.channel === "pong") {
      const latency = (performance.now() - this.pingAt) / 2;
      this.parent.emitChanges([
        { type: "update", path: "public.latency", value: latency },
      ]);
      return;
    }

    // Process message through handlers
    for (const key in this.messageHandlers) {
      this.messageHandlers[key](message);
    }
  };

  onClose = () => {
    this.parent.error(`Polymarket Public WebSocket closed`);
    this.stopHeartbeat();
  };

  onError = (error: Event) => {
    this.parent.error(`Polymarket Public WebSocket error: ${error}`);
  };

  stopHeartbeat = () => {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  };

  send = (data: any) => {
    if (!this.isStopped && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  };

  stop = () => {
    this.isStopped = true;
    this.stopHeartbeat();

    // Clear all timeouts
    this.ohlcvTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.ohlcvTimeouts.clear();

    this.orderBookTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.orderBookTimeouts.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  };
}
