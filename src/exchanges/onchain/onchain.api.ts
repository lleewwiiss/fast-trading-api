import type {
  OnchainCredentials,
  OnchainInitializationParams,
} from "./onchain.types";

import type { Account } from "~/types/lib.types";
import { request } from "~/utils/request.utils";
import { getApiUrl, isUsingLocalProxy } from "~/utils/cors-proxy.utils";

export class OnchainApi {
  private credentials: OnchainCredentials;
  private initialized: boolean = false;
  private config: any;

  constructor(account: Account, config: any) {
    this.config = config;
    this.credentials = this.extractCredentials(account);
  }

  private extractCredentials(account: Account): OnchainCredentials {
    if (account.exchange !== "onchain") {
      throw new Error("Invalid exchange type for OnchainApi");
    }

    if (!account.identityToken) {
      throw new Error("Identity token is required for onchain exchange");
    }

    if (!account.walletAddress) {
      throw new Error("Wallet address is required for onchain exchange");
    }

    if (!account.chainType) {
      throw new Error("Chain type is required for onchain exchange");
    }

    if (!account.codexApiKey) {
      throw new Error("Codex API key is required for onchain exchange");
    }

    return {
      identityToken: account.identityToken,
      walletAddress: account.walletAddress,
      chainType: account.chainType,
      codexApiKey: account.codexApiKey,
      evmRpcUrl: account.evmRpcUrl || this.config.options?.defaultRpcUrls?.evm,
      solRpcUrl: account.solRpcUrl || this.config.options?.defaultRpcUrls?.sol,
    };
  }

  async initialize(params?: OnchainInitializationParams): Promise<void> {
    if (this.initialized) {
      return;
    }

    const finalCredentials = params?.credentials || this.credentials;

    if (!this.validateCredentials(finalCredentials)) {
      throw new Error(
        "Invalid credentials provided for onchain exchange initialization",
      );
    }

    this.credentials = finalCredentials;

    await this.validateConnections();

    this.initialized = true;
  }

  private validateCredentials(credentials: OnchainCredentials): boolean {
    return !!(
      credentials.identityToken &&
      credentials.walletAddress &&
      credentials.chainType &&
      credentials.codexApiKey &&
      credentials.evmRpcUrl &&
      credentials.solRpcUrl
    );
  }

  private async validateConnections(): Promise<void> {
    try {
      // Add timeout to prevent hanging during initialization
      const timeout = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Connection validation timeout after 30s")),
          30000,
        ),
      );

      await Promise.race([
        Promise.all([
          this.testLifiConnection(),
          this.testCodexConnection(),
          this.testRpcConnections(),
        ]),
        timeout,
      ]);
    } catch (error) {
      throw new Error(
        `Failed to validate connections: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private async testLifiConnection(): Promise<void> {
    const originalUrl = `${this.config.options?.lifiApiUrl}/status`;
    const response = await request({
      url: getApiUrl(originalUrl, this.config),
      method: "GET",
      headers: {},
      ...(isUsingLocalProxy(this.config) ? { originalUrl } : {}),
    });

    if (!response) {
      throw new Error(`LiFi API connection failed`);
    }
  }

  private async testCodexConnection(): Promise<void> {
    const response = await fetch(`${this.config.options?.codexApiUrl}/health`, {
      headers: {
        Authorization: `Bearer ${this.credentials.codexApiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Codex API connection failed: ${response.status}`);
    }
  }

  private async testRpcConnections(): Promise<void> {
    const [solResponse, evmResponse] = await Promise.all([
      fetch(this.credentials.solRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      }),
      fetch(this.credentials.evmRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId" }),
      }),
    ]);

    if (!solResponse.ok) {
      throw new Error(`Solana RPC connection failed: ${solResponse.status}`);
    }

    if (!evmResponse.ok) {
      throw new Error(`EVM RPC connection failed: ${evmResponse.status}`);
    }
  }

  getCredentials(): OnchainCredentials {
    return { ...this.credentials };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async request(
    method: string,
    endpoint: string,
    params?: any,
    useCodex: boolean = false,
  ): Promise<any> {
    if (!this.initialized) {
      throw new Error("OnchainApi must be initialized before making requests");
    }

    const baseUrl = useCodex
      ? this.config.options?.codexApiUrl
      : this.config.options?.lifiApiUrl;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (useCodex) {
      headers["Authorization"] = `Bearer ${this.credentials.codexApiKey}`;
    }

    const originalUrl = `${baseUrl}${endpoint}`;

    // Only use CORS proxy for LiFi requests, not Codex
    const shouldUseProxy = !useCodex && isUsingLocalProxy(this.config);

    const requestOptions: any = {
      url: shouldUseProxy ? getApiUrl(originalUrl, this.config) : originalUrl,
      method: method as "GET" | "POST" | "DELETE",
      headers,
      ...(shouldUseProxy ? { originalUrl } : {}),
    };

    if (params && (method === "POST" || method === "PUT")) {
      requestOptions.body = params;
    } else if (params && method === "GET") {
      requestOptions.params = params;
    }

    return await request(requestOptions);
  }
}
