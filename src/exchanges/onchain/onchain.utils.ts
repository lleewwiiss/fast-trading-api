// Chain mapping cache
let chainMappingCache: Record<number, string> | null = null;
let chainMappingLastFetch = 0;
const CHAIN_MAPPING_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Retry utility function
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 1,
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

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Get LiFi chain mapping from networkId to chain key
 * Fetches and caches chain mappings from LiFi SDK
 */
export async function getLiFiChainMapping(): Promise<Record<number, string>> {
  const now = Date.now();

  // Return cached mapping if still valid
  if (
    chainMappingCache &&
    now - chainMappingLastFetch < CHAIN_MAPPING_CACHE_DURATION
  ) {
    return chainMappingCache;
  }

  try {
    // Import LiFi SDK functions dynamically to avoid circular dependencies
    const { getChains } = await import("@lifi/sdk");

    const mapping: Record<number, string> = {};

    // Fetch EVM chains
    const evmChains = await retryWithBackoff(() =>
      getChains({ chainTypes: ["EVM" as any] }),
    );

    for (const chain of evmChains) {
      mapping[chain.id] = chain.key;
    }

    // Fetch SVM chains
    const svmChains = await retryWithBackoff(() =>
      getChains({ chainTypes: ["SVM" as any] }),
    );

    for (const chain of svmChains) {
      mapping[chain.id] = chain.key;
    }

    // Cache the result
    chainMappingCache = mapping;
    chainMappingLastFetch = now;

    return mapping;
  } catch {
    // Return fallback mapping if cache exists
    if (chainMappingCache) {
      return chainMappingCache;
    }

    // Return basic fallback mapping
    return {
      1: "eth", // Ethereum mainnet
      42161: "arb", // Arbitrum
      1399811149: "sol", // Solana mainnet
    };
  }
}

/**
 * Convert Codex networkId to LiFi chain key
 */
export async function networkIdToChainKey(
  networkId: number,
): Promise<string | null> {
  try {
    const mapping = await getLiFiChainMapping();
    return mapping[networkId] || null;
  } catch {
    // Fallback for common chains
    switch (networkId) {
      case 1:
        return "eth";
      case 42161:
        return "arb";
      case 1399811149:
        return "sol";
      default:
        return null;
    }
  }
}
