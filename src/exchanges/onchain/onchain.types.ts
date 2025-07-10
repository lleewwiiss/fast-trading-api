import type { ChainType } from "@lifi/sdk";

import type { FetchOHLCVParams, Market, Ticker } from "~/types/lib.types";

export interface OnchainCredentials {
  // New Privy-based authentication
  identityToken: string; // JWT token from Privy frontend
  walletAddress: string; // Public wallet address
  chainType: "EVM" | "SOLANA"; // Chain type for the wallet

  // Keep existing service keys
  lifiApiKey: string;
  codexApiKey: string;
  evmRpcUrl: string;
  solRpcUrl: string;
}

// Add new session signer types
export interface PrivySessionConfig {
  identityToken: string;
  walletAddress: string;
  chainType: "EVM" | "SOLANA";
  expiresAt: number;
}

export interface PrivyVerificationResult {
  isValid: boolean;
  walletAddress: string;
  userId: string;
  sessionId: string;
  chainType: "EVM" | "SOLANA";
  expiresAt: number;
  error?: string;
}

export interface OnchainInitializationParams {
  credentials: OnchainCredentials;
  options?: {
    testnet?: boolean;
    timeout?: number;
  };
}

export type OnchainPosition = {
  tokenAddress: string;
  symbol: string;
  balance: string;
  usdValue: string;
  chain: ChainType;
};

export type OnchainOrder = {
  id: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  status: "pending" | "completed" | "failed";
  txHash?: string;
  chain: ChainType;
  timestamp: number;
};

export type OnchainSwapParams = {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage: number;
  chain: ChainType;
};

export type OnchainTrade = {
  id: string;
  from: string;
  to: string;
  amountIn: string;
  amountOut: string;
  price: string;
  txHash: string;
  timestamp: number;
  chain: ChainType;
};

export interface FetchOHLCVOnchainParams extends FetchOHLCVParams {
  contract: string;
  networkId: number;
}

export interface OnchainTickerData extends Ticker {}

export interface OnchainMarketData extends Market {
  chain: ChainType;
  name: string;
  contract: string;
  pairContract: string;
  token0Contract: string;
  image: string;
  networkId: number;
  lifiNetworkId: number;
  networkName: string;
  exchangeName: string;
  exchangeLogo: string;
  liquidity?: string;
  quoteToken: string;
  decimals?: number;
  onchainMarket?: OnchainMarketType;
}

export enum OnchainMarketType {
  LIFI = "LIFI",
  Meteora = "Meteora",
  Raydium = "Raydium",
  Pump = "Pump",
  PumpSwap = "PumpSwap",
}

export interface AddTokenParams {
  tokenAddress: string;
  chain: ChainType;
}
