import { Codex } from "@codex-data/sdk/dist/sdk";
import { ChainType, type ExtendedChain, getChains } from "@lifi/sdk";
import {
  EventType,
  RankingDirection,
} from "@codex-data/sdk/dist/sdk/generated/graphql";

import type { OnchainApi } from "./onchain.api";
import {
  type FetchOHLCVOnchainParams,
  type OnchainMarketData,
  OnchainMarketType,
  type OnchainSwapParams,
  type OnchainTickerData,
} from "./onchain.types";

import {
  type Balance,
  type Candle,
  ExchangeName,
  type Fill,
  type Order,
  OrderSide,
  type Position,
  PositionSide,
} from "~/types/lib.types";

// Cursor cache for pagination state
interface CursorCache {
  balances: Map<string, string | null>; // accountId -> cursor
  positions: Map<string, string | null>;
  swaps: Map<string, string | null>;
  orders: Map<string, string | null>;
  fills: Map<string, string | null>;
}

// Global cursor cache instance
const cursorCache: CursorCache = {
  balances: new Map(),
  positions: new Map(),
  swaps: new Map(),
  orders: new Map(),
  fills: new Map(),
};

// Retry utility function with exponential backoff
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export async function fetchOnchainBalances(
  account: { walletAddress: string; id: string },
  codexSdk: Codex,
  upnlByNetwork?: Map<number, number>,
): Promise<Balance> {
  if (!codexSdk) {
    throw new Error("No Codex SDK available");
  }

  const detailedWalletStats = await retryWithBackoff(() =>
    codexSdk.queries.detailedWalletStats({
      input: {
        walletAddress: account.walletAddress,
        includeNetworkBreakdown: true,
      },
    }),
  );

  const nativeBalances: Record<string, Balance> = {};
  let totalUPNL = 0;

  // Process network breakdown to get native token balances
  if (detailedWalletStats?.detailedWalletStats?.networkBreakdown) {
    for (const network of detailedWalletStats.detailedWalletStats
      .networkBreakdown) {
      if (network && network.networkId && network.nativeTokenBalance) {
        const networkId = network.networkId;
        const nativeTokenAmount = parseFloat(network.nativeTokenBalance || "0");

        // Get UPNL for this network
        const networkUPNL = upnlByNetwork?.get(networkId) || 0;
        totalUPNL += networkUPNL;

        nativeBalances[networkId.toString()] = {
          used: 0, // Native tokens are always free, not locked in positions
          free: nativeTokenAmount,
          total: nativeTokenAmount,
          upnl: networkUPNL,
        };
      }
    }
  }

  return {
    onchainBalances: nativeBalances,
    used: 0,
    free: 0,
    total: 0,
    upnl: totalUPNL,
  };
}

async function fetchPaginatedSwaps(
  codexSdk: Codex,
  walletAddress: string,
  fetchAll: boolean = true, // If true, fetch all pages; if false, fetch only new data
) {
  const swaps = [];
  let cursor = fetchAll ? null : cursorCache.swaps.get(walletAddress);
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await retryWithBackoff(async () => {
        return await codexSdk.queries.getTokenEventsForMaker({
          limit: 200,
          cursor,
          direction: RankingDirection.Asc,
          query: {
            maker: walletAddress,
            eventType: EventType.Swap,
          },
        });
      });

      if (response?.getTokenEventsForMaker?.items) {
        swaps.push(...response.getTokenEventsForMaker.items);
      }

      // Update the cursor and check for more pages
      cursor = response?.getTokenEventsForMaker?.cursor || null;
      hasMore = !!cursor;

      // Cache the latest cursor for incremental fetching
      cursorCache.swaps.set(walletAddress, cursor || null);
    } catch {
      hasMore = false; // Stop pagination on error
    }
  }

  return swaps;
}

