import type {
  PMMarket,
  PMOrder,
  PMPosition,
  PMToken,
  PMTicker,
  PMOrderArgs,
  PMEip712OrderMessage,
  PML1AuthHeaders,
  PML2AuthHeaders,
} from "./pm.types";
import {
  PM_EIP712_DOMAIN,
  PM_OPERATOR_ADDRESS,
  PM_TICK_SIZE,
  PM_MIN_SIZE,
  PM_DEFAULT_EXPIRATION,
} from "./pm.config";

import { adjust } from "~/utils/safe-math.utils";
import {
  ExchangeName,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionSide,
  type Account,
  type Fill,
  type Market,
  type Order,
  type PlaceOrderOpts,
  type Ticker,
} from "~/types/lib.types";
import { genId } from "~/utils/gen-id.utils";

export const mapPMMarket = (market: PMMarket): Record<string, Market> => {
  const markets: Record<string, Market> = {};

  if (!market.tokens || !Array.isArray(market.tokens)) {
    // Skipping market without tokens (logged in worker)
    return markets;
  }

  market.tokens.forEach((token) => {
    markets[token.ticker] = {
      id: token.token_id,
      exchange: ExchangeName.POLYMARKET,
      symbol: token.ticker,
      base: token.outcome,
      quote: "USDC",
      active: new Date(market.end_date_iso) > new Date(),
      precision: {
        amount: PM_TICK_SIZE,
        price: PM_TICK_SIZE,
      },
      limits: {
        amount: {
          min: PM_MIN_SIZE,
          max: Infinity,
          maxMarket: Infinity,
        },
        leverage: {
          min: 1,
          max: 1, // No leverage on prediction markets
        },
      },
    };
  });

  return markets;
};

export const mapPMTicker = (ticker: PMTicker, market: PMToken): Ticker => {
  return {
    id: ticker.asset_id,
    exchange: ExchangeName.POLYMARKET,
    symbol: market.ticker,
    cleanSymbol: market.ticker,
    bid: parseFloat(ticker.best_bid || "0"),
    ask: parseFloat(ticker.best_ask || "0"),
    last: parseFloat(ticker.price),
    mark: parseFloat(ticker.price),
    index: parseFloat(ticker.price),
    percentage: parseFloat(ticker.price_change_24h || "0"),
    openInterest: 0,
    fundingRate: 0,
    volume: parseFloat(ticker.volume_24h || "0"),
    quoteVolume: parseFloat(ticker.volume_24h || "0"),
  };
};

export const mapPMOrder = ({
  order,
  accountId,
}: {
  order: PMOrder;
  accountId: string;
}): Order => {
  const amount = parseFloat(order.size);

  return {
    id: order.id,
    exchange: ExchangeName.POLYMARKET,
    accountId,
    status: OrderStatus.Open,
    symbol: order.market,
    type: OrderType.Limit,
    side: order.side === "BUY" ? OrderSide.Buy : OrderSide.Sell,
    price: parseFloat(order.price),
    amount,
    filled: 0,
    remaining: amount,
    reduceOnly: false,
    timestamp: Date.now(),
  };
};

export const mapPMPosition = ({
  position,
  accountId,
  symbol,
}: {
  position: PMPosition;
  accountId: string;
  symbol: string;
}) => {
  const size = parseFloat(position.size);

  return {
    accountId,
    exchange: ExchangeName.POLYMARKET,
    symbol,
    side: size > 0 ? PositionSide.Long : PositionSide.Short,
    entryPrice: parseFloat(position.average_price),
    notional: Math.abs(size) * parseFloat(position.average_price),
    leverage: 1,
    upnl: parseFloat(position.unrealized_pnl),
    rpnl: parseFloat(position.realized_pnl),
    contracts: Math.abs(size),
    liquidationPrice: 0,
  };
};

export const mapPMFill = (trade: any, symbol: string): Fill => {
  return {
    symbol,
    side: trade.side === "BUY" ? OrderSide.Buy : OrderSide.Sell,
    price: parseFloat(trade.price),
    amount: parseFloat(trade.size),
    timestamp: new Date(trade.timestamp).getTime(),
  };
};

export const formatPMOrderPrice = ({
  order,
  tickers,
}: {
  order: { symbol: string; side: OrderSide; price?: number };
  tickers: Record<string, Ticker>;
}) => {
  const ticker = tickers[order.symbol];
  const isBuy = order.side === OrderSide.Buy;

  let price = order.price;

  // If no price provided, use market price with slippage
  if (!price) {
    price = isBuy ? ticker.ask || ticker.last : ticker.bid || ticker.last;
  }

  // Adjust to tick size
  price = adjust(price, PM_TICK_SIZE);

  // Ensure price is within valid range (0.0001 to 0.9999)
  price = Math.max(0.0001, Math.min(0.9999, price));

  return price;
};

export const formatPMOrder = ({
  order,
  tickers,
  markets,
}: {
  order: PlaceOrderOpts;
  tickers: Record<string, Ticker>;
  markets: Record<string, Market>;
}): PMOrderArgs => {
  const market = markets[order.symbol];
  const price = formatPMOrderPrice({ order, tickers });
  const amount = adjust(order.amount, PM_TICK_SIZE);

  if (!market) {
    throw new Error(`Market not found for symbol: ${order.symbol}`);
  }

  return {
    tokenId: market.id.toString(),
    price: price.toString(),
    size: amount.toString(),
    side: order.side === OrderSide.Buy ? "BUY" : "SELL",
    feeRateBps: 0,
    expiration: Math.floor(Date.now() / 1000) + PM_DEFAULT_EXPIRATION,
  };
};

