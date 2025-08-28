import { describe, test, expect } from "bun:test";

import {
  mapPMMarket,
  mapPMTicker,
  mapPMOrder,
  formatPMOrder,
  validateTokenId,
  validatePrice,
  validateSize,
  createEip712OrderMessage,
} from "./pm.utils";

import { ExchangeName, OrderSide, OrderType } from "~/types/lib.types";

const mockPMMarket = {
  condition_id: "0x123456789abcdef",
  question: "Will Bitcoin reach $100k by end of 2024?",
  market_slug: "BTC100K",
  tokens: [
    {
      token_id: "123",
      outcome: "YES",
      price: "0.65",
      ticker: "BTC100K-YES",
    },
    {
      token_id: "124",
      outcome: "NO",
      price: "0.35",
      ticker: "BTC100K-NO",
    },
  ],
  end_date_iso: "2025-12-31T23:59:59Z",
  game_start_time: "2024-01-01T00:00:00Z",
  seconds_delay: 0,
  fpmm: "0xfpmm123",
  maker_base_fee: 0,
  taker_base_fee: 0,
  description: "Bitcoin price prediction market",
  category: "crypto",
  tags: ["bitcoin", "price", "2024"],
};

const mockPMTicker = {
  market: "BTC100K-YES",
  asset_id: "123",
  price: "0.65",
  best_bid: "0.64",
  best_ask: "0.66",
  volume_24h: "1000.00",
  price_change_24h: "0.05",
};

const mockPMOrder = {
  id: "order123",
  market: "BTC100K-YES",
  asset_id: "123",
  price: "0.65",
  size: "100",
  side: "BUY" as const,
  orderType: "GTC" as const,
  signature: "0xsignature",
  salt: "salt123",
  maker: "0xmaker",
  taker: "0xtaker",
  expiration: "1234567890",
  nonce: "1",
  tokenId: "123",
  makerAmount: "100",
  takerAmount: "65",
  feeRateBps: 0,
  signatureType: 0,
};

const mockAccount = {
  id: "test-account",
  exchange: ExchangeName.POLYMARKET,
  apiKey: "0x1234567890123456789012345678901234567890",
  apiSecret:
    "0x1234567890123456789012345678901234567890123456789012345678901234",
};