async function fetchPaginatedBalances(
  codexSdk: Codex,
  walletAddress: string,
  fetchAll: boolean = true, // If true, fetch all pages; if false, fetch only new data
) {
  const balances = [];
  let cursor = fetchAll ? null : cursorCache.balances.get(walletAddress);
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await retryWithBackoff(async () => {
        const params: any = {
          input: {
            walletAddress,
            removeScams: true,
            limit: 200, // Max limit as specified
          },
        };

        if (cursor) {
          params.input.cursor = cursor;
        }

        return await codexSdk.queries.balances(params);
      });

      if (response?.balances?.items) {
        balances.push(...response.balances.items);
      }

      // Update the cursor and check for more pages
      cursor = response?.balances?.cursor || null;
      hasMore = !!cursor;

      // Cache the latest cursor for incremental fetching
      cursorCache.balances.set(walletAddress, cursor || null);
    } catch {
      hasMore = false; // Stop pagination on error
    }
  }

  return balances;
}

export async function fetchOnchainPositions(
  account: { id: string; walletAddress: string },
  codexSdk: Codex,
  chains?: ExtendedChain[],
  fetchAll: boolean = true,
): Promise<{
  positions: Position[];
  fills: Fill[];
  totalUPNL: number;
  upnlByNetwork: Map<number, number>;
}> {
  if (!codexSdk) {
    throw new Error("No Codex SDK available");
  }

  // Create reverse mapping from Codex network ID to LiFi chain if chains provided
  let codexNetworkIdToLifiChain: Map<number, ExtendedChain> | null = null;
  if (chains) {
    const networks = await codexSdk.queries.getNetworks({});
    const lifiChainIdToCodexNetworkId = chains.reduce(
      (acc, chain) => {
        const network = networks.getNetworks?.find(
          (n) => n.networkShortName?.toLowerCase() === chain.name.toLowerCase(),
        );
        if (network) {
          acc[chain.id] = network.id;
        }
        return acc;
      },
      {} as Record<number, number>,
    );

    // Create reverse mapping
    codexNetworkIdToLifiChain = new Map();
    for (const chain of chains) {
      const codexNetworkId = lifiChainIdToCodexNetworkId[chain.id];
      if (codexNetworkId) {
        codexNetworkIdToLifiChain.set(codexNetworkId, chain);
      }
    }
  }

  const [swaps, balances] = await Promise.all([
    fetchPaginatedSwaps(codexSdk, account.walletAddress, fetchAll),
    fetchPaginatedBalances(codexSdk, account.walletAddress, fetchAll),
  ]);

  // Create a map to store balance info by token address
  const balanceMap = new Map<string, (typeof balances)[0]>();
  for (const balance of balances) {
    if (balance.tokenAddress) {
      balanceMap.set(balance.tokenAddress, balance);
    }
  }

  // Extract fills from swap history
  const fills: Fill[] = [];

  // Track position data for each token
  const tokenPositions = new Map<
    string,
    {
      tokenAddress: string;
      symbol: string;
      totalBought: number;
      totalSpent: number;
      totalSold: number;
      totalReceived: number;
      currentBalance: number;
      avgEntryPrice: number;
      realizedPnL: number;
    }
  >();

  // Process each swap
  for (const swap of swaps) {
    if (!swap) continue;

    // Determine token addresses and amounts
    const token0Address = swap.token0Address || "";
    const token1Address = swap.token1Address || "";

    // Parse amounts and USD values
    const token0Amount = parseFloat(swap.token0ValueBase || "0");
    const token1Amount = parseFloat(swap.token1ValueBase || "0");
    const token0UsdValue = parseFloat(swap.token0SwapValueUsd || "0");
    const token1UsdValue = parseFloat(swap.token1SwapValueUsd || "0");

    // Create fill entries for both tokens in the swap
    const timestamp = swap.timestamp || Date.now();

    // Extract fills based on which token was bought/sold
    if (swap.quoteToken === "token0") {
      // Sold token0, bought token1
      if (token0Amount > 0 && token0Address) {
        const balance0 = balanceMap.get(token0Address);
        fills.push({
          symbol: balance0?.token?.symbol || token0Address.slice(0, 8),
          side: OrderSide.Sell,
          price: token0Amount > 0 ? token0UsdValue / token0Amount : 0,
          amount: token0Amount,
          timestamp,
        });
      }

      if (token1Amount > 0 && token1Address) {
        const balance1 = balanceMap.get(token1Address);
        fills.push({
          symbol: balance1?.token?.symbol || token1Address.slice(0, 8),
          side: OrderSide.Buy,
          price: token1Amount > 0 ? token1UsdValue / token1Amount : 0,
          amount: token1Amount,
          timestamp,
        });
      }
    } else {
      // Sold token1, bought token0
      if (token1Amount > 0 && token1Address) {
        const balance1 = balanceMap.get(token1Address);
        fills.push({
          symbol: balance1?.token?.symbol || token1Address.slice(0, 8),
          side: OrderSide.Sell,
          price: token1Amount > 0 ? token1UsdValue / token1Amount : 0,
          amount: token1Amount,
          timestamp,
        });
      }

      if (token0Amount > 0 && token0Address) {
        const balance0 = balanceMap.get(token0Address);
        fills.push({
          symbol: balance0?.token?.symbol || token0Address.slice(0, 8),
          side: OrderSide.Buy,
          price: token0Amount > 0 ? token0UsdValue / token0Amount : 0,
          amount: token0Amount,
          timestamp,
        });
      }
    }

    // In a swap, determine which token was bought vs sold based on the maker's perspective
    // The maker is our wallet address, so we need to track what they received vs what they gave

    // For now, we'll use a simple approach:
    // If quoteToken is token0, then token0 was sold (negative) and token1 was bought (positive)
    // If quoteToken is token1, then token1 was sold (negative) and token0 was bought (positive)

    if (swap.quoteToken === "token0") {
      // Sold token0, bought token1
      processTokenTransaction(
        tokenPositions,
        token0Address,
        "", // No symbol data from swap
        -token0Amount,
        -token0UsdValue,
      );
      processTokenTransaction(
        tokenPositions,
        token1Address,
        "",
        token1Amount,
        token1UsdValue,
      );
    } else {
      // Sold token1, bought token0
      processTokenTransaction(
        tokenPositions,
        token1Address,
        "",
        -token1Amount,
        -token1UsdValue,
      );
      processTokenTransaction(
        tokenPositions,
        token0Address,
        "",
        token0Amount,
        token0UsdValue,
      );
    }
  }

  // Build Position objects for tokens with non-zero balances
  const positions: Position[] = [];
  let totalUPNL = 0;
  const upnlByNetwork = new Map<number, number>();

  for (const [tokenAddress, posData] of tokenPositions) {
    const balance = balanceMap.get(tokenAddress);
    if (!balance || parseFloat(balance.balance || "0") <= 0) {
      continue; // Skip tokens with zero balance
    }

    const currentBalance = parseFloat(balance.balance || "0");
    const currentPrice = parseFloat(balance.balanceUsd || "0") / currentBalance;

    // Calculate UPNL
    const upnl = currentBalance * (currentPrice - posData.avgEntryPrice);
    totalUPNL += upnl;

    // Track UPNL by networkId
    const networkId = balance.networkId || 0;
    const currentNetworkUPNL = upnlByNetwork.get(networkId) || 0;
    upnlByNetwork.set(networkId, currentNetworkUPNL + upnl);

    // Get LiFi chain data for this network
    const lifiChain = codexNetworkIdToLifiChain?.get(balance.networkId || 0);
    const chainType =
      lifiChain?.chainType || getChainTypeFromNetworkId(balance.networkId || 0);
    const networkName = lifiChain?.name || "";

    // Skip positions without a valid token address or network info
    if (!tokenAddress || !networkName) {
      continue;
    }

    positions.push({
      exchange: ExchangeName.ONCHAIN,
      accountId: account.id,
      symbol: balance.token?.symbol || "",
      side: PositionSide.Long, // Always long for spot positions
      entryPrice: posData.avgEntryPrice,
      notional: currentBalance * currentPrice,
      leverage: 1, // No leverage for spot
      upnl,
      rpnl: posData.realizedPnL,
      contracts: currentBalance,
      liquidationPrice: 0, // No liquidation for spot

      // Onchain-specific metadata for tracking
      tokenAddress,
      chainType,
      networkId: balance.networkId,
      networkName,
    });
  }

  return { positions, fills, totalUPNL, upnlByNetwork };
}

