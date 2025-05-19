import { HL_ENDPOINTS } from "./hl.config";
import type { HLMetaAndAssetCtxs } from "./hl.types";

import { TICKER_REGEX } from "~/utils/regex.utils";
import {
  ExchangeName,
  type ExchangeConfig,
  type Market,
  type Ticker,
} from "~/types/lib.types";
import { request } from "~/utils/request.utils";

export const fetchHLMarketsAndTickers = async (config: ExchangeConfig) => {
  const [{ universe }, assets] = await request<HLMetaAndAssetCtxs>({
    url: `${config.PUBLIC_API_URL}${HL_ENDPOINTS.PUBLIC.INFO}`,
    method: "POST",
    body: {
      type: "metaAndAssetCtxs",
    },
  });

  const markets: Record<string, Market> = universe.reduce(
    (acc, market) => {
      const sizeDecimals = 10 / 10 ** (market.szDecimals + 1);
      const priceDecimals = 10 / 10 ** (6 - market.szDecimals + 1);

      acc[market.name] = {
        id: market.name,
        exchange: ExchangeName.HL,
        symbol: market.name,
        base: market.name,
        quote: "USDC",
        active: true,
        precision: {
          amount: sizeDecimals,
          price: priceDecimals,
        },
        limits: {
          amount: {
            min: sizeDecimals,
            max: Infinity,
            maxMarket: Infinity,
          },
          leverage: {
            min: 1,
            max: market.maxLeverage,
          },
        },
      };

      return acc;
    },
    {} as Record<string, Market>,
  );

  const tickers: Record<string, Ticker> = assets.reduce(
    (acc, t, idx) => {
      const last = t.midPx ? parseFloat(t.midPx) : 0;
      const prevDay = parseFloat(t.prevDayPx);
      const percentage = ((last - prevDay) / prevDay) * 100;
      const symbol = universe[idx].name;

      acc[symbol] = {
        id: symbol,
        exchange: ExchangeName.HL,
        symbol,
        cleanSymbol: symbol.replace(TICKER_REGEX, ""),
        bid: t.impactPxs ? parseFloat(t.impactPxs[0]) : 0,
        ask: t.impactPxs ? parseFloat(t.impactPxs[1]) : 0,
        last,
        mark: parseFloat(t.markPx),
        index: parseFloat(t.oraclePx),
        percentage,
        openInterest: parseFloat(t.openInterest),
        fundingRate: parseFloat(t.funding),
        volume: 0,
        quoteVolume: 0,
      };

      return acc;
    },
    {} as Record<string, Ticker>,
  );

  return {
    markets,
    tickers,
  };
};