export const createEip712OrderMessage = (
  orderArgs: PMOrderArgs,
  account: Account,
  nonce: number,
  salt?: string,
): PMEip712OrderMessage => {
  return {
    salt: salt || genId(),
    maker: account.apiKey, // Wallet address
    signer: account.apiKey, // Same as maker for direct signing
    taker: PM_OPERATOR_ADDRESS,
    tokenId: orderArgs.tokenId,
    makerAmount: orderArgs.size,
    takerAmount: (
      parseFloat(orderArgs.price) * parseFloat(orderArgs.size)
    ).toString(),
    expiration:
      orderArgs.expiration ||
      Math.floor(Date.now() / 1000) + PM_DEFAULT_EXPIRATION,
    nonce: nonce.toString(),
    feeRateBps: orderArgs.feeRateBps || 0,
    side: orderArgs.side === "BUY" ? 0 : 1,
    signatureType: 0,
  };
};

export const signEip712Order = async (
  orderMessage: PMEip712OrderMessage,
  privateKey: string,
): Promise<string> => {
  // Using viem for EIP712 signing
  const { privateKeyToAccount } = await import("viem/accounts");

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const domain = PM_EIP712_DOMAIN;

  const types = {
    Order: [
      { name: "salt", type: "uint256" },
      { name: "maker", type: "address" },
      { name: "signer", type: "address" },
      { name: "taker", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "makerAmount", type: "uint256" },
      { name: "takerAmount", type: "uint256" },
      { name: "expiration", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "feeRateBps", type: "uint256" },
      { name: "side", type: "uint8" },
      { name: "signatureType", type: "uint8" },
    ],
  } as const;

  // Convert string fields to BigInt for EIP712 signing
  const bigIntMessage = {
    salt: BigInt(orderMessage.salt),
    maker: orderMessage.maker as `0x${string}`,
    signer: orderMessage.signer as `0x${string}`,
    taker: orderMessage.taker as `0x${string}`,
    tokenId: BigInt(orderMessage.tokenId),
    makerAmount: BigInt(orderMessage.makerAmount),
    takerAmount: BigInt(orderMessage.takerAmount),
    expiration: BigInt(orderMessage.expiration),
    nonce: BigInt(orderMessage.nonce),
    feeRateBps: BigInt(orderMessage.feeRateBps),
    side: orderMessage.side,
    signatureType: orderMessage.signatureType,
  };

  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: "Order",
    message: bigIntMessage,
  });

  return signature;
};

export const createL1AuthHeaders = async (
  account: Account,
  timestamp?: number,
  nonce: number = 0,
): Promise<PML1AuthHeaders> => {
  const ts = timestamp || Math.floor(Date.now() / 1000);

  // Create auth message for L1 signing
  const authMessage = {
    timestamp: ts,
    nonce,
  };

  const signature = await signEip712Auth(authMessage, account.apiSecret);

  return {
    POLY_ADDRESS: account.apiKey,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: ts.toString(),
    POLY_NONCE: nonce.toString(),
  };
};

export const signEip712Auth = async (
  message: { timestamp: number; nonce: number },
  privateKey: string,
): Promise<string> => {
  const { privateKeyToAccount } = await import("viem/accounts");

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const domain = PM_EIP712_DOMAIN;

  const types = {
    ClobAuth: [
      { name: "timestamp", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  } as const;

  // Convert to BigInt for EIP712 signing
  const bigIntMessage = {
    timestamp: BigInt(message.timestamp),
    nonce: BigInt(message.nonce),
  };

  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: "ClobAuth",
    message: bigIntMessage,
  });

  return signature;
};

export const createL2AuthHeaders = async (
  account: Account,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: string,
  timestamp?: number,
): Promise<PML2AuthHeaders> => {
  const ts = timestamp || Math.floor(Date.now() / 1000);

  // Create HMAC signature for L2 auth
  const message = ts + method.toUpperCase() + path + (body || "");

  // Note: This is a simplified implementation
  // In practice, you'd need proper HMAC-SHA256 signing with API secret
  const crypto = await import("crypto");
  const signature = crypto
    .createHmac("sha256", account.apiSecret)
    .update(message)
    .digest("hex");

  return {
    POLY_ADDRESS: account.apiKey,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: ts.toString(),
    POLY_NONCE: "0",
    POLY_API_KEY: account.apiKey, // This would be separate API key in practice
    POLY_PASSPHRASE: account.apiSecret, // This would be separate passphrase in practice
  };
};

export const validateTokenId = (tokenId: string): boolean => {
  return Boolean(tokenId && tokenId.length > 0 && !isNaN(parseInt(tokenId)));
};

export const validatePrice = (price: string): boolean => {
  const p = parseFloat(price);
  return p >= 0.0001 && p <= 0.9999;
};

export const validateSize = (sizeStr: string): boolean => {
  const size = parseFloat(sizeStr);
  return size >= PM_MIN_SIZE;
};