// Helper function to determine chain type from network ID
function getChainTypeFromNetworkId(networkId: number): ChainType {
  // Common Solana network IDs (based on typical Codex network mappings)
  const solanaNetworks = [1399811149]; // Solana mainnet

  // If it's a known Solana network, return SVM, otherwise assume EVM
  return solanaNetworks.includes(networkId) ? ChainType.SVM : ChainType.EVM;
}

// Helper function to process token transactions
function processTokenTransaction(
  tokenPositions: Map<string, any>,
  tokenAddress: string,
  symbol: string,
  amount: number,
  usdValue: number,
) {
  if (!tokenAddress || amount === 0) return;

  let position = tokenPositions.get(tokenAddress);
  if (!position) {
    position = {
      tokenAddress,
      symbol,
      totalBought: 0,
      totalSpent: 0,
      totalSold: 0,
      totalReceived: 0,
      currentBalance: 0,
      avgEntryPrice: 0,
      realizedPnL: 0,
    };
    tokenPositions.set(tokenAddress, position);
  }

  if (amount > 0) {
    // Buying
    position.totalBought += amount;
    position.totalSpent += Math.abs(usdValue);
    position.currentBalance += amount;

    // Update average entry price
    if (position.totalBought > 0) {
      position.avgEntryPrice = position.totalSpent / position.totalBought;
    }
  } else {
    // Selling
    const sellAmount = Math.abs(amount);
    position.totalSold += sellAmount;
    position.totalReceived += Math.abs(usdValue);
    position.currentBalance -= sellAmount;

    // Calculate realized P&L for this sell
    if (position.avgEntryPrice > 0) {
      const costBasis = sellAmount * position.avgEntryPrice;
      const proceeds = Math.abs(usdValue);
      position.realizedPnL += proceeds - costBasis;
    }

    // Reset position if fully sold
    if (position.currentBalance <= 0) {
      position.currentBalance = 0;
      position.avgEntryPrice = 0;
      position.totalBought = 0;
      position.totalSpent = 0;
    }
  }
}

