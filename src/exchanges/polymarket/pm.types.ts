export interface PMMarket {
  condition_id: string;
  question: string;
  tokens: PMToken[];
  end_date_iso: string;
  game_start_time: string;
  seconds_delay: number;
  fpmm: string;
  maker_base_fee: number;
  taker_base_fee: number;
  description: string;
  category: string;
  tags: string[];
}

export interface PMGammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  endDate: string;
  liquidity: string;
  startDate: string;
  outcomes: string;
  outcomePrices: string;
  volume: string;
  active: boolean;
  closed: boolean;
  enableOrderBook: boolean;
  clobTokenIds: string;
  acceptingOrders: boolean;
  volume24hr: number;
  volumeIwk: number;
  volumeImo: number;
  volumeIyr: number;
  liquidityClob: number;
  volumeClob: number;
  spread: number;
}

export interface PMGammaEvent {
  id: string;
  ticker: string;
  slug: string;
  title: string;
  description: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  liquidity: number;
  volume: number;
  openInterest: number;
  volume24hr: number;
  volumeIwk: number;
  volumeImo: number;
  volumeIyr: number;
  enableOrderBook: boolean;
  liquidityClob: number;
  markets: PMGammaMarket[];
}

export interface PMGammaEventsResponse {
  data: PMGammaEvent[];
  next_cursor?: string;
  count?: number;
}

export interface PMToken {
  token_id: string;
  outcome: string;
  price: string;
  ticker: string;
}

export interface PMOrder {
  id: string;
  market: string;
  asset_id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  orderType: "GTC" | "FOK" | "GTD" | "FAK";
  signature: string;
  salt: string;
  maker: string;
  taker: string;
  expiration: string;
  nonce: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  feeRateBps: number;
  signatureType: number;
}

export interface PMPosition {
  asset_id: string;
  size: string;
  average_price: string;
  unrealized_pnl: string;
  realized_pnl: string;
}

export interface PMOrderArgs {
  tokenId: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  feeRateBps?: number;
  nonce?: string;
  expiration?: number;
}

export interface PMApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PMTicker {
  market: string;
  asset_id: string;
  price: string;
  best_bid: string;
  best_ask: string;
  volume_24h: string;
  price_change_24h: string;
}

export interface PMOrderBook {
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

export interface PMUserBalance {
  asset_id: string;
  balance: string;
}

export interface PMUserOrderHistory {
  id: string;
  asset_id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  status: "CANCELED" | "FILLED" | "OPEN";
  created_at: string;
  filled_at?: string;
}

export interface PMTradeEvent {
  id: string;
  asset_id: string;
  price: string;
  size: string;
  side: "BUY" | "SELL";
  timestamp: string;
  taker_order_id: string;
  maker_order_id: string;
}

export interface PMCandle {
  t: number; // timestamp
  o: string; // open
  h: string; // high
  l: string; // low
  c: string; // close
  v: string; // volume
}

export interface PMPriceHistory {
  t: number; // UTC timestamp
  p: number; // Price
}

export interface PMPriceHistoryResponse {
  history: PMPriceHistory[];
}

export interface PMWSMessage {
  channel: string;
  market?: string;
  asset_id?: string;
  data: any;
}

export interface PMEip712Domain {
  name: string;
  version: string;
  chainId: number;
}

export interface PMEip712OrderMessage {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: number;
  nonce: string;
  feeRateBps: number;
  side: number;
  signatureType: number;
}

export interface PML1AuthHeaders {
  POLY_ADDRESS: string;
  POLY_SIGNATURE: string;
  POLY_TIMESTAMP: string;
  POLY_NONCE: string;
  [key: string]: string;
}

export interface PML2AuthHeaders {
  POLY_ADDRESS: string;
  POLY_SIGNATURE: string;
  POLY_TIMESTAMP: string;
  POLY_API_KEY: string;
  POLY_PASSPHRASE: string;
  [key: string]: string;
}

export interface PMWSSubscription {
  auth: PML2AuthHeaders;
  type: "USER" | "MARKET";
  markets?: string[];
  assets_ids?: string[];
}
