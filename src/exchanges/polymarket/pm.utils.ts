import type {
  PMEip712OrderMessage,
  PML1AuthHeaders,
  PML2AuthHeaders,
  PMMarket,
  PMOrder,
  PMOrderArgs,
  PMPosition,
  PMTicker,
  PMToken,
} from "./pm.types";
import {
  PM_DEFAULT_EXPIRATION,
  PM_EIP712_DOMAIN,
  PM_MIN_SIZE,
  PM_OPERATOR_ADDRESS,
  PM_TICK_SIZE,
} from "./pm.config";

import { adjust } from "~/utils/safe-math.utils";
import {
  type Account,
  ExchangeName,
  type Fill,
  type Market,
  type Order,
  OrderSide,
  OrderStatus,
  OrderType,
  type PlaceOrderOpts,
  PositionSide,
  type Ticker,
} from "~/types/lib.types";
import { genId } from "~/utils/gen-id.utils";
import { request } from "~/utils/request.utils";

export const mapPMMarket = (market: PMMarket): Record<string, Market> => {
  const markets: Record<string, Market> = {};

  if (!market.tokens || market.tokens.length < 2) return markets;

  const baseSymbol =
    (market as any).market_slug ||
    market.question?.substring(0, 30).replace(/[^a-zA-Z0-9]/g, "-") ||
    "MARKET";
  const symbol = baseSymbol.toUpperCase().replace(/--+/g, "-");

  const yesToken = market.tokens.find((t) => /yes/i.test(t.outcome));
  const noToken = market.tokens.find((t) => /no/i.test(t.outcome));
  if (!yesToken || !noToken) return markets;

  markets[symbol] = {
    id: (market as any).id || symbol,
    exchange: ExchangeName.POLYMARKET,
    symbol,
    base: symbol,
    quote: "USDC",
    active: new Date(market.end_date_iso) > new Date(),
    precision: { amount: PM_TICK_SIZE, price: PM_TICK_SIZE },
    limits: {
      amount: { min: PM_MIN_SIZE, max: Infinity, maxMarket: Infinity },
      leverage: { min: 1, max: 1 },
    },
  } as Market & {
    metadata?: {
      question: string;
      endDate: string;
      outcomes: { YES: string; NO: string };
    };
  };

  (markets[symbol] as any).metadata = {
    question: market.question,
    endDate: market.end_date_iso,
    outcomes: { YES: yesToken.token_id, NO: noToken.token_id },
  };

  return markets;
};