export async function fetchOnchainOrders(
  _account: { id: string; evmAddress: string; solAddress: string },
  _codexSdk: any,
  _fetchAll: boolean = true,
): Promise<Order[]> {
  // Note: Unconfirmed transactions (pending orders) are only available via WebSocket
  // subscription, not as a fetchable endpoint. The getUnconfirmedTokenEventsForMaker
  // endpoint does not exist - only the WebSocket stream exists.

  // For onchain exchanges, "orders" in the traditional sense don't exist
  // since transactions are either:
  // 1. Confirmed (already executed) - these become fills
  // 2. Unconfirmed (pending in mempool) - only available via WebSocket
  //
  // Return empty array since we cannot fetch pending transactions via API
  return [];
}

export async function fetchOnchainMarketsTickers(codexSDK: Codex) {
  // load all base tokens for each chain as well as stables USDT, USDC, BUSD
  const chains = await getChains({
    chainTypes: [ChainType.SVM, ChainType.EVM],
  });

  const stables = ["USDT", "USDC", "BUSD"];

  const networks = await codexSDK.queries.getNetworks({});

  const lifiChainIdToCodexNetworkId = chains.reduce(
    (acc, chain) => {
      // Try multiple matching strategies
      let network = networks.getNetworks?.find(
        (n) => n.networkShortName?.toLowerCase() === chain.name.toLowerCase(),
      );

      if (!network) {
        // Try matching by full name
        network = networks.getNetworks?.find(
          (n) => n.name?.toLowerCase() === chain.name.toLowerCase(),
        );
      }

      if (!network) {
        // Try matching by LiFi chain ID directly (many networks use the same ID)
        network = networks.getNetworks?.find((n) => n.id === chain.id);
      }

      if (network) {
        acc[chain.id] = network.id;
      }

      return acc;
    },
    {} as Record<number, number>,
  );

  const markets: Record<string, OnchainMarketData> = {};
  const tickers: Record<string, OnchainTickerData> = {};

  // Create a flat array of all fetch tasks
  const fetchTasks: Array<
    Promise<{
      market: OnchainMarketData;
      ticker: OnchainTickerData;
    } | null>
  > = [];

  for (const chain of chains) {
    const codexNetworkId = lifiChainIdToCodexNetworkId[chain.id];
    if (!codexNetworkId) {
      continue; // Skip chains without a Codex network ID
    }

    // Add native token fetch task
    fetchTasks.push(
      fetchTokenData({
        phrase: chain.coin,
        chainType: chain.chainType,
        lifiNetworkId: chain.id,
        codexNetworkId,
        networkName: chain.name,
        native: true,
        chains,
        codexSDK,
      }),
    );

    // Add stablecoin fetch tasks for this chain
    for (const stable of stables) {
      // Skip certain combinations
      if (
        (chain.chainType === ChainType.SVM &&
          (stable === "BUSD" || stable === "USDT")) ||
        (chain.name !== "BSC" && stable === "BUSD")
      ) {
        continue;
      }

      fetchTasks.push(
        fetchTokenData({
          phrase: stable,
          chainType: chain.chainType,
          lifiNetworkId: chain.id,
          codexNetworkId,
          networkName: chain.name,
          native: true,
          chains,
          codexSDK,
        }),
      );
    }
  }

  // Execute all fetch tasks in parallel with a reasonable concurrency limit
  const batchSize = 5; // Limit concurrent requests to avoid overwhelming APIs
  for (let i = 0; i < fetchTasks.length; i += batchSize) {
    const batch = fetchTasks.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch);

    // Process results from this batch
    for (const result of results) {
      if (
        result.status === "fulfilled" &&
        result.value?.ticker &&
        result.value?.market
      ) {
        tickers[result.value.ticker.id] = result.value.ticker;
        markets[result.value.market.id] = result.value.market;
      }
    }
  }

  return { markets, tickers, chains };
}

