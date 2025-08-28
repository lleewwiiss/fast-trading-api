import { describe, test, expect } from "bun:test";

import { PM_CONFIG } from "./pm.config";
import {
  fetchPMMarkets,
  fetchPMTickers,
  fetchPMMarketById,
} from "./pm.resolver";

import type { ExchangeConfig, Market, Ticker } from "~/types/lib.types";

const config: ExchangeConfig = {
  PUBLIC_API_URL: PM_CONFIG.PUBLIC_API_URL,
  PRIVATE_API_URL: PM_CONFIG.PRIVATE_API_URL,
  WS_PUBLIC_URL: PM_CONFIG.WS_PUBLIC_URL,
  WS_PRIVATE_URL: PM_CONFIG.WS_PRIVATE_URL,
  WS_TRADE_URL: "",
  options: {
    corsProxy: {
      enabled: false,
      useLocalProxy: false,
    },
  },
};

describe("Polymarket real API integration", () => {
  test("loads consolidated markets with dual-leg metadata", async () => {
    const markets = await fetchPMMarkets(config);
    const symbols = Object.keys(markets);

    expect(symbols.length).toBeGreaterThan(0);

    const sampleSymbol = symbols[0];
    const market = markets[sampleSymbol] as Market & {
      metadata?: {
        outcomes?: { YES: string; NO: string };
        prices?: { YES: number; NO: number };
      };
    };

    // Unified symbol should not end with -YES or -NO
    expect(/-(YES|NO)$/i.test(sampleSymbol)).toBe(false);

    // Dual-leg mapping must exist
    expect(market?.metadata?.outcomes?.YES).toBeTruthy();
    expect(market?.metadata?.outcomes?.NO).toBeTruthy();
    expect(typeof market?.metadata?.prices?.YES).toBe("number");
    expect(typeof market?.metadata?.prices?.NO).toBe("number");
  }, 30000);

  test("tickers include polymarket dual-leg fields", async () => {
    const markets = await fetchPMMarkets(config);
    const tickers = (await fetchPMTickers(config, markets)) as Record<
      string,
      Ticker
    >;

    const withDual = Object.values(tickers).find((t) => Boolean(t.polymarket));
    expect(withDual).toBeTruthy();

    const pm = withDual!.polymarket!;
    expect(pm).toBeTruthy();
    // At least numbers present (may be 0 if API returns no liquidity)
    expect(typeof pm.bidYes).toBe("number");
    expect(typeof pm.bidNo).toBe("number");
  }, 30000);

  test("fetch by market id returns consolidated market and ticker", async () => {
    const markets = await fetchPMMarkets(config);
    const first = Object.values(markets)[0];
    expect(first).toBeTruthy();

    // market.id is the Gamma market id we stored
    const marketId = String(first.id);
    const { markets: oneMarket, tickers } = await fetchPMMarketById(
      config,
      marketId,
    );

    const symbol = Object.keys(oneMarket)[0];
    expect(symbol).toBeTruthy();
    expect(/-(YES|NO)$/i.test(symbol)).toBe(false);

    const market = oneMarket[symbol] as Market & {
      metadata?: { outcomes?: { YES: string; NO: string } };
    };
    expect(market?.metadata?.outcomes?.YES).toBeTruthy();
    expect(market?.metadata?.outcomes?.NO).toBeTruthy();

    const ticker = tickers[symbol] as Ticker;
    expect(ticker).toBeTruthy();
    expect(ticker.polymarket).toBeTruthy();
  }, 30000);
});
