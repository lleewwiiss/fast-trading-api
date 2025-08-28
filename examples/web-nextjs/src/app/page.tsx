"use client";

import { useState, useEffect } from "react";

// Use package entrypoint when running example
import { FastTradingApi } from "fast-trading-api";

// Global library singleton
class LibraryLoader {
  private static instance: LibraryLoader;
  public FastTradingApi: any = null;
  public ExchangeName: any = null;
  public loaded: boolean = false;

  public static getInstance(): LibraryLoader {
    if (!LibraryLoader.instance) {
      LibraryLoader.instance = new LibraryLoader();
    }
    return LibraryLoader.instance;
  }

  public async loadLibrary() {
    if (this.loaded) return;

    const module = await import("fast-trading-api");
    this.FastTradingApi = module.FastTradingApi;
    this.ExchangeName = module.ExchangeName;
    this.loaded = true;
  }
}

const libraryLoader = LibraryLoader.getInstance();

function OnchainAddToken({
  api,
  addLog,
}: {
  api: any;
  addLog: (msg: string, type?: string) => void;
}) {
  const [tokenAddress, setTokenAddress] = useState("");
  const [codexNetworkId, setCodexNetworkId] = useState<number>(137);

  useEffect(() => {
    // Auto-detect network: base58-ish -> SOLANA (1), 0x -> EVM (137 for polygon as default)
    if (!tokenAddress) return;
    const isEvm = /^0x[0-9a-fA-F]{40}$/.test(tokenAddress);
    const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenAddress);
    if (isEvm) {
      setCodexNetworkId(137); // Polygon as default for EVM
    } else if (isSol) {
      setCodexNetworkId(1); // Solana mainnet
    }
  }, [tokenAddress]);

  const onAdd = async () => {
    try {
      if (!api) return;
      const ex = libraryLoader.ExchangeName.ONCHAIN;
      const before = Object.keys(
        api.store.memory?.[ex]?.public?.markets || {},
      ).length;
      await api.addTokenToTracking({
        exchangeName: ex,
        tokenAddress,
        codexNetworkId,
      });
      await new Promise((r) => setTimeout(r, 1200));
      const after = Object.keys(
        api.store.memory?.[ex]?.public?.markets || {},
      ).length;
      addLog(
        `Onchain: addTokenToTracking ${tokenAddress} (network: ${codexNetworkId}) -> markets ${before} -> ${after}`,
      );
    } catch (e: any) {
      addLog(`Onchain add token failed: ${e.message}`, "error");
    }
  };
  return (
    <div style={{ minWidth: 340 }}>
      <div style={{ fontWeight: 600 }}>Onchain: Add Token</div>
      <input
        placeholder="Token address"
        value={tokenAddress}
        onChange={(e) => setTokenAddress(e.target.value)}
        style={{ width: "100%", padding: 8, marginTop: 6 }}
      />
      <div style={{ display: "flex", gap: 8, margin: "6px 0" }}>
        <input
          placeholder="codex network id (e.g., 137 for Polygon, 1 for Solana)"
          type="number"
          value={codexNetworkId}
          onChange={(e) => setCodexNetworkId(Number(e.target.value))}
          style={{ padding: 6, flex: 1 }}
        />
      </div>
      <button onClick={onAdd} style={{ padding: "6px 10px" }}>
        Add Token
      </button>
    </div>
  );
}

function PolymarketAddMarket({
  api,
  addLog,
}: {
  api: any;
  addLog: (msg: string, type?: string) => void;
}) {
  const [marketId, setMarketId] = useState("");
  const onAdd = async () => {
    try {
      if (!api) return;
      const ex = libraryLoader.ExchangeName.POLYMARKET;
      const before = Object.keys(
        api.store.memory?.[ex]?.public?.markets || {},
      ).length;
      await api.addMarketToTracking({ exchangeName: ex, marketId });
      await new Promise((r) => setTimeout(r, 1000));
      const after = Object.keys(
        api.store.memory?.[ex]?.public?.markets || {},
      ).length;
      addLog(
        `Polymarket: addMarketToTracking ${marketId} -> markets ${before} -> ${after}`,
      );
    } catch (e: any) {
      addLog(`Polymarket add market failed: ${e.message}`, "error");
    }
  };
  return (
    <div style={{ minWidth: 340 }}>
      <div style={{ fontWeight: 600 }}>Polymarket: Add Market</div>
      <input
        placeholder="Gamma event id"
        value={marketId}
        onChange={(e) => setMarketId(e.target.value)}
        style={{ width: "100%", padding: 8, marginTop: 6, marginBottom: 6 }}
      />
      <button onClick={onAdd} style={{ padding: "6px 10px" }}>
        Add Market
      </button>
    </div>
  );
}