describe("Polymarket Utils", () => {
  describe("mapPMMarket", () => {
    test("should map PM market to unified format", () => {
      const markets = mapPMMarket(mockPMMarket);

      expect(markets["BTC100K"]).toBeDefined();

      const yesMarket = markets["BTC100K"];
      expect(yesMarket.id).toBe("BTC100K");
      expect(yesMarket.exchange).toBe(ExchangeName.POLYMARKET);
      expect(yesMarket.symbol).toBe("BTC100K");
      expect(yesMarket.base).toBe("BTC100K");
      expect(yesMarket.quote).toBe("USDC");
      expect(yesMarket.active).toBe(true);
      expect(yesMarket.precision.price).toBe(0.0001);
      expect(yesMarket.limits.leverage.max).toBe(1);
    });

    test("should handle expired markets", () => {
      const expiredMarket = {
        ...mockPMMarket,
        end_date_iso: "2020-01-01T00:00:00Z", // Past date
      };

      const markets = mapPMMarket(expiredMarket);
      expect(markets["BTC100K"].active).toBe(false);
    });
  });

  describe("mapPMTicker", () => {
    test("should map PM ticker to unified format", () => {
      const ticker = mapPMTicker(mockPMTicker, mockPMMarket.tokens[0]);

      expect(ticker.id).toBe("123");
      expect(ticker.exchange).toBe(ExchangeName.POLYMARKET);
      expect(ticker.symbol).toBe("BTC100K");
      expect(ticker.bid).toBe(0.64);
      expect(ticker.ask).toBe(0.66);
      expect(ticker.last).toBe(0.65);
      expect(ticker.volume).toBe(1000);
      expect(ticker.percentage).toBe(0.05);
    });

    test("should handle missing optional fields", () => {
      const incompleteTicker = {
        market: "BTC100K-YES",
        asset_id: "123",
        price: "0.65",
        best_bid: "",
        best_ask: "",
        volume_24h: "",
        price_change_24h: "",
      };

      const ticker = mapPMTicker(incompleteTicker, mockPMMarket.tokens[0]);
      expect(ticker.bid).toBe(0);
      expect(ticker.ask).toBe(0);
      expect(ticker.volume).toBe(0);
      expect(ticker.percentage).toBe(0);
    });
  });

  describe("mapPMOrder", () => {
    test("should map PM order to unified format", () => {
      const order = mapPMOrder({
        order: mockPMOrder,
        accountId: "test-account",
      });

      expect(order.id).toBe("order123");
      expect(order.exchange).toBe(ExchangeName.POLYMARKET);
      expect(order.accountId).toBe("test-account");
      expect(order.symbol).toBe("BTC100K-YES");
      expect(order.side).toBe(OrderSide.Buy);
      expect(order.price).toBe(0.65);
      expect(order.amount).toBe(100);
      expect(order.reduceOnly).toBe(false);
    });

    test("should map SELL orders correctly", () => {
      const sellOrder = { ...mockPMOrder, side: "SELL" as const };
      const order = mapPMOrder({
        order: sellOrder,
        accountId: "test-account",
      });

      expect(order.side).toBe(OrderSide.Sell);
    });
  });

  describe("formatPMOrder", () => {
    test("should format order for Polymarket API", () => {
      const markets = mapPMMarket(mockPMMarket);
      const tickers = {
        BTC100K: mapPMTicker(mockPMTicker, mockPMMarket.tokens[0]),
      };

      const orderOpt = {
        symbol: "BTC100K",
        type: OrderType.Limit,
        side: OrderSide.Buy,
        amount: 100,
        price: 0.65,
        reduceOnly: false,
        extra: { leg: "YES" as const },
      };

      const formatted = formatPMOrder({
        order: orderOpt,
        tickers,
        markets,
      });

      expect(formatted.tokenId).toBe("123");
      expect(formatted.price).toBe("0.65");
      expect(formatted.size).toBe("100");
      expect(formatted.side).toBe("BUY");
      expect(formatted.feeRateBps).toBe(0);
      expect(formatted.expiration).toBeGreaterThan(Date.now() / 1000);
    });

    test("should handle missing market", () => {
      const orderOpt = {
        symbol: "NONEXISTENT",
        type: OrderType.Limit,
        side: OrderSide.Buy,
        amount: 100,
        price: 0.65,
        reduceOnly: false,
      };

      expect(() => {
        formatPMOrder({
          order: orderOpt,
          tickers: {},
          markets: {},
        });
      }).toThrow("Market not found for symbol: NONEXISTENT");
    });
  });

  describe("createEip712OrderMessage", () => {
    test("should create proper EIP712 order message", () => {
      const orderArgs = {
        tokenId: "123",
        price: "0.65",
        size: "100",
        side: "BUY" as const,
        feeRateBps: 0,
        expiration: Math.floor(Date.now() / 1000) + 86400,
      };

      const orderMessage = createEip712OrderMessage(
        orderArgs,
        mockAccount,
        1,
        "salt123",
      );

      expect(orderMessage.salt).toBe("salt123");
      expect(orderMessage.maker).toBe(mockAccount.apiKey);
      expect(orderMessage.signer).toBe(mockAccount.apiKey);
      expect(orderMessage.tokenId).toBe("123");
      expect(orderMessage.makerAmount).toBe("100");
      expect(orderMessage.takerAmount).toBe("65"); // 0.65 * 100
      expect(orderMessage.nonce).toBe("1");
      expect(orderMessage.side).toBe(0); // BUY = 0
      expect(orderMessage.signatureType).toBe(0);
    });

    test("should handle SELL orders", () => {
      const orderArgs = {
        tokenId: "123",
        price: "0.35",
        size: "100",
        side: "SELL" as const,
        feeRateBps: 0,
        expiration: Math.floor(Date.now() / 1000) + 86400,
      };

      const orderMessage = createEip712OrderMessage(orderArgs, mockAccount, 1);

      expect(orderMessage.side).toBe(1); // SELL = 1
      expect(orderMessage.takerAmount).toBe("35"); // 0.35 * 100
    });
  });

  describe("Validation functions", () => {
    test("validateTokenId should validate token IDs", () => {
      expect(validateTokenId("123")).toBe(true);
      expect(validateTokenId("0")).toBe(true);
      expect(validateTokenId("")).toBe(false);
      expect(validateTokenId("abc")).toBe(false);
    });

    test("validatePrice should validate price range", () => {
      expect(validatePrice("0.0001")).toBe(true);
      expect(validatePrice("0.5")).toBe(true);
      expect(validatePrice("0.9999")).toBe(true);
      expect(validatePrice("0")).toBe(false);
      expect(validatePrice("1.0")).toBe(false);
      expect(validatePrice("1.5")).toBe(false);
      expect(validatePrice("-0.1")).toBe(false);
    });

    test("validateSize should validate minimum size", () => {
      expect(validateSize("0.0001")).toBe(true);
      expect(validateSize("1")).toBe(true);
      expect(validateSize("100")).toBe(true);
      expect(validateSize("0")).toBe(false);
      expect(validateSize("0.00001")).toBe(false);
    });
  });

  describe("Edge cases", () => {
    test("should handle price adjustment to tick size", () => {
      const markets = mapPMMarket(mockPMMarket);
      const tickers = {
        BTC100K: {
          ...mapPMTicker(mockPMTicker, mockPMMarket.tokens[0]),
          last: 0.123456,
        },
      };

      const orderOpt = {
        symbol: "BTC100K",
        type: OrderType.Market,
        side: OrderSide.Buy,
        amount: 100,
        reduceOnly: false,
        extra: { leg: "YES" as const },
      };

      const formatted = formatPMOrder({
        order: orderOpt,
        tickers,
        markets,
      });

      // Should be adjusted to tick size (0.0001)
      const price = parseFloat(formatted.price);
      expect(price).toBeLessThanOrEqual(0.9999);
      expect(price).toBeGreaterThanOrEqual(0.0001);
      expect((price * 10000) % 1).toBe(0); // Should be divisible by tick size
    });

    test("should enforce price bounds", () => {
      const markets = mapPMMarket(mockPMMarket);
      const tickers = {
        BTC100K: {
          ...mapPMTicker(mockPMTicker, mockPMMarket.tokens[0]),
          last: 1.5,
        },
      };

      const orderOpt = {
        symbol: "BTC100K",
        type: OrderType.Market,
        side: OrderSide.Buy,
        amount: 100,
        reduceOnly: false,
        extra: { leg: "YES" as const },
      };

      const formatted = formatPMOrder({
        order: orderOpt,
        tickers,
        markets,
      });

      const price = parseFloat(formatted.price);
      expect(price).toBeLessThanOrEqual(0.9999);
    });
  });
});