export async function fetchOnchainTickers(
  _balances: any[],
  codexSdk: Codex,
): Promise<any[]> {
  if (!codexSdk) {
    throw new Error("No Codex SDK available");
  }

  return [];
}

export async function placeOnchainSwap(
  _api: OnchainApi,
  _params: OnchainSwapParams,
): Promise<Order> {
  throw new Error("placeOnchainSwap not implemented");
}

export async function cancelOnchainOrder(
  _api: OnchainApi,
  _orderId: string,
): Promise<boolean> {
  throw new Error("cancelOnchainOrder not implemented");
}

export async function getOnchainOrderStatus(
  _api: OnchainApi,
  _orderId: string,
): Promise<Order> {
  throw new Error("getOnchainOrderStatus not implemented");
}

export async function fetchSolanaTokenBalance(
  _api: OnchainApi,
  _tokenAddress: string,
): Promise<string> {
  throw new Error("fetchSolanaTokenBalance not implemented");
}

export async function fetchEvmTokenBalance(
  _api: OnchainApi,
  _tokenAddress: string,
): Promise<string> {
  throw new Error("fetchEvmTokenBalance not implemented");
}

export async function fetchTokenPrice(
  _api: OnchainApi,
  _tokenAddress: string,
  _chain: "sol" | "evm",
): Promise<string> {
  throw new Error("fetchTokenPrice not implemented");
}

