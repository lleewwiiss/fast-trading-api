import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock the Codex SDK
const mockCodexSdk = {
  queries: {
    filterTokens: mock(() =>
      Promise.resolve({
        filterTokens: {
          results: [
            {
              token: {
                address: "0x1234567890123456789012345678901234567890",
                symbol: "TEST",
                name: "Test Token",
                decimals: 18,
              },
              exchanges: [
                {
                  name: "Uniswap",
                  iconUrl: "https://example.com/icon.png",
                },
              ],
              liquidity: "1000000",
              priceUSD: "1.00",
              change24: "5.5",
              volume24: "50000",
              pair: {
                address: "0xabcdef1234567890abcdef1234567890abcdef12",
                token0: "0x1234567890123456789012345678901234567890",
                token1: "0x0000000000000000000000000000000000000000",
              },
              quoteToken: "USDC",
            },
          ],
        },
      }),
    ),
    getNetworks: mock(() =>
      Promise.resolve({
        getNetworks: [
          {
            id: 137,
            name: "Polygon",
            networkShortName: "polygon",
          },
          {
            id: 1,
            name: "Solana",
            networkShortName: "solana",
          },
        ],
      }),
    ),
  },
};

// Mock LiFi SDK
const mockGetChains = mock(() =>
  Promise.resolve([
    {
      id: 137,
      name: "polygon",
      chainType: "EVM" as const,
      coin: "MATIC",
    },
    {
      id: 1151111081099710,
      name: "solana",
      chainType: "SVM" as const,
      coin: "SOL",
    },
  ]),
);

// Mock the imports
mock.module("@lifi/sdk", () => ({
  getChains: mockGetChains,
  ChainType: { SVM: "SVM", EVM: "EVM" },
}));

mock.module("./onchain.resolver", () => ({
  fetchTokenData: mock(() =>
    Promise.resolve({
      market: {
        id: "0x1234567890123456789012345678901234567890",
        exchange: "ONCHAIN",
        precision: { amount: 18, price: 18 },
        limits: {
          amount: { min: 0, max: 1000000 },
          leverage: { min: 1, max: 1 },
        },
        symbol: "TEST",
        base: "TEST",
        quote: "USD",
        active: true,
        chain: "EVM",
        name: "Test Token",
        contract: "0x1234567890123456789012345678901234567890",
        pairContract: "0xabcdef1234567890abcdef1234567890abcdef12",
        token0Contract: "0x1234567890123456789012345678901234567890",
        image: "https://example.com/image.png",
        networkId: 137,
        codexNetworkId: 137,
        lifiNetworkId: 137,
        networkName: "polygon",
        exchangeName: "Uniswap",
        exchangeLogo: "https://example.com/icon.png",
        liquidity: "1000000",
        quoteToken: "USDC",
        decimals: 18,
        onchainMarket: "LIFI",
      },
      ticker: {
        id: "0x1234567890123456789012345678901234567890",
        exchange: "ONCHAIN",
        symbol: "TEST",
        cleanSymbol: "TEST",
        bid: 1.0,
        ask: 1.0,
        last: 1.0,
        percentage: 5.5,
        volume: 50000,
        quoteVolume: 50000,
        mark: 1.0,
        index: 1.0,
        openInterest: 0,
        fundingRate: 0,
      },
    }),
  ),
}));

// Import after mocking
import { OnchainWorker } from "./onchain.worker";

import { ExchangeName } from "~/types/lib.types";