export const mapPMTicker = (ticker: PMTicker, market: PMToken): Ticker => {
  const base = (market.ticker || "").replace(/-YES|-NO/i, "");
  const cleaned = base || market.ticker;
  const last = parseFloat(ticker.price);
  return {
    id: ticker.asset_id,
    exchange: ExchangeName.POLYMARKET,
    symbol: cleaned,
    cleanSymbol: cleaned,
    bid: parseFloat(ticker.best_bid || "0"),
    ask: parseFloat(ticker.best_ask || "0"),
    last,
    mark: last,
    index: last,
    percentage: parseFloat(ticker.price_change_24h || "0"),
    openInterest: 0,
    fundingRate: 0,
    volume: parseFloat(ticker.volume_24h || "0"),
    quoteVolume: parseFloat(ticker.volume_24h || "0"),
    polymarket: /YES$/i.test(market.outcome)
      ? {
          bidYes: parseFloat(ticker.best_bid || "0"),
          askYes: parseFloat(ticker.best_ask || "0"),
          lastYes: last,
          markYes: last,
          indexYes: last,
          volumeYes: parseFloat(ticker.volume_24h || "0"),
          bidNo: 0,
          askNo: 0,
          lastNo: 0,
          markNo: 0,
          indexNo: 0,
          volumeNo: 0,
        }
      : {
          bidYes: 0,
          askYes: 0,
          lastYes: 0,
          markYes: 0,
          indexYes: 0,
          volumeYes: 0,
          bidNo: parseFloat(ticker.best_bid || "0"),
          askNo: parseFloat(ticker.best_ask || "0"),
          lastNo: last,
          markNo: last,
          indexNo: last,
          volumeNo: parseFloat(ticker.volume_24h || "0"),
        },
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
  const market = markets[order.symbol] as Market & {
    metadata?: { outcomes?: { YES: string; NO: string } };
  };
  const price = formatPMOrderPrice({ order, tickers });
  const amount = adjust(order.amount, PM_TICK_SIZE);

  if (!market || !(market as any).metadata?.outcomes) {
    throw new Error(`Market not found for symbol: ${order.symbol}`);
  }
  const leg = order.extra?.leg;
  if (leg !== "YES" && leg !== "NO") {
    throw new Error("Polymarket order requires extra.leg of 'YES' or 'NO'");
  }
  const tokenId = (
    (market as any).metadata.outcomes as { YES: string; NO: string }
  )[leg];

  return {
    tokenId: tokenId.toString(),
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

  return await account.signTypedData({
    domain,
    types,
    primaryType: "Order",
    message: bigIntMessage,
  });
};

export const createL1AuthHeaders = async (
  account: Account,
  timestamp?: number,
  nonce?: number,
): Promise<PML1AuthHeaders> => {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  // Use timestamp as nonce if not provided (common practice for Polymarket CLOB)
  const authNonce = nonce !== undefined ? nonce : ts;

  // Derive the actual address from the private key
  const { privateKeyToAccount } = await import("viem/accounts");
  const signingAccount = privateKeyToAccount(
    account.apiSecret as `0x${string}`,
  );
  const actualAddress = signingAccount.address;

  // Create EIP712 signature using exact same logic as official client
  const signature = await buildClobEip712Signature(
    signingAccount,
    137,
    ts,
    authNonce,
  );

  return {
    POLY_ADDRESS: actualAddress,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: ts.toString(),
    POLY_NONCE: authNonce.toString(),
  };
};

/**
 * Builds the canonical Polymarket CLOB EIP712 signature exactly like official client
 * This matches the implementation in @polymarket/clob-client/src/signing/eip712.ts
 */
export const buildClobEip712Signature = async (
  signer: any, // viem account
  chainId: number = 137, // Polygon
  timestamp: number,
  nonce: number = 0,
): Promise<string> => {
  const address = signer.address;
  const ts = timestamp.toString();

  const domain = {
    name: "ClobAuthDomain",
    version: "1",
    chainId,
  };

  const types = {
    ClobAuth: [
      { name: "address", type: "address" },
      { name: "timestamp", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "message", type: "string" },
    ],
  } as const;

  const value = {
    address: address as `0x${string}`,
    timestamp: ts,
    nonce: BigInt(nonce),
    message: "This message attests that I control the given wallet",
  };

  return await signer.signTypedData({
    domain,
    types,
    primaryType: "ClobAuth",
    message: value,
  });
};

export const signEip712Auth = async (
  message: { timestamp: number; nonce: number; address: string },
  privateKey: string,
): Promise<string> => {
  const { privateKeyToAccount } = await import("viem/accounts");

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const domain = PM_EIP712_DOMAIN;

  const types = {
    ClobAuth: [
      { name: "address", type: "address" },
      { name: "timestamp", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "message", type: "string" },
    ],
  } as const;

  // Convert to correct format for EIP712 signing
  const bigIntMessage = {
    address: message.address as `0x${string}`,
    timestamp: message.timestamp.toString(), // Keep as string for EIP712
    nonce: BigInt(message.nonce),
    message: "This message attests that I control the given wallet",
  };

  return await account.signTypedData({
    domain,
    types,
    primaryType: "ClobAuth",
    message: bigIntMessage,
  });
};

export const createL2AuthHeaders = async (
  account: Account,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: string,
  timestamp?: number,
  clobCredentials?: { apiKey: string; secret: string; passphrase: string },
): Promise<PML2AuthHeaders> => {
  if (!clobCredentials) {
    throw new Error("CLOB credentials required for L2 authentication");
  }

  const ts = timestamp || Math.floor(Date.now() / 1000);

  // Create HMAC signature for L2 auth exactly like Polymarket's official client
  let message = ts + method.toUpperCase() + path;
  if (body !== undefined) {
    message += body;
  }

  const crypto = await import("crypto");

  // IMPORTANT: The secret is base64 encoded and needs to be decoded first
  const base64Secret = Buffer.from(clobCredentials.secret, "base64");

  // Create HMAC with decoded secret and get base64 signature
  const signature = crypto
    .createHmac("sha256", base64Secret)
    .update(message)
    .digest("base64")
    // Make URL-safe base64: replace '+' with '-' and '/' with '_'
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return {
    POLY_ADDRESS: account.walletAddress || account.apiKey, // Use wallet address
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: ts.toString(),
    POLY_API_KEY: clobCredentials.apiKey, // Use CLOB API key
    POLY_PASSPHRASE: clobCredentials.passphrase, // Use CLOB passphrase
    // Note: No POLY_NONCE for L2 headers (only for L1)
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

/**
 * Creates CLOB API credentials (key, secret, passphrase) from wallet credentials
 * Uses L1 authentication to generate L2 API credentials via /auth/api-key endpoint
 */
/**
 * Creates or derives CLOB API credentials using the same flow as official client
 * Tries createApiKey first, falls back to deriveApiKey if creation fails
 */
export const createOrDeriveApiKey = async (
  account: Account,
  config: any,
): Promise<{ apiKey: string; secret: string; passphrase: string } | null> => {
  try {
    // Try to create a new API key first
    const created = await createApiKey(account, config);
    if (created && created.apiKey && created.apiKey !== "undefined") {
      return created;
    }
  } catch {
    // Creation failed, try derive
  }

  try {
    // Fall back to deriving existing key
    const derived = await deriveApiKey(account, config);
    if (derived && derived.apiKey && derived.apiKey !== "undefined") {
      return derived;
    }
  } catch {
    // Derive also failed
  }

  return null;
};

export const createApiKey = async (
  account: Account,
  config: any,
  nonce: number = 0,
): Promise<{ apiKey: string; secret: string; passphrase: string } | null> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = await createL1AuthHeaders(account, timestamp, nonce);
  const authUrl = `${config.PRIVATE_API_URL}/auth/api-key`;

  const requestConfig = {
    url: authUrl,
    method: "POST" as const,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  };

  const response = await request<{
    apiKey: string;
    secret: string;
    passphrase: string;
  }>(requestConfig);

  return {
    apiKey: response.apiKey,
    secret: response.secret,
    passphrase: response.passphrase,
  };
};

export const deriveApiKey = async (
  account: Account,
  config: any,
  nonce: number = 0,
): Promise<{ apiKey: string; secret: string; passphrase: string } | null> => {
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = await createL1AuthHeaders(account, timestamp, nonce);

  const { request } = await import("~/utils/request.utils");
  // CORS proxy not needed - Polymarket CLOB API supports CORS

  const deriveUrl = `${config.PRIVATE_API_URL}/auth/derive-api-key`;
  const response = await request<{
    apiKey: string;
    secret: string;
    passphrase: string;
  }>({
    url: deriveUrl,
    method: "GET", // Derive API key uses GET, not POST
    headers,
  });

  return {
    apiKey: response.apiKey,
    secret: response.secret,
    passphrase: response.passphrase,
  };
};

// Legacy function - keep for backward compatibility but use createOrDeriveApiKey instead
export const createClobApiCredentials = async (
  account: Account,
  config: any,
): Promise<{ apiKey: string; secret: string; passphrase: string } | null> => {
  return await createOrDeriveApiKey(account, config);
};