export async function fetchOnchainOHLCV({
  codexSdk,
  params,
}: {
  codexSdk: Codex;
  params: FetchOHLCVOnchainParams;
}) {
  if (!codexSdk) {
    throw new Error("No Codex SDK available for OHLCV data");
  }

  // Map timeframe to Codex resolution format
  const RESOLUTION: Record<string, string> = {
    "1m": "1",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "4h": "240",
    "1d": "1D",
    "1w": "1W",
  };

  const resolution = RESOLUTION[params.timeframe] || "60";

  // Set the default time range if not provided (last 30 days)
  const now = Date.now();
  const from = params.from || now - 30 * 24 * 60 * 60 * 1000;
  const to = params.to || now;

  try {
    // Call Codex getBars API with retry
    const barsData = await retryWithBackoff(async () => {
      return await codexSdk.queries.getBars({
        symbol: `${params.contract}:${params.networkId}`,
        resolution,
        from: Math.floor(from / 1000), // Convert to seconds
        to: Math.floor(to / 1000), // Convert to seconds
        countback: params.limit || 500,
        removeEmptyBars: true,
        removeLeadingNullValues: true,
        currencyCode: "USD",
      });
    });

    const candles: Candle[] = [];

    if (barsData?.getBars) {
      const bars = barsData.getBars;

      // Handle both array and object response formats
      const timestamps = Array.isArray(bars.t)
        ? bars.t
        : [bars.t].filter(Boolean);
      const opens = Array.isArray(bars.o) ? bars.o : [bars.o].filter(Boolean);
      const highs = Array.isArray(bars.h) ? bars.h : [bars.h].filter(Boolean);
      const lows = Array.isArray(bars.l) ? bars.l : [bars.l].filter(Boolean);
      const closes = Array.isArray(bars.c) ? bars.c : [bars.c].filter(Boolean);
      const volumes = Array.isArray(bars.volume)
        ? bars.volume
        : [bars.volume].filter(Boolean);

      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] && opens[i] && highs[i] && lows[i] && closes[i]) {
          candles.push({
            symbol: params.contract,
            timeframe: params.timeframe,
            timestamp: parseInt(String(timestamps[i])),
            open: parseFloat(String(opens[i])),
            high: parseFloat(String(highs[i])),
            low: parseFloat(String(lows[i])),
            close: parseFloat(String(closes[i])),
            volume: parseFloat(String(volumes[i] || "0")),
          });
        }
      }
    }

    // Sort by timestamp ascending
    candles.sort((a, b) => a.timestamp - b.timestamp);

    return candles;
  } catch (error) {
    throw new Error(`Error fetching OHLCV data: ${error}`);
  }
}

export async function fetchOnchainFills(
  _account: { id: string; evmAddress: string; solAddress: string },
  codexSdk: Codex,
  _fetchAll: boolean = true,
): Promise<any[]> {
  if (!codexSdk) {
    throw new Error("No Codex SDK available");
  }
  return [];
}

const customChainIDS = [
  {
    id: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    name: "Meteora",
    tradeUrl: "https://app.meteora.ag",
    iconUrl:
      "https://crypto-exchange-logos-production.s3.us-west-2.amazonaws.com/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo_1399811149.png?cache=1712790444482",
  },
  {
    id: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    name: "PumpSwap",
    tradeUrl: "https://swap.pump.fun/swap",
    iconUrl:
      "https://crypto-exchange-logos-staging.s3.us-west-2.amazonaws.com/pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA_1399811149.png?cache=1740442949963",
  },
  {
    id: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    name: "Pump",
    tradeUrl: "https://pump.fun",
    iconUrl:
      "https://crypto-exchange-logos-production.s3.us-west-2.amazonaws.com/6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P.webp",
  },
  {
    id: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    name: "Raydium",
    tradeUrl: "https://raydium.io/swap",
    iconUrl:
      "https://crypto-exchange-logos-staging.s3.us-west-2.amazonaws.com/675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8_1399811149.png?cache=1710536853967",
  },
];

interface fetchTokenDataProps {
  phrase: string;
  chainType: ChainType;
  codexSDK: Codex;
  chains: ExtendedChain[];
  networkName: string;
  codexNetworkId: number;
  lifiNetworkId?: number;
  native: boolean;
}