describe("OnchainWorker.addTokenToTracking", () => {
  let worker: OnchainWorker;
  let mockParent: any;

  beforeEach(() => {
    // Reset mocks
    mockCodexSdk.queries.filterTokens.mockClear();
    mockCodexSdk.queries.getNetworks.mockClear();
    mockGetChains.mockClear();

    // Create mock parent
    mockParent = {
      postMessage: mock(() => {}),
      addEventListener: mock(() => {}),
    };

    // Create worker instance
    worker = new OnchainWorker({
      parent: mockParent,
      config: {
        PUBLIC_API_URL: "",
        PRIVATE_API_URL: "",
        WS_PUBLIC_URL: "",
        WS_PRIVATE_URL: "",
        WS_TRADE_URL: "",
        options: {
          CodexAPIKey: "test-api-key",
        },
      },
      name: ExchangeName.ONCHAIN,
    });

    // Set up the worker with mock Codex SDK
    (worker as any).codexSdk = mockCodexSdk;
  });

  test("should successfully add EVM token to tracking", async () => {
    const params = {
      requestId: "test-request-1",
      tokenAddress: "0x1234567890123456789012345678901234567890",
      codexNetworkId: 137,
    };

    await worker.addTokenToTracking(params);

    // Verify Codex SDK was called correctly
    expect(mockCodexSdk.queries.filterTokens).toHaveBeenCalledWith({
      phrase: params.tokenAddress,
      limit: 1,
      filters: { network: [params.codexNetworkId] },
    });

    // Verify success response was emitted
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      type: "response",
      requestId: params.requestId,
      data: true,
    });
  });

  test("should successfully add SOLANA token to tracking", async () => {
    // Mock Solana token response
    mockCodexSdk.queries.filterTokens.mockResolvedValueOnce({
      filterTokens: {
        results: [
          {
            token: {
              address: "So11111111111111111111111111111111111111112",
              symbol: "SOL",
              name: "Solana",
              decimals: 9,
            },
            exchanges: [
              {
                name: "Raydium",
                iconUrl: "https://example.com/icon.png",
              },
            ],
            liquidity: "5000000",
            priceUSD: "150.00",
            change24: "2.1",
            volume24: "1000000",
            pair: {
              address: "pair123",
              token0: "So11111111111111111111111111111111111111112",
              token1: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            },
            quoteToken: "USDC",
          },
        ],
      },
    });

    const params = {
      requestId: "test-request-2",
      tokenAddress: "So11111111111111111111111111111111111111112",
      codexNetworkId: 1,
    };

    await worker.addTokenToTracking(params);

    // Verify success response was emitted
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      type: "response",
      requestId: params.requestId,
      data: true,
    });
  });

  test("should return true when token is already tracked", async () => {
    const tokenAddress = "0x1234567890123456789012345678901234567890";

    // Pre-populate memory with existing token
    worker.memory.public.markets[tokenAddress] = {} as any;

    const params = {
      requestId: "test-request-3",
      tokenAddress,
      codexNetworkId: 137,
    };

    await worker.addTokenToTracking(params);

    // Verify filterTokens was not called (early return)
    expect(mockCodexSdk.queries.filterTokens).not.toHaveBeenCalled();

    // Verify success response was emitted
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      type: "response",
      requestId: params.requestId,
      data: true,
    });
  });

  test("should fail when Codex SDK is not available", async () => {
    // Remove Codex SDK
    (worker as any).codexSdk = null;

    const params = {
      requestId: "test-request-4",
      tokenAddress: "0x1234567890123456789012345678901234567890",
      codexNetworkId: 137,
    };

    await worker.addTokenToTracking(params);

    // Verify error response was emitted
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      type: "response",
      requestId: params.requestId,
      data: false,
    });
  });

  test("should fail when no token data is found", async () => {
    // Mock empty results
    mockCodexSdk.queries.filterTokens.mockResolvedValueOnce({
      filterTokens: {
        results: [],
      },
    });

    const params = {
      requestId: "test-request-5",
      tokenAddress: "0x1234567890123456789012345678901234567890",
      codexNetworkId: 137,
    };

    await worker.addTokenToTracking(params);

    // Verify error response was emitted
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      type: "response",
      requestId: params.requestId,
      data: false,
    });
  });

  test("should fail when token address doesn't match", async () => {
    // Mock different token address in result
    mockCodexSdk.queries.filterTokens.mockResolvedValueOnce({
      filterTokens: {
        results: [
          {
            token: {
              address: "0x9999999999999999999999999999999999999999", // Different address
              symbol: "TEST",
              name: "Test Token",
              decimals: 18,
            },
            exchanges: [
              {
                name: "Uniswap",
                iconUrl: "https://example.com/icon.png",
              },
            ],
            liquidity: "1000000",
            priceUSD: "1.00",
            change24: "5.5",
            volume24: "50000",
            pair: {
              address: "0xabcdef1234567890abcdef1234567890abcdef12",
              token0: "0x9999999999999999999999999999999999999999",
              token1: "0x0000000000000000000000000000000000000000",
            },
            quoteToken: "USDC",
          },
        ],
      },
    });

    const params = {
      requestId: "test-request-6",
      tokenAddress: "0x1234567890123456789012345678901234567890",
      codexNetworkId: 137,
    };

    await worker.addTokenToTracking(params);

    // Verify error response was emitted
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      type: "response",
      requestId: params.requestId,
      data: false,
    });
  });

  test("should handle network mapping errors gracefully", async () => {
    // Mock getNetworks to return empty array
    mockCodexSdk.queries.getNetworks.mockResolvedValueOnce({
      getNetworks: [],
    });

    const params = {
      requestId: "test-request-7",
      tokenAddress: "0x1234567890123456789012345678901234567890",
      codexNetworkId: 999, // Non-existent network
    };

    await worker.addTokenToTracking(params);

    // Verify error response was emitted
    expect(mockParent.postMessage).toHaveBeenCalledWith({
      type: "response",
      requestId: params.requestId,
      data: false,
    });
  });
});