export default function Home() {
  const [api, setApi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<
    Record<string, { status: string; details: string }>
  >({});
  const [logs, setLogs] = useState<string[]>([]);
  const [testRunning, setTestRunning] = useState(false);

  const addLog = (message: string, type: string = "info") => {
    const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    setLogs((prev) => [...prev, logEntry]);
  };

  const updateStatus = (
    exchange: string,
    status: "loading" | "success" | "error",
    details: string = "",
  ) => {
    setStatus((prev) => ({
      ...prev,
      [exchange]: { status, details },
    }));
  };

  useEffect(() => {
    // Load the FastTradingApi library
    const loadLibrary = async () => {
      try {
        await libraryLoader.loadLibrary();
        setLoading(false);
        addLog("Fast Trading API loaded successfully!");
      } catch (error: any) {
        addLog(`Failed to load library: ${error.message}`, "error");
        setLoading(false);
      }
    };

    if (!libraryLoader.loaded) {
      loadLibrary();
    } else {
      setLoading(false);
      addLog("Fast Trading API already loaded!");
    }
  }, []);

  const runIntegrationTest = async () => {
    if (
      !libraryLoader.loaded ||
      !libraryLoader.FastTradingApi ||
      !libraryLoader.ExchangeName
    ) {
      addLog("Library not loaded yet", "error");
      return;
    }

    const { FastTradingApi, ExchangeName } = libraryLoader;

    setTestRunning(true);
    setStatus({});

    try {
      addLog("Starting Fast Trading API Integration Test");

      // Configuration
      const accounts = [
        {
          id: "account_cmdvkdyhe0002sjm1rxae66rx",
          exchange: ExchangeName.BYBIT,
          apiKey: "uYDNJd03iOzybK7I8I",
          apiSecret: "Eeob0V7Plyp7zz7GJipR2zUcGNLUDx8vlJ5D",
        },
        {
          id: "account_cmdvkdyhe0000sjm1x6is5pcs",
          exchange: ExchangeName.HL,
          apiKey: "0xa015c5158ed61a749b2247294fc29e8fa951a737",
          apiSecret:
            "0x2920dbef73ee44c1a5780cc836c0e2c4f5e5ca98c37f8a30101f4fe12b6434f6",
        },
        {
          id: "account_cmdvkdyhe0001sjm14spcr587",
          exchange: ExchangeName.POLYMARKET,
          apiKey: "0xa015C5158eD61A749b2247294fc29E8fA951A737",
          apiSecret:
            "0x50be2ade278c0ddbb04b3492bdf9b91ca61d1903f9e31261558a02a1fb8e33f3",
          walletAddress: "0xa015C5158eD61A749b2247294fc29E8fA951A737",
          funderAddress: "0xee972e9b70dd7002e470d94b98a63b441d99266a",
        },
        {
          id: "0xE5c93D6cd2f0f9F510bee112c5eDcF80b3A676f3",
          exchange: ExchangeName.ONCHAIN,
          apiKey: "",
          apiSecret: "",
          identityToken:
            "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Im91VGQ4cHh4aWJMVEMxR1NRa0Rnc0ZVVi1YYjcwNXQ5eTlHV3dQRWVpVXMifQ.eyJzaWQiOiJjbWR3Z3ZwZTQwMGtqanIwYmo2OTY0NWYyIiwiaXNzIjoicHJpdnkuaW8iLCJpYXQiOjE3NTQyOTA4MTAsImF1ZCI6ImNtYnFjM2lndDAxYTBsMjBsYndqZnNqcDAiLCJzdWIiOiJkaWQ6cHJpdnk6Y21kcGJkb3hrMDBydWw0MGtkOWtuOGY0YyIsImV4cCI6MTc1NDI5NDQxMH0.y1Ly6M42dFYpZ3e7CugBj0PbhwVg1SLAyf8DFyb85-u2lBSs0xzXlG8slELF-ngRQHHCn2O_nAfXCF0f4urK3w",
          walletAddress: "0xE5c93D6cd2f0f9F510bee112c5eDcF80b3A676f3",
          chainType: "EVM",
          codexApiKey: "2e3e54245cf24772804a18f947162884361ad783",
        },
        {
          id: "8qAsKnthFS3HXh2k2Ek5Atporqfb6vN424HtLQz897e",
          exchange: ExchangeName.ONCHAIN,
          apiKey: "",
          apiSecret: "",
          identityToken:
            "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Im91VGQ4cHh4aWJMVEMxR1NRa0Rnc0ZVVi1YYjcwNXQ5eTlHV3dQRWVpVXMifQ.eyJzaWQiOiJjbWR3Z3ZwZTQwMGtqanIwYmo2OTY0NWYyIiwiaXNzIjoicHJpdnkuaW8iLCJpYXQiOjE3NTQyOTA4MTAsImF1ZCI6ImNtYnFjM2lndDAxYTBsMjBsYndqZnNqcDAiLCJzdWIiOiJkaWQ6cHJpdnk6Y21kcGJkb3hrMDBydWw0MGtkOWtuOGY0YyIsImV4cCI6MTc1NDI5NDQxMH0.y1Ly6M42dFYpZ3e7CugBj0PbhwVg1SLAyf8DFyb85-u2lBSs0xzXlG8slELF-ngRQHHCn2O_nAfXCF0f4urK3w",
          walletAddress: "8qAsKnthFS3HXh2k2Ek5Atporqfb6vN424HtLQz897e",
          chainType: "SOLANA",
          codexApiKey: "2e3e54245cf24772804a18f947162884361ad783",
        },
      ];

      const config = {
        [ExchangeName.ONCHAIN]: {
          options: {
            privyAppId: "cmbqc3igt01a0l20lbwjfsjp0",
            privyAppSecret:
              "2yUiHD4fPKeLopzLr5FsdJ2XqH6dhh6yryi1GFBHazu2ZXxVgbro4qJc7tPjxEkU7pkDi4d4bcEo7EjitENMBJUL",
            privyVerificationKey: "i9b1yqllh2sptkqexidfrbfd",
            CodexAPIKey: "2e3e54245cf24772804a18f947162884361ad783",
            LiFiAPIKey: "2e3e54245cf24772804a18f947162884361ad783",
            lifiApiUrl: "https://li.quest/v1",
            codexApiUrl: "https://api.codex.io",
            corsProxy: {
              enabled: true,
              useLocalProxy: true, // Use local Next.js proxy for CORS
            },
          },
        },
        [ExchangeName.POLYMARKET]: {
          options: {
            tickSize: 0.0001,
            minSize: 0.0001,
            maxDecimals: 4,
            corsProxy: {
              enabled: true,
              useLocalProxy: true, // Use local Next.js proxy for CORS
            },
          },
        },
      };

      // Initialize FastTradingApi
      addLog("Initializing FastTradingApi with 5 accounts");
      const apiInstance = new FastTradingApi({ accounts, config });
      setApi(apiInstance);

      // Set up event listeners
      apiInstance.on("log", (msg: string) => addLog(msg, "api"));
      apiInstance.on("error", (msg: string) => addLog(msg, "error"));

      // Start the API
      addLog("Starting FastTradingApi...");
      await apiInstance.start();
      addLog("API started successfully!");

      // Check which exchanges initialized
      const expectedExchanges = [
        ExchangeName.BYBIT,
        ExchangeName.HL,
        ExchangeName.POLYMARKET,
        ExchangeName.ONCHAIN,
      ];
      const initializedExchanges = Object.keys(apiInstance.exchanges);
      addLog(`Initialized exchanges: ${initializedExchanges.join(", ")}`);

      // Wait for markets to load for each exchange
      addLog("Waiting for markets to load...");
      for (const exchangeName of expectedExchanges) {
        updateStatus(exchangeName, "loading", "Loading markets...");

        // Wait up to 30 seconds for markets to load
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
          if (
            apiInstance.store.memory[exchangeName]?.loaded?.markets === true
          ) {
            const marketCount = Object.keys(
              apiInstance.store.memory[exchangeName].public.markets || {},
            ).length;
            updateStatus(
              exchangeName,
              "success",
              `Markets loaded: ${marketCount}`,
            );
            addLog(`${exchangeName}: Loaded ${marketCount} markets`);
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
          attempts++;
        }

        if (!apiInstance.store.memory[exchangeName]?.loaded?.markets) {
          updateStatus(exchangeName, "error", "Failed to load markets");
          addLog(
            `${exchangeName}: Failed to load markets after ${maxAttempts}s`,
          );
        }
      }

      // Wait for tickers to load
      addLog("Waiting for tickers to load...");
      for (const exchangeName of expectedExchanges) {
        updateStatus(exchangeName, "loading", "Loading tickers...");

        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
          if (
            apiInstance.store.memory[exchangeName]?.loaded?.tickers === true
          ) {
            const tickerCount = Object.keys(
              apiInstance.store.memory[exchangeName].public.tickers || {},
            ).length;
            updateStatus(
              exchangeName,
              "success",
              `Tickers loaded: ${tickerCount}`,
            );
            addLog(`${exchangeName}: Loaded ${tickerCount} tickers`);
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
          attempts++;
        }

        if (!apiInstance.store.memory[exchangeName]?.loaded?.tickers) {
          updateStatus(exchangeName, "error", "Failed to load tickers");
          addLog(
            `${exchangeName}: Failed to load tickers after ${maxAttempts}s`,
          );
        }
      }

      // Check positions and orders for each exchange
      addLog("Checking account positions and orders...");
      for (const exchangeName of expectedExchanges) {
        try {
          const exchangeAccounts =
            apiInstance.store.memory[exchangeName]?.accounts || {};
          const accountIds = Object.keys(exchangeAccounts);

          if (accountIds.length > 0) {
            for (const accountId of accountIds) {
              const account = exchangeAccounts[accountId];
              const positions = account?.positions || [];
              const orders = account?.orders || [];

              addLog(
                `${exchangeName} [${accountId}]: ${positions.length} positions, ${orders.length} orders`,
              );
            }
          }
        } catch (error: any) {
          addLog(
            `${exchangeName}: Error checking account data - ${error.message}`,
          );
        }
      }

      // Test fetchOHLCV for each exchange
      addLog("Testing OHLCV (candles) fetch...");
      for (const exchangeName of expectedExchanges) {
        const markets = apiInstance.store.memory[exchangeName].public.markets;
        // get the first market symbol for testing
        const symbol = markets ? Object.keys(markets)[0] : null;
        if (symbol) {
          try {
            updateStatus(
              exchangeName,
              "loading",
              `Fetching OHLCV for ${symbol}...`,
            );

            const candlesOrPair = await apiInstance.fetchOHLCV({
              exchangeName,
              params: {
                symbol,
                timeframe: "1h",
                limit: 10,
                to: Date.now(),
                from: Date.now() - 3600 * 1000,
              },
            });

            // Polymarket returns both legs { yes, no }
            const count =
              (candlesOrPair?.yes?.length || candlesOrPair?.length || 0) +
              (candlesOrPair?.no?.length || 0);

            if (count > 0) {
              updateStatus(
                exchangeName,
                "success",
                `OHLCV fetched: ${count} datapoints (dual if polymarket)`,
              );
              addLog(
                `${exchangeName}: Fetched OHLCV for ${symbol} (${count} points)`,
              );
            } else {
              updateStatus(exchangeName, "error", "No candles returned");
              addLog(`${exchangeName}: No candles returned for ${symbol}`);
            }
          } catch (error: any) {
            updateStatus(
              exchangeName,
              "error",
              `OHLCV error: ${error.message}`,
            );
            addLog(`${exchangeName}: OHLCV error - ${error.message}`);
          }
        } else {
          updateStatus(exchangeName, "error", "No markets available");
          addLog(`${exchangeName}: No markets available for OHLCV fetch`);
        }
      }

      addLog("Integration test completed!");
    } catch (error: any) {
      addLog(`Test failed: ${error.message}`, "error");
      console.error("Integration test error:", error);
    } finally {
      setTestRunning(false);
    }
  };

  const stopTest = async () => {
    if (api) {
      addLog("Stopping FastTradingApi...");
      await api.stop();
      setApi(null);
      addLog("API stopped");
    }
    setTestRunning(false);
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h1>Fast Trading API Integration Test</h1>
        <p>Loading Fast Trading API library...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Fast Trading API Browser Integration Test</h1>

      {/* Configuration Info */}
      <div
        style={{
          background: "white",
          padding: "20px",
          marginBottom: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        <h2>✅ Test Configuration</h2>
        <p>This test is configured with the following accounts:</p>
        <ul>
          <li>
            <strong>Bybit:</strong> account_cmdvkdyhe0002sjm1rxae66rx ✅
          </li>
          <li>
            <strong>Hyperliquid:</strong> account_cmdvkdyhe0000sjm1x6is5pcs ✅
          </li>
          <li>
            <strong>Polymarket:</strong> account_cmdvkdyhe0001sjm14spcr587 ✅
            (MetaMask wallet with funderAddress, CORS proxy enabled)
          </li>
          <li>
            <strong>Onchain (EVM):</strong> 0xE5c93D...676f3 ✅
          </li>
          <li>
            <strong>Onchain (Solana):</strong> 8qAsKn...897e ✅
          </li>
        </ul>
      </div>

      {/* Test Controls */}
      <div
        style={{
          background: "white",
          padding: "20px",
          marginBottom: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        <h2>Test Controls</h2>
        <button
          onClick={runIntegrationTest}
          disabled={testRunning}
          style={{
            backgroundColor: testRunning ? "#ccc" : "#2196f3",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "4px",
            cursor: testRunning ? "not-allowed" : "pointer",
            fontSize: "16px",
            marginRight: "10px",
          }}
        >
          {testRunning ? "Running Test..." : "Start Integration Test"}
        </button>
        <button
          onClick={stopTest}
          disabled={!testRunning}
          style={{
            backgroundColor: !testRunning ? "#ccc" : "#f44336",
            color: "white",
            border: "none",
            padding: "10px 20px",
            borderRadius: "4px",
            cursor: !testRunning ? "not-allowed" : "pointer",
            fontSize: "16px",
          }}
        >
          Stop Test
        </button>

        {/* Dynamic Tracking */}
        <div style={{ marginTop: 20 }}>
          <h3>Add to Tracking</h3>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {/* Onchain token */}
            <OnchainAddToken api={api} addLog={addLog} />
            {/* Polymarket market */}
            <PolymarketAddMarket api={api} addLog={addLog} />
          </div>
        </div>
      </div>

      {/* Exchange Status */}
      <div
        style={{
          background: "white",
          padding: "20px",
          marginBottom: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        <h2>Exchange Status</h2>
        <div>
          {Object.entries(status).map(
            ([exchange, { status: exchangeStatus, details }]) => (
              <div
                key={exchange}
                style={{
                  margin: "10px 0",
                  padding: "15px",
                  borderLeft: `4px solid ${
                    exchangeStatus === "success"
                      ? "#4caf50"
                      : exchangeStatus === "error"
                        ? "#f44336"
                        : "#2196f3"
                  }`,
                  backgroundColor:
                    exchangeStatus === "success"
                      ? "#f1f8f4"
                      : exchangeStatus === "error"
                        ? "#ffebee"
                        : "#e3f2fd",
                }}
              >
                <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
                  {exchange.toUpperCase()}: {exchangeStatus.toUpperCase()}
                </div>
                <div style={{ fontSize: "14px", color: "#666" }}>{details}</div>
              </div>
            ),
          )}
        </div>
      </div>

      {/* Polymarket Dual-Leg Ticker Preview */}
      <div
        style={{
          background: "white",
          padding: "20px",
          marginBottom: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        <h2>Polymarket Dual-Leg Ticker Preview</h2>
        <p>Shows YES/NO legs for the first Polymarket symbol.</p>
        {api &&
          (() => {
            const pm =
              api.store.memory?.[libraryLoader.ExchangeName.POLYMARKET];
            const symbols = pm ? Object.keys(pm.public?.tickers || {}) : [];
            const symbol = symbols[0];
            const t = symbol ? pm.public.tickers[symbol] : null;
            const pmT = t?.polymarket;
            return symbol && pmT ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600 }}>{symbol}</div>
                <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>YES</div>
                    <div>Bid: {pmT.bidYes?.toFixed?.(4) ?? pmT.bidYes}</div>
                    <div>Ask: {pmT.askYes?.toFixed?.(4) ?? pmT.askYes}</div>
                    <div>Last: {pmT.lastYes?.toFixed?.(4) ?? pmT.lastYes}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>NO</div>
                    <div>Bid: {pmT.bidNo?.toFixed?.(4) ?? pmT.bidNo}</div>
                    <div>Ask: {pmT.askNo?.toFixed?.(4) ?? pmT.askNo}</div>
                    <div>Last: {pmT.lastNo?.toFixed?.(4) ?? pmT.lastNo}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ color: "#666" }}>
                Waiting for Polymarket tickers…
              </div>
            );
          })()}
      </div>

      {/* Logs */}
      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        <h2>Logs</h2>
        <div
          style={{
            maxHeight: "400px",
            overflowY: "auto",
            background: "#f4f4f4",
            padding: "10px",
            borderRadius: "4px",
            fontFamily: "monospace",
            fontSize: "12px",
            whiteSpace: "pre-wrap",
          }}
        >
          {logs.join("\n")}
        </div>
      </div>
    </div>
  );
}