export async function fetchTokenData({
  phrase,
  chainType,
  lifiNetworkId,
  codexNetworkId,
  networkName,
  codexSDK,
  chains,
  native,
}: fetchTokenDataProps): Promise<{
  market: OnchainMarketData;
  ticker: OnchainTickerData;
} | null> {
  if (!lifiNetworkId) {
    const chain = chains.find(
      (c) => c.name === networkName && c.chainType === chainType,
    );
    if (!chain) {
      return null; // Skip if chain not found
    }
    lifiNetworkId = chain.id;
  }

  const tokenData = await retryWithBackoff(async () => {
    return await codexSDK.queries.filterTokens({
      phrase,
      limit: 1,
      filters: { network: [codexNetworkId] },
    });
  });

  const tokenInfoResults = tokenData.filterTokens?.results;

  if (!tokenInfoResults || tokenInfoResults.length === 0) {
    return null; // Skip this token entirely
  }

  const tokenInfo = tokenInfoResults[0];

  if (!tokenInfo || !tokenInfo.token) {
    return null; // Skip if no valid token info
  }

  // For native tokens, ensure the symbol matches what we're looking for
  if (
    native &&
    tokenInfo.token.symbol?.toLowerCase() !== phrase.toLowerCase()
  ) {
    return null; // Skip if symbol doesn't match
  }

  let onchainMarket = OnchainMarketType.LIFI;
  for (const customChain of customChainIDS) {
    for (const exchange of tokenInfo.exchanges || []) {
      if (exchange && exchange.name === customChain.name) {
        onchainMarket = customChain.id as OnchainMarketType;
        break;
      }
    }
  }

  // Use metadata for enhanced market data
  const market: OnchainMarketData = {
    id: tokenInfo.token.address,
    exchange: ExchangeName.ONCHAIN,
    precision: {
      amount: tokenInfo.token.decimals,
      price: tokenInfo.token.decimals,
    },
    limits: {
      amount: {
        min: 0,
        max: Number(tokenInfo.liquidity),
        maxMarket: Number(tokenInfo.liquidity),
      },
      leverage: {
        min: 1,
        max: 1,
      },
    },
    symbol: tokenInfo.token.symbol || "",
    base: tokenInfo.token.symbol || "",
    quote: "USD",
    active: true,
    chain: chainType,
    name: tokenInfo.token.name || "",
    contract: tokenInfo.token.address,
    pairContract: tokenInfo.pair?.address || "",
    token0Contract: tokenInfo?.pair?.token0 || "",
    image: tokenInfo.token.info?.imageThumbUrl || "",
    networkId: tokenInfo.token.info?.networkId || 0,
    codexNetworkId,
    lifiNetworkId,
    networkName,
    exchangeName: tokenInfo.exchanges![0]?.name || "Unknown",
    exchangeLogo: tokenInfo.exchanges![0]?.iconUrl || "",
    liquidity: tokenInfo.liquidity || "0",
    quoteToken: tokenInfo.quoteToken || "",
    decimals: tokenInfo.token.decimals,
    onchainMarket,
  };

  const ticker: OnchainTickerData = {
    id: tokenInfo.token.address,
    exchange: ExchangeName.ONCHAIN,
    symbol: tokenInfo.token.symbol || tokenInfo.token.address,
    cleanSymbol: tokenInfo.token.symbol || "",
    bid: parseFloat(tokenInfo.priceUSD || "0"),
    ask: parseFloat(tokenInfo.priceUSD || "0"),
    last: parseFloat(tokenInfo.priceUSD || "0"),
    percentage: parseFloat(tokenInfo.change24 || "0"),
    volume: parseFloat(tokenInfo.volume24 || "0"),
    quoteVolume: parseFloat(tokenInfo.volume24 || "0"),
    mark: parseFloat(tokenInfo.priceUSD || "0"),
    index: parseFloat(tokenInfo.priceUSD || "0"),
    openInterest: 0, // No open interest for spot markets
    fundingRate: 0, // No funding rate for spot markets
  };

  return { market, ticker };
}
