import {
  type ChainType,
  createConfig,
  EVM,
  type ExtendedChain,
  Solana,
} from "@lifi/sdk";
import { Codex } from "@codex-data/sdk";
import {
  createPublicClient,
  http,
  type Address,
  type Hash,
  type TransactionRequest,
} from "viem";
import { mainnet, bsc, polygon, arbitrum, base } from "viem/chains";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import {
  PumpSdk,
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
} from "@pump-fun/pump-sdk";
import { PumpAmmSdk } from "@pump-fun/pump-swap-sdk";
import { Raydium } from "@raydium-io/raydium-sdk-v2";

import { BaseWorker } from "../base.worker";

import { OnchainWsPublic } from "./onchain.ws-public";
import { OnchainWsPrivate } from "./onchain.ws-private";
import { PrivySessionSigner } from "./privy-session-signer";
import {
  fetchOnchainBalances,
  fetchOnchainPositions,
  fetchOnchainOHLCV,
  fetchTokenData,
  fetchOnchainMarketsTickers,
} from "./onchain.resolver";
import type {
  FetchOHLCVOnchainParams,
  PrivySessionConfig,
} from "./onchain.types";

import {
  type Account,
  type ExchangeConfig,
  ExchangeName,
  OrderSide,
  OrderType,
  type PlaceOrderOpts,
  type PlacePositionStopOpts,
  type Position,
  type Timeframe,
  type UpdateOrderOpts,
} from "~/types/lib.types";
import { DEFAULT_CONFIG } from "~/config";

export class OnchainWorker extends BaseWorker {
  publicWs: OnchainWsPublic | null = null;
  privateWs: Record<Account["id"], OnchainWsPrivate> = {};
  codexSdk: Codex | null = null;
  lifiChains: ExtendedChain[] = [];

  // Privy session management
  private privySessionSigner: PrivySessionSigner;
  private sessionConfigs: Map<string, PrivySessionConfig> = new Map();

  // EVM clients for different chains (removed wallet clients)
  evmClients: Record<string, { public: any }> = {};

  // Solana connection (removed keypair storage)
  solanaConnection: Connection | null = null;

  // DEX SDK instances
  pumpSdk: PumpSdk | null = null;
  pumpAmmSdk: PumpAmmSdk | null = null;
  raydiumSdk: Raydium | null = null;

  // Transaction tracking
  pendingTransactions: Map<
    string,
    {
      id: string;
      chainType: "EVM" | "SOL";
      hash?: string;
      status: "pending" | "confirmed" | "failed";
      timestamp: number;
      retryCount: number;
    }
  > = new Map();

  // Stop loss monitoring
  stopLossMonitors: Map<
    string,
    {
      positionId: string;
      tokenAddress: string;
      chainType: "EVM" | "SOL";
      stopPrice: number;
      size: number;
      accountId: string;
      triggerCondition: "below" | "above";
      isActive: boolean;
      createdAt: number;
    }
  > = new Map();

  private priceMonitoringInterval: NodeJS.Timeout | null = null;

  // Performance caching
  private routeCache: Map<
    string,
    {
      route: any;
      timestamp: number;
    }
  > = new Map();

  private gasEstimateCache: Map<
    string,
    {
      estimate: bigint;
      timestamp: number;
    }
  > = new Map();

  // Chain configurations
  private readonly SUPPORTED_EVM_CHAINS = {
    ethereum: { chain: mainnet, chainId: 1 },
    bsc: { chain: bsc, chainId: 56 },
    polygon: { chain: polygon, chainId: 137 },
    arbitrum: { chain: arbitrum, chainId: 42161 },
    base: { chain: base, chainId: 8453 },
  };

  constructor({
    parent,
    config,
    name,
  }: {
    parent: typeof self;
    config: ExchangeConfig;
    name: ExchangeName;
  }) {
    super({ parent, config, name });
    this.privySessionSigner = new PrivySessionSigner(config?.options);
  }

  async start({
    accounts,
    config,
    requestId,
  }: {
    accounts: Account[];
    config: ExchangeConfig;
    requestId: string;
  }) {
    await super.start({ accounts, config, requestId });

    if (
      !this.config.options ||
      !this.config.options["CodexAPIKey"] ||
      !this.config.options["LiFiAPIKey"]
    ) {
      this.error(
        "CodexAPIKey and LiFiAPIKey must be provided in the exchange config options",
      );
      return;
    }

    createConfig({
      integrator: "tenz",
      providers: [EVM(), Solana()],
      preloadChains: false,
      apiKey: this.config.options["LiFiAPIKey"],
    });

    this.codexSdk = new Codex(this.config.options["CodexAPIKey"]);

    // Initialize EVM clients for all supported chains
    await this.initializeEvmClients(accounts);

    // Initialize Solana connection and keypair
    await this.initializeSolanaConnection(accounts);

    // Initialize Pump.fun SDKs
    await this.initializePumpSDKs();

    // Initialize Raydium SDK
    await this.initializeRaydiumSDK();

    await super.start({ accounts, requestId, config });
    await this.fetchPublic();

    // Start transaction monitoring
    this.startTransactionMonitoring();

    this.emitResponse({ requestId });
  }

  private async initializeEvmClients(accounts: Account[]) {
    const evmAccounts = accounts.filter(
      (account) => account.identityToken && account.chainType === "EVM",
    );

    for (const evmAccount of evmAccounts) {
      // Verify identity token
      const verification = await this.privySessionSigner.verifyIdentityToken(
        evmAccount.identityToken!,
      );

      if (!verification.isValid) {
        this.error(`Invalid identity token for EVM account ${evmAccount.id}`);
        continue;
      }

      // Store session config
      this.sessionConfigs.set(evmAccount.id, {
        identityToken: evmAccount.identityToken!,
        walletAddress: verification.walletAddress,
        chainType: "EVM",
        expiresAt: verification.expiresAt,
      });

      // Initialize public clients only (no wallet clients with private keys)
      for (const [chainKey, chainConfig] of Object.entries(
        this.SUPPORTED_EVM_CHAINS,
      )) {
        const rpcUrl = evmAccount.evmRpcUrl || this.getDefaultRpcUrl(chainKey);

        if (!rpcUrl) continue;

        try {
          const publicClient = createPublicClient({
            chain: chainConfig.chain,
            transport: http(rpcUrl),
          });

          this.evmClients[chainKey] = { public: publicClient };
          this.log(`Initialized EVM public client for ${chainKey}`);
        } catch (error) {
          this.error(
            `Failed to initialize EVM client for ${chainKey}: ${error}`,
          );
        }
      }
    }
  }

  private getDefaultRpcUrl(chainKey: string): string | null {
    const defaultRpcs: Record<string, string> = {
      ethereum: "https://eth-mainnet.g.alchemy.com/v2/demo",
      bsc: "https://bsc-dataseed.binance.org",
      polygon: "https://polygon-rpc.com",
      arbitrum: "https://arb1.arbitrum.io/rpc",
      base: "https://mainnet.base.org",
    };
    return defaultRpcs[chainKey] || null;
  }

  private async initializeSolanaConnection(accounts: Account[]) {
    const solanaAccounts = accounts.filter(
      (account) => account.identityToken && account.chainType === "SOLANA",
    );

    for (const solanaAccount of solanaAccounts) {
      // Verify identity token
      const verification = await this.privySessionSigner.verifyIdentityToken(
        solanaAccount.identityToken!,
      );

      if (!verification.isValid) {
        this.error(
          `Invalid identity token for Solana account ${solanaAccount.id}`,
        );
        continue;
      }

      // Store session config
      this.sessionConfigs.set(solanaAccount.id, {
        identityToken: solanaAccount.identityToken!,
        walletAddress: verification.walletAddress,
        chainType: "SOLANA",
        expiresAt: verification.expiresAt,
      });

      // Initialize connection only (no keypair storage)
      const rpcUrl = solanaAccount.solRpcUrl || this.getDefaultSolanaRpcUrl();

      try {
        this.solanaConnection = new Connection(rpcUrl, "confirmed");
        this.log(
          `Initialized Solana connection for ${verification.walletAddress}`,
        );

        // Test connection
        const publicKey = new PublicKey(verification.walletAddress);
        const balance = await this.solanaConnection.getBalance(publicKey);
        this.log(`Solana wallet balance: ${balance / 1e9} SOL`);
      } catch (error) {
        this.error(`Failed to initialize Solana connection: ${error}`);
      }
    }
  }

  private getDefaultSolanaRpcUrl(): string {
    // Use Helius as default (from sol-trading.ts)
    return "https://mainnet.helius-rpc.com/?api-key=f1653e0c-4ca3-46c6-a90e-d0a12ca8f22a";
  }

  private async initializePumpSDKs() {
    if (!this.solanaConnection) {
      this.log(
        "No Solana connection available, skipping Pump.fun SDK initialization",
      );
      return;
    }

    try {
      // Initialize PumpSdk
      this.pumpSdk = new PumpSdk(this.solanaConnection);
      this.log("Initialized PumpSdk");

      // Initialize PumpAmmSdk
      this.pumpAmmSdk = new PumpAmmSdk(this.solanaConnection);
      this.log("Initialized PumpAmmSdk");

      this.log("Successfully initialized all Pump.fun SDKs");
    } catch (error) {
      this.error(`Failed to initialize Pump.fun SDKs: ${error}`);
      this.pumpSdk = null;
      this.pumpAmmSdk = null;
    }
  }

  private async initializeRaydiumSDK() {
    if (!this.solanaConnection) {
      this.log(
        "No Solana connection available, skipping Raydium SDK initialization",
      );
      return;
    }

    // Get the first Solana session config
    const solanaSession = Array.from(this.sessionConfigs.values()).find(
      (config) => config.chainType === "SOLANA",
    );

    if (!solanaSession) {
      this.log("No Solana session found, skipping Raydium SDK initialization");
      return;
    }

    try {
      // Initialize Raydium SDK with public key from session
      const owner = new PublicKey(solanaSession.walletAddress);
      this.raydiumSdk = await Raydium.load({
        owner,
        connection: this.solanaConnection,
        cluster: "mainnet",
        disableFeatureCheck: true,
        disableLoadToken: true,
        blockhashCommitment: "confirmed",
      });

      this.log("Initialized Raydium SDK");
    } catch (error) {
      this.error(`Failed to initialize Raydium SDK: ${error}`);
      this.raydiumSdk = null;
    }
  }

  // =====================================================================================
  // EVM TRADING UTILITIES (Tasks 7-9)
  // =====================================================================================

  private getEvmClient(chainId: number) {
    const chainKey = Object.keys(this.SUPPORTED_EVM_CHAINS).find(
      (key) =>
        this.SUPPORTED_EVM_CHAINS[key as keyof typeof this.SUPPORTED_EVM_CHAINS]
          .chainId === chainId,
    ) as keyof typeof this.SUPPORTED_EVM_CHAINS;

    if (!chainKey || !this.evmClients[chainKey]) {
      throw new Error(`No EVM client configured for chain ID: ${chainId}`);
    }

    return this.evmClients[chainKey];
  }

  private getClientKeyForChainId(chainId: number): string {
    const chainKey = Object.keys(this.SUPPORTED_EVM_CHAINS).find(
      (key) =>
        this.SUPPORTED_EVM_CHAINS[key as keyof typeof this.SUPPORTED_EVM_CHAINS]
          .chainId === chainId,
    );

    if (!chainKey) {
      throw new Error(`No chain key found for chain ID: ${chainId}`);
    }

    return chainKey;
  }

  private getTokenDecimals(tokenAddress: Address, _chainId: number): number {
    // Common stablecoins use 6 decimals
    const sixDecimalTokens = [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase(), // USDC on Ethereum
      "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174".toLowerCase(), // USDC on Polygon
      "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d".toLowerCase(), // USDC on BSC
    ];

    if (sixDecimalTokens.includes(tokenAddress.toLowerCase())) {
      return 6;
    }

    // Default to 18 decimals for most tokens
    return 18;
  }

  private async buildLiFiEvmSwap(
    accountId: string,
    fromChainId: number,
    toChainId: number,
    fromTokenAddress: Address,
    toTokenAddress: Address,
    amountIn: string,
    slippageBps: number = 100,
    feeRecipient?: Address,
  ): Promise<{
    transactionRequest: TransactionRequest;
    estimatedGas: bigint;
    route: any;
  }> {
    const { getRoutes, getStepTransaction } = await import("@lifi/sdk");

    // Convert amount to smallest units
    const isFromTokenNative =
      fromTokenAddress === "0x0000000000000000000000000000000000000000";

    let fromAmount: string;
    if (isFromTokenNative) {
      const { parseEther } = await import("viem");
      fromAmount = parseEther(amountIn).toString();
    } else {
      const decimals = this.getTokenDecimals(fromTokenAddress, fromChainId);
      fromAmount = Math.floor(
        parseFloat(amountIn) * Math.pow(10, decimals),
      ).toString();
    }

    // Get session config for this account
    const sessionConfig = this.sessionConfigs.get(accountId);
    if (!sessionConfig || sessionConfig.chainType !== "EVM") {
      throw new Error(`No valid EVM session for account ${accountId}`);
    }

    const walletAddress = sessionConfig.walletAddress;

    // Request route from LiFi
    const routesRequest = {
      fromChainId,
      toChainId,
      fromTokenAddress,
      toTokenAddress,
      fromAmount,
      fromAddress: walletAddress,
      toAddress: walletAddress,
      options: {
        order: "FASTEST" as const,
        slippage: slippageBps / 10000,
        integrator: "tenz",
        fee: 0.01,
        referrer: feeRecipient || "0xC7B71D7A9B89d524153d8bEF2B2485DA07353AB4",
      },
    };

    const routesResponse = await getRoutes(routesRequest);

    if (!routesResponse?.routes?.length) {
      throw new Error("No LiFi routes found for this EVM swap");
    }

    const route = routesResponse.routes[0];
    const step = route.steps[0];
    const stepTransaction = await getStepTransaction(step);

    if (!stepTransaction?.transactionRequest) {
      throw new Error("Failed to get transaction data from LiFi");
    }

    const txRequest = stepTransaction.transactionRequest;
    const transactionRequest: TransactionRequest = {
      to: txRequest.to as Address,
      data: txRequest.data as `0x${string}`,
      value: txRequest.value ? BigInt(txRequest.value) : 0n,
      gas: txRequest.gasLimit ? BigInt(txRequest.gasLimit) : undefined,
      ...(txRequest.maxFeePerGas
        ? {
            maxFeePerGas: BigInt(txRequest.maxFeePerGas),
            maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas
              ? BigInt(txRequest.maxPriorityFeePerGas)
              : undefined,
          }
        : txRequest.gasPrice
          ? { gasPrice: BigInt(txRequest.gasPrice) }
          : {}),
      nonce: txRequest.nonce ? Number(txRequest.nonce) : undefined,
    };

    const client = this.getEvmClient(fromChainId);

    // Estimate gas if not provided
    let estimatedGas: bigint;
    if (transactionRequest.gas) {
      estimatedGas = transactionRequest.gas;
    } else {
      estimatedGas = await client.public.estimateGas({
        account: walletAddress as Address,
        to: transactionRequest.to!,
        data: transactionRequest.data,
        value: transactionRequest.value,
      });
      transactionRequest.gas = estimatedGas;
    }

    return {
      transactionRequest,
      estimatedGas,
      route,
    };
  }

  private async submitEvmTransaction(
    accountId: string,
    chainId: number,
    transactionRequest: TransactionRequest,
  ): Promise<Hash> {
    // Get session config for this account
    const sessionConfig = this.sessionConfigs.get(accountId);
    if (!sessionConfig || sessionConfig.chainType !== "EVM") {
      throw new Error(`No valid EVM session for account ${accountId}`);
    }

    // Validate session is still active
    const isValid = await this.privySessionSigner.validateSession(
      sessionConfig.identityToken,
    );
    if (!isValid) {
      throw new Error(`Session expired for account ${accountId}`);
    }

    // Sign transaction using Privy session signer
    const signature = await this.privySessionSigner.signEvmTransaction(
      sessionConfig.identityToken,
      sessionConfig.walletAddress,
      transactionRequest,
    );

    // Submit signed transaction
    const clientKey = this.getClientKeyForChainId(chainId);
    const client = this.evmClients[clientKey];

    const hash = await client.public.sendRawTransaction({
      serializedTransaction: signature as `0x${string}`,
    });

    // Wait for confirmation
    const receipt = await client.public.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      this.log(
        `EVM transaction confirmed in block ${receipt.blockNumber}: ${hash}`,
      );
    } else {
      throw new Error(`EVM transaction failed: ${hash}`);
    }

    return hash;
  }

  // =====================================================================================
  // SOLANA TRADING UTILITIES (Tasks 10-13)
  // =====================================================================================

  // Fee calculation helpers
  private calculateFeeForSolToToken(solAmountIn: number): number {
    return Math.floor(solAmountIn * 1e9 * 0.01); // 1% fee in lamports
  }

  // Temporal submission constants
  private readonly TEMPORAL_TIP_ACCOUNT = new PublicKey(
    "TEMPaMeCRFAS9EKF53Jd6KpHxgL47uWLcpFArU1Fanq",
  );
  private readonly FEE_RECIPIENT_ACCOUNT = new PublicKey(
    "6EiuU4acvEPq8xeAmhAQGL6FTa9VHcEsMGjzfWXgEsjz",
  );

  private async getDynamicTipAmount(): Promise<number> {
    try {
      const response = await fetch(
        "https://bundles.jito.wtf/api/v1/bundles/tip_floor",
      );
      const data = await response.json();

      if (data?.[0]?.landed_tips_75th_percentile) {
        const tip75th = data[0].landed_tips_75th_percentile;
        return Math.max(tip75th, 0.001) * 1e9; // Convert to lamports
      }

      return 0.001 * 1e9; // Fallback
    } catch (error) {
      this.error(`Failed to fetch dynamic tip amount: ${error}`);
      return 0.001 * 1e9;
    }
  }

  private async getPriorityFeeForTransaction(
    transaction: any,
  ): Promise<number> {
    if (!this.solanaConnection) {
      return 100000; // Default fallback
    }

    try {
      // Serialize the transaction
      const serializedTx = transaction.serialize();
      const base64Tx = Buffer.from(serializedTx).toString("base64");

      const response = await fetch(this.solanaConnection.rpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "getPriorityFeeEstimate",
          params: [
            {
              transaction: base64Tx,
              options: { recommended: true },
            },
          ],
        }),
      });

      const data = await response.json();
      let fee = data.result?.priorityFeeEstimate || 100000;

      // Add 20% safety buffer
      fee = Math.floor(fee * 1.2);
      return Math.max(fee, 100000);
    } catch (error) {
      this.error(`Failed to fetch priority fee: ${error}`);
      return 100000;
    }
  }

  private async submitToTemporal(
    transaction: VersionedTransaction,
  ): Promise<string> {
    if (!this.solanaConnection) {
      throw new Error("No Solana connection available");
    }

    const serializedTx = transaction.serialize();
    const base64Tx = Buffer.from(serializedTx).toString("base64");

    // Use Temporal endpoint from sol-trading.ts
    const TEMPORAL_ENDPOINT =
      "http://nozomi-preview-pit.temporal.xyz/?c=1f3e1865-a247-4146-aab8-3e7db1e828cc";

    const response = await fetch(TEMPORAL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [
          base64Tx,
          { skipPreflight: true, maxRetries: 0, encoding: "base64" },
        ],
      }),
    });

    const result = await response.json();
    if (result.error) {
      throw new Error(`Temporal submission error: ${result.error.message}`);
    }

    return result.result;
  }

  private async pollForConfirmation(signature: string): Promise<any> {
    if (!this.solanaConnection) {
      throw new Error("No Solana connection available");
    }

    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < 30000) {
      attempts++;

      try {
        const statuses = await this.solanaConnection.getSignatureStatuses([
          signature,
        ]);
        const status = statuses.value[0];

        if (
          status &&
          (status.confirmationStatus === "confirmed" ||
            status.confirmationStatus === "finalized")
        ) {
          if (status.err) {
            throw new Error(
              `Transaction failed on-chain: ${JSON.stringify(status.err)}`,
            );
          }
          return status;
        }
      } catch (error) {
        this.error(`Error checking status: ${error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error(
      `Confirmation timed out for ${signature} after ${attempts} attempts`,
    );
  }

  private async globalSubmit(
    accountId: string,
    instructions: TransactionInstruction[],
    feeAmountLamports: number,
    options: {
      lookupTable?: AddressLookupTableAccount[];
      maxTipLamports?: number;
    } = {},
  ): Promise<string> {
    // Get session config
    const sessionConfig = this.sessionConfigs.get(accountId);
    if (!sessionConfig || sessionConfig.chainType !== "SOLANA") {
      throw new Error(`No valid Solana session for account ${accountId}`);
    }

    // Validate session
    const isValid = await this.privySessionSigner.validateSession(
      sessionConfig.identityToken,
    );
    if (!isValid) {
      throw new Error(`Session expired for account ${accountId}`);
    }

    if (!this.solanaConnection) {
      throw new Error("Solana connection not available");
    }

    const { lookupTable, maxTipLamports } = options;

    // Validate no compute budget instructions
    const hasComputeBudget = instructions.some((ix) =>
      ix.programId.equals(ComputeBudgetProgram.programId),
    );
    if (hasComputeBudget) {
      throw new Error(
        "Do not include compute budget instructions - they are added automatically",
      );
    }

    const allInstructions = [...instructions];

    // Build transaction (existing logic)
    const userPublicKey = new PublicKey(sessionConfig.walletAddress);

    // Add 1% fee
    allInstructions.push(
      SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: this.FEE_RECIPIENT_ACCOUNT,
        lamports: feeAmountLamports,
      }),
    );

    // Get dynamic tip amount
    const dynamicTipAmount = await this.getDynamicTipAmount();
    const tipAmount = maxTipLamports
      ? Math.min(dynamicTipAmount, maxTipLamports)
      : dynamicTipAmount;

    // Add Temporal tip
    allInstructions.push(
      SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: this.TEMPORAL_TIP_ACCOUNT,
        lamports: tipAmount,
      }),
    );

    // Get recent blockhash
    const { value: blockhashInfo } =
      await this.solanaConnection.getLatestBlockhashAndContext("confirmed");
    const { blockhash } = blockhashInfo;

    // Simulate transaction
    const testInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ...allInstructions,
    ];

    const testTransaction = new VersionedTransaction(
      new TransactionMessage({
        instructions: testInstructions,
        payerKey: userPublicKey,
        recentBlockhash: blockhash,
      }).compileToV0Message(lookupTable),
    );
    // Transaction will be signed by Privy later

    const simulation = await this.solanaConnection.simulateTransaction(
      testTransaction,
      {
        replaceRecentBlockhash: true,
        sigVerify: false,
      },
    );

    if (simulation.value.err) {
      throw new Error(
        `Simulation failed: ${JSON.stringify(simulation.value.err)}`,
      );
    }

    if (!simulation.value.unitsConsumed) {
      throw new Error("Simulation failed to return compute units");
    }

    // Set compute units with margin
    const units = simulation.value.unitsConsumed;
    const computeUnits = units < 1000 ? 1000 : Math.ceil(units * 1.1);

    // Get priority fee
    const priorityFee =
      await this.getPriorityFeeForTransaction(testTransaction);

    // Add compute budget instructions
    allInstructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
    );

    // Build final transaction
    const compiledMessage = new TransactionMessage({
      instructions: allInstructions,
      payerKey: userPublicKey,
      recentBlockhash: blockhash,
    }).compileToV0Message(lookupTable);

    const transaction = new VersionedTransaction(compiledMessage);

    // Sign transaction using Privy session signer
    const signedTransactionHex =
      await this.privySessionSigner.signSolanaTransaction(
        sessionConfig.identityToken,
        sessionConfig.walletAddress,
        transaction,
      );

    // Create signed transaction from hex
    const signedTransaction = VersionedTransaction.deserialize(
      Buffer.from(signedTransactionHex, "hex"),
    );

    // Submit transaction
    const signature = await this.submitToTemporal(signedTransaction);

    // Poll for confirmation
    await this.pollForConfirmation(signature);

    return signature;
  }

  private async buildLiFiSwapInstructions(
    accountId: string,
    inputMint: PublicKey,
    outputMint: PublicKey,
    amountIn: number,
    slippageBps: number,
  ): Promise<{
    instructions: TransactionInstruction[];
    lookupTable?: AddressLookupTableAccount[];
    feeAmountLamports: number;
  }> {
    const sessionConfig = this.sessionConfigs.get(accountId);
    if (!sessionConfig || sessionConfig.chainType !== "SOLANA") {
      throw new Error(`No valid Solana session for account ${accountId}`);
    }

    if (!this.solanaConnection) {
      throw new Error("Solana connection not available");
    }

    const { getRoutes, getStepTransaction } = await import("@lifi/sdk");

    const isInputSol = inputMint.equals(NATIVE_MINT);

    // Convert to LiFi format
    const fromChainId = 1151111081099710; // Solana chain ID
    const toChainId = 1151111081099710;
    const fromToken = inputMint.toBase58();
    const toToken = outputMint.toBase58();
    const fromAmount = (
      amountIn * (isInputSol ? LAMPORTS_PER_SOL : Math.pow(10, 6))
    ).toString();

    const userPublicKey = new PublicKey(sessionConfig.walletAddress);

    const routesRequest = {
      fromChainId,
      toChainId,
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      fromAmount,
      fromAddress: userPublicKey.toBase58(),
      toAddress: userPublicKey.toBase58(),
      options: {
        order: "FASTEST" as const,
        slippage: slippageBps / 10000,
      },
    };

    const routesResponse = await getRoutes(routesRequest);

    if (!routesResponse?.routes?.length) {
      throw new Error("No LiFi routes found for this swap");
    }

    const route = routesResponse.routes[0];
    const step = route.steps[0];
    const stepTransaction = await getStepTransaction(step);

    if (!stepTransaction?.transactionRequest) {
      throw new Error("Failed to get transaction data from LiFi");
    }

    const transactionData = stepTransaction.transactionRequest.data;
    if (!transactionData) {
      throw new Error("No transaction data found in LiFi response");
    }

    // Decode the transaction
    const transactionBuffer = Buffer.from(transactionData, "base64");
    const transaction = VersionedTransaction.deserialize(transactionBuffer);

    const instructions: TransactionInstruction[] = [];
    const lookupTableAccounts: AddressLookupTableAccount[] = [];

    // Resolve lookup tables
    if (transaction.message.addressTableLookups.length > 0) {
      for (const lookup of transaction.message.addressTableLookups) {
        const lookupTableAccount =
          await this.solanaConnection.getAddressLookupTable(lookup.accountKey);
        if (lookupTableAccount?.value) {
          lookupTableAccounts.push(lookupTableAccount.value);
        }
      }
    }

    // Get account keys
    const accountKeys = transaction.message.getAccountKeys({
      addressLookupTableAccounts: lookupTableAccounts,
    });

    // Convert compiled instructions
    for (const compiledIx of transaction.message.compiledInstructions) {
      const programId = accountKeys.get(compiledIx.programIdIndex);
      if (!programId || programId.equals(ComputeBudgetProgram.programId)) {
        continue; // Skip compute budget instructions
      }

      const keys = compiledIx.accountKeyIndexes.map((index) => {
        const pubkey = accountKeys.get(index);
        if (!pubkey) {
          throw new Error(`Account key at index ${index} is undefined`);
        }

        return {
          pubkey,
          isSigner: transaction.message.isAccountSigner(index),
          isWritable: transaction.message.isAccountWritable(index),
        };
      });

      instructions.push(
        new TransactionInstruction({
          programId,
          keys,
          data: Buffer.from(compiledIx.data),
        }),
      );
    }

    // Calculate fee
    let feeAmountLamports: number;
    if (isInputSol) {
      feeAmountLamports = this.calculateFeeForSolToToken(amountIn);
    } else {
      feeAmountLamports = Math.floor(0.001 * LAMPORTS_PER_SOL); // Minimum fee
    }

    return {
      instructions,
      lookupTable:
        lookupTableAccounts.length > 0 ? lookupTableAccounts : undefined,
      feeAmountLamports,
    };
  }

  private async buildPumpSwapInstructions(
    accountId: string,
    inputMint: PublicKey,
    outputMint: PublicKey,
    amountIn: number,
    slippageBps: number,
  ): Promise<{
    instructions: TransactionInstruction[];
    lookupTable?: AddressLookupTableAccount[];
    feeAmountLamports: number;
  }> {
    if (!this.solanaConnection || !this.pumpSdk || !this.pumpAmmSdk) {
      throw new Error("Pump SDKs not available");
    }

    // Get session config for this account
    const sessionConfig = this.sessionConfigs.get(accountId);
    if (!sessionConfig || sessionConfig.chainType !== "SOLANA") {
      throw new Error(`No valid Solana session for account ${accountId}`);
    }

    const userPublicKey = new PublicKey(sessionConfig.walletAddress);

    const isInputSol = inputMint.equals(NATIVE_MINT);
    const isOutputSol = outputMint.equals(NATIVE_MINT);

    // Validate SOL <-> TOKEN swap
    if (!isInputSol && !isOutputSol) {
      throw new Error("Pump ecosystem only supports SOL <-> TOKEN swaps");
    }

    const pumpToken = isInputSol ? outputMint : inputMint;
    const instructions: TransactionInstruction[] = [];
    let feeAmountLamports: number;

    // Check if token is on bonding curve or migrated
    const bondingCurve = await this.pumpSdk.fetchBondingCurve(pumpToken);
    const isBonded = !bondingCurve.complete;

    if (isBonded) {
      // Token is on bonding curve - use standard pump
      const global = await this.pumpSdk.fetchGlobal();

      if (isInputSol) {
        // SOL -> TOKEN (buy)
        const solAmountBN = new BN(Math.floor(amountIn * LAMPORTS_PER_SOL));
        const tokenAmountOut = getBuyTokenAmountFromSolAmount(
          global,
          bondingCurve,
          solAmountBN,
        );

        const { bondingCurveAccountInfo, associatedUserAccountInfo } =
          await this.pumpSdk.fetchBuyState(pumpToken, userPublicKey);

        const buyInstructions = await this.pumpSdk.buyInstructions({
          global,
          bondingCurveAccountInfo,
          bondingCurve,
          associatedUserAccountInfo,
          mint: pumpToken,
          user: userPublicKey,
          amount: tokenAmountOut,
          solAmount: solAmountBN,
          slippage: slippageBps / 10000,
        });

        instructions.push(...buyInstructions);
        feeAmountLamports = this.calculateFeeForSolToToken(amountIn);
      } else {
        // TOKEN -> SOL (sell)
        const tokenAmountIn = new BN(amountIn * Math.pow(10, 6)); // 6 decimals
        const expectedSolOut = getSellSolAmountFromTokenAmount(
          global,
          bondingCurve,
          tokenAmountIn,
        );

        const { bondingCurveAccountInfo } = await this.pumpSdk.fetchSellState(
          pumpToken,
          userPublicKey,
        );

        const sellInstructions = await this.pumpSdk.sellInstructions({
          global,
          bondingCurveAccountInfo,
          bondingCurve,
          mint: pumpToken,
          user: userPublicKey,
          amount: tokenAmountIn,
          solAmount: expectedSolOut,
          slippage: slippageBps / 10000,
        });

        instructions.push(...sellInstructions);
        feeAmountLamports = Math.floor(expectedSolOut.toNumber() * 0.01);
      }
    } else {
      // Token has migrated to AMM - use pump AMM
      const [canonicalPoolPda] = this.pumpSdk.canonicalPumpPoolPda(pumpToken);

      try {
        await this.pumpAmmSdk.fetchPool(canonicalPoolPda);
        const swapState = await this.pumpAmmSdk.swapSolanaState(
          canonicalPoolPda,
          userPublicKey,
        );

        if (isInputSol) {
          // SOL -> TOKEN (buy on AMM)
          const quoteAmountBN = new BN(Math.floor(amountIn * LAMPORTS_PER_SOL));
          const swapInstructions = await this.pumpAmmSdk.swapQuoteInstructions(
            swapState,
            quoteAmountBN,
            slippageBps / 10000,
            "quoteToBase",
          );

          instructions.push(...swapInstructions);
          feeAmountLamports = this.calculateFeeForSolToToken(amountIn);
        } else {
          // TOKEN -> SOL (sell on AMM)
          const baseAmountBN = new BN(amountIn * Math.pow(10, 6));
          const swapInstructions = await this.pumpAmmSdk.swapBaseInstructions(
            swapState,
            baseAmountBN,
            slippageBps / 10000,
            "baseToQuote",
          );

          instructions.push(...swapInstructions);

          const estimatedSolOut = this.pumpAmmSdk.swapAutocompleteQuoteFromBase(
            swapState,
            baseAmountBN,
            slippageBps / 10000,
            "baseToQuote",
          );
          feeAmountLamports = Math.floor(estimatedSolOut.toNumber() * 0.01);
        }
      } catch (error) {
        throw new Error(
          `Token ${pumpToken.toBase58()} appears migrated but no pump AMM pool found: ${error}`,
        );
      }
    }

    return { instructions, feeAmountLamports };
  }

  // =====================================================================================
  // SWAP EXECUTION METHODS (Tasks 17-19)
  // =====================================================================================

  private async executeLifiEvmSwap(
    accountId: string,
    swapParams: {
      inputTokenAddress: string;
      outputTokenAddress: string;
      inputAmount: number;
      slippageBps: number;
    },
    chainId: number = 1,
  ): Promise<string> {
    const { inputTokenAddress, outputTokenAddress, inputAmount, slippageBps } =
      swapParams;

    // Build LiFi swap transaction
    const swapData = await this.buildLiFiEvmSwap(
      accountId,
      chainId,
      chainId, // Same chain for now
      inputTokenAddress as Address,
      outputTokenAddress as Address,
      inputAmount.toString(),
      slippageBps,
    );

    // Submit transaction
    const transactionHash = await this.submitEvmTransaction(
      accountId,
      chainId,
      swapData.transactionRequest,
    );

    this.log(`EVM swap executed via LiFi: ${transactionHash}`);
    return transactionHash;
  }

  private async executeCustomSolSwap(
    accountId: string,
    swapParams: {
      inputTokenAddress: string;
      outputTokenAddress: string;
      inputAmount: number;
      slippageBps: number;
    },
    strategy: "sol-pump" | "sol-raydium",
    priority: boolean = false,
  ): Promise<string> {
    const { inputTokenAddress, outputTokenAddress, inputAmount, slippageBps } =
      swapParams;

    const inputMint = new PublicKey(inputTokenAddress);
    const outputMint = new PublicKey(outputTokenAddress);

    let swapInstructions: {
      instructions: TransactionInstruction[];
      lookupTable?: AddressLookupTableAccount[];
      feeAmountLamports: number;
    };

    if (strategy === "sol-pump") {
      swapInstructions = await this.buildPumpSwapInstructions(
        accountId,
        inputMint,
        outputMint,
        inputAmount,
        slippageBps,
      );
    } else if (strategy === "sol-raydium") {
      swapInstructions = await this.buildRaydiumSwapInstructions(
        inputMint,
        outputMint,
        inputAmount,
        slippageBps,
      );
    } else {
      throw new Error(`Unsupported custom SOL strategy: ${strategy}`);
    }

    // Submit transaction via globalSubmit
    const transactionHash = await this.globalSubmit(
      accountId,
      swapInstructions.instructions,
      swapInstructions.feeAmountLamports,
      {
        lookupTable: swapInstructions.lookupTable,
        maxTipLamports: priority ? 0.01 * LAMPORTS_PER_SOL : undefined,
      },
    );

    this.log(`SOL swap executed via ${strategy}: ${transactionHash}`);
    return transactionHash;
  }

  private async executeLifiSolSwap(
    accountId: string,
    swapParams: {
      inputTokenAddress: string;
      outputTokenAddress: string;
      inputAmount: number;
      slippageBps: number;
    },
    priority: boolean = false,
  ): Promise<string> {
    const { inputTokenAddress, outputTokenAddress, inputAmount, slippageBps } =
      swapParams;

    const inputMint = new PublicKey(inputTokenAddress);
    const outputMint = new PublicKey(outputTokenAddress);

    // Build LiFi swap instructions
    const swapInstructions = await this.buildLiFiSwapInstructions(
      accountId,
      inputMint,
      outputMint,
      inputAmount,
      slippageBps,
    );

    // Submit transaction via globalSubmit
    const transactionHash = await this.globalSubmit(
      accountId,
      swapInstructions.instructions,
      swapInstructions.feeAmountLamports,
      {
        lookupTable: swapInstructions.lookupTable,
        maxTipLamports: priority ? 0.01 * LAMPORTS_PER_SOL : undefined,
      },
    );

    this.log(`SOL swap executed via LiFi: ${transactionHash}`);
    return transactionHash;
  }

  // =====================================================================================
  // TRANSACTION MONITORING (Task 23)
  // =====================================================================================

  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MAX_RETRY_COUNT = 3;
  private readonly MONITORING_INTERVAL_MS = 5000; // 5 seconds

  private startTransactionMonitoring() {
    if (this.monitoringInterval) return; // Already monitoring

    this.monitoringInterval = setInterval(() => {
      this.checkPendingTransactions().catch((error) =>
        this.error(`Transaction monitoring error: ${error}`),
      );
    }, this.MONITORING_INTERVAL_MS);

    this.log("Started transaction monitoring");
  }

  private stopTransactionMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.log("Stopped transaction monitoring");
    }
  }

  private async checkPendingTransactions() {
    const now = Date.now();
    const expiredTransactions: string[] = [];

    for (const [orderId, tx] of this.pendingTransactions.entries()) {
      if (tx.status !== "pending") continue;

      // Check if transaction has been pending too long (30 seconds)
      if (now - tx.timestamp > 30000) {
        if (tx.retryCount >= this.MAX_RETRY_COUNT) {
          // Mark as failed after max retries
          tx.status = "failed";
          this.pendingTransactions.set(orderId, tx);
          this.error(
            `Transaction ${orderId} failed after ${this.MAX_RETRY_COUNT} retries`,
          );
          continue;
        }

        // Try to check transaction status
        try {
          const isConfirmed = await this.checkTransactionStatus(tx);
          if (isConfirmed) {
            tx.status = "confirmed";
            this.pendingTransactions.set(orderId, tx);
            this.log(`Transaction ${orderId} confirmed: ${tx.hash}`);
          } else {
            // Increment retry count and extend timeout
            tx.retryCount++;
            tx.timestamp = now;
            this.pendingTransactions.set(orderId, tx);
            this.log(
              `Transaction ${orderId} still pending, retry ${tx.retryCount}/${this.MAX_RETRY_COUNT}`,
            );
          }
        } catch (error) {
          this.error(`Error checking transaction ${orderId} status: ${error}`);
          tx.retryCount++;
          tx.timestamp = now;
          this.pendingTransactions.set(orderId, tx);
        }
      }
    }

    // Clean up old transactions (keep for 5 minutes after completion)
    const CLEANUP_TIME = 5 * 60 * 1000; // 5 minutes
    for (const [orderId, tx] of this.pendingTransactions.entries()) {
      if (
        (tx.status === "confirmed" || tx.status === "failed") &&
        now - tx.timestamp > CLEANUP_TIME
      ) {
        expiredTransactions.push(orderId);
      }
    }

    // Remove expired transactions
    for (const orderId of expiredTransactions) {
      this.pendingTransactions.delete(orderId);
      this.log(`Cleaned up expired transaction ${orderId}`);
    }
  }

  private async checkTransactionStatus(tx: {
    id: string;
    chainType: "EVM" | "SOL";
    hash?: string;
    status: "pending" | "confirmed" | "failed";
    timestamp: number;
    retryCount: number;
  }): Promise<boolean> {
    if (!tx.hash) return false;

    try {
      if (tx.chainType === "EVM") {
        // Check EVM transaction status
        const client = this.getEvmClient(1); // Default to Ethereum, could be improved
        const receipt = await client.public.getTransactionReceipt({
          hash: tx.hash as Hash,
        });
        return receipt.status === "success";
      } else if (tx.chainType === "SOL") {
        // Check Solana transaction status
        if (!this.solanaConnection) return false;

        const statuses = await this.solanaConnection.getSignatureStatuses([
          tx.hash,
        ]);
        const status = statuses.value[0];

        if (status) {
          if (status.err) {
            throw new Error(
              `Solana transaction failed: ${JSON.stringify(status.err)}`,
            );
          }
          return (
            status.confirmationStatus === "confirmed" ||
            status.confirmationStatus === "finalized"
          );
        }
        return false;
      }
    } catch (error) {
      this.error(`Error checking transaction status for ${tx.hash}: ${error}`);
      return false;
    }

    return false;
  }

  // Public method to get transaction status
  getTransactionStatus(orderId: string): {
    id: string;
    chainType: "EVM" | "SOL";
    hash?: string;
    status: "pending" | "confirmed" | "failed";
    timestamp: number;
    retryCount: number;
  } | null {
    return this.pendingTransactions.get(orderId) || null;
  }

  // Public method to get all pending transactions
  getAllPendingTransactions(): Array<{
    id: string;
    chainType: "EVM" | "SOL";
    hash?: string;
    status: "pending" | "confirmed" | "failed";
    timestamp: number;
    retryCount: number;
  }> {
    return Array.from(this.pendingTransactions.values());
  }

  // =====================================================================================
  // ERROR HANDLING AND RECOVERY (Task 24)
  // =====================================================================================

  private async handleSwapError(
    error: any,
    orderId: string,
    swapParams: {
      inputTokenAddress: string;
      outputTokenAddress: string;
      inputAmount: number;
      slippageBps: number;
      chainType: "EVM" | "SOL";
    },
    strategy: string,
  ): Promise<{ shouldRetry: boolean; fallbackStrategy?: string }> {
    this.error(`Swap error for ${orderId} using ${strategy}: ${error.message}`);

    // Network/RPC errors - retry with same strategy
    if (
      error.message.includes("network") ||
      error.message.includes("timeout") ||
      error.message.includes("connection") ||
      error.message.includes("502") ||
      error.message.includes("503") ||
      error.message.includes("504")
    ) {
      this.log(`Network error detected for ${orderId}, will retry`);
      return { shouldRetry: true };
    }

    // Insufficient funds - don't retry
    if (
      error.message.includes("insufficient") ||
      error.message.includes("balance")
    ) {
      this.error(`Insufficient funds for ${orderId}, cannot retry`);
      return { shouldRetry: false };
    }

    // Slippage tolerance exceeded - retry with higher slippage
    if (
      error.message.includes("slippage") ||
      error.message.includes("price impact")
    ) {
      this.log(
        `Slippage error for ${orderId}, will retry with higher tolerance`,
      );
      return { shouldRetry: true };
    }

    // Strategy-specific fallbacks
    if (swapParams.chainType === "SOL") {
      if (strategy === "sol-pump") {
        this.log(`Pump.fun failed for ${orderId}, falling back to LiFi`);
        return { shouldRetry: true, fallbackStrategy: "sol-lifi" };
      } else if (strategy === "sol-raydium") {
        this.log(`Raydium failed for ${orderId}, falling back to LiFi`);
        return { shouldRetry: true, fallbackStrategy: "sol-lifi" };
      }
    }

    // Gas estimation errors - retry with higher gas
    if (
      error.message.includes("gas") ||
      error.message.includes("out of gas") ||
      error.message.includes("intrinsic gas")
    ) {
      this.log(`Gas error for ${orderId}, will retry with higher gas limit`);
      return { shouldRetry: true };
    }

    // MEV/frontrun errors - retry with higher priority fee
    if (
      error.message.includes("MEV") ||
      error.message.includes("frontrun") ||
      error.message.includes("priority fee")
    ) {
      this.log(
        `MEV/frontrun detected for ${orderId}, will retry with higher priority`,
      );
      return { shouldRetry: true };
    }

    // Default: don't retry unknown errors
    this.error(
      `Unknown error for ${orderId}, will not retry: ${error.message}`,
    );
    return { shouldRetry: false };
  }

  private async retrySwapWithBackoff(
    accountId: string,
    orderId: string,
    swapParams: {
      inputTokenAddress: string;
      outputTokenAddress: string;
      inputAmount: number;
      slippageBps: number;
      chainType: "EVM" | "SOL";
    },
    strategy: string,
    attempt: number = 1,
    maxAttempts: number = 3,
  ): Promise<string> {
    try {
      // Execute swap based on strategy
      if (strategy === "evm-lifi") {
        return await this.executeLifiEvmSwap(accountId, swapParams);
      } else if (strategy === "sol-pump" || strategy === "sol-raydium") {
        return await this.executeCustomSolSwap(
          accountId,
          swapParams,
          strategy as "sol-pump" | "sol-raydium",
        );
      } else if (strategy === "sol-lifi") {
        return await this.executeLifiSolSwap(accountId, swapParams);
      } else {
        throw new Error(`Unsupported strategy: ${strategy}`);
      }
    } catch (error) {
      const errorHandling = await this.handleSwapError(
        error,
        orderId,
        swapParams,
        strategy,
      );

      if (errorHandling.shouldRetry && attempt < maxAttempts) {
        // Exponential backoff: 2^attempt seconds
        const delayMs = Math.pow(2, attempt) * 1000;
        this.log(
          `Retrying ${orderId} in ${delayMs}ms (attempt ${attempt + 1}/${maxAttempts})`,
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Use fallback strategy if provided
        const nextStrategy = errorHandling.fallbackStrategy || strategy;

        // Increase slippage tolerance for retry
        const retryParams = {
          ...swapParams,
          slippageBps: Math.min(swapParams.slippageBps * 1.5, 500), // Cap at 5%
        };

        return await this.retrySwapWithBackoff(
          accountId,
          orderId,
          retryParams,
          nextStrategy,
          attempt + 1,
          maxAttempts,
        );
      }

      // No more retries, throw the error
      throw error;
    }
  }

  private async safeExecuteSwap(
    accountId: string,
    orderId: string,
    swapParams: {
      inputTokenAddress: string;
      outputTokenAddress: string;
      inputAmount: number;
      slippageBps: number;
      chainType: "EVM" | "SOL";
    },
    routeResult: {
      strategy: "evm-lifi" | "sol-pump" | "sol-lifi" | "sol-raydium";
      chainId?: number;
      instructions?: TransactionInstruction[];
      transactionRequest?: any;
      lookupTable?: AddressLookupTableAccount[];
      feeAmountLamports?: number;
    },
    _priority: boolean = false,
  ): Promise<string> {
    try {
      // Validate inputs before execution
      if (!swapParams.inputTokenAddress || !swapParams.outputTokenAddress) {
        throw new Error("Missing token addresses");
      }

      if (swapParams.inputAmount <= 0) {
        throw new Error("Invalid input amount");
      }

      // Check if we have necessary connections
      if (
        swapParams.chainType === "EVM" &&
        Object.keys(this.evmClients).length === 0
      ) {
        throw new Error("No EVM clients available");
      }

      if (swapParams.chainType === "SOL" && !this.solanaConnection) {
        throw new Error("Solana connection not available");
      }

      // Execute with retry logic
      return await this.retrySwapWithBackoff(
        accountId,
        orderId,
        swapParams,
        routeResult.strategy,
      );
    } catch (error) {
      // Update transaction status to failed
      const pendingTx = this.pendingTransactions.get(orderId);
      if (pendingTx) {
        pendingTx.status = "failed";
        this.pendingTransactions.set(orderId, pendingTx);
      }

      // Log detailed error information
      this.error(
        `Safe swap execution failed for ${orderId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.error(`Swap params: ${JSON.stringify(swapParams)}`);
      this.error(`Route: ${routeResult.strategy}`);

      throw error;
    }
  }

  // =====================================================================================
  // CORE TRADING LOGIC (Tasks 14-16)
  // =====================================================================================

  private parseSwapFromOrder(order: PlaceOrderOpts): {
    inputTokenAddress: string;
    outputTokenAddress: string;
    inputAmount: number;
    slippageBps: number;
    chainType: "EVM" | "SOL";
  } {
    // Parse the symbol to extract token information
    // Format examples:
    // - "ETH/USDC" -> swap ETH for USDC
    // - "SOL/PUMP" -> swap SOL for PUMP token
    // - "0x123...abc/0x456...def" -> direct token addresses

    const [inputSymbol, outputSymbol] = order.symbol.split("/");
    if (!inputSymbol || !outputSymbol) {
      throw new Error(
        `Invalid symbol format: ${order.symbol}. Expected format: "TOKEN1/TOKEN2"`,
      );
    }

    // Determine chain type based on symbol or explicit chain indicator
    let chainType: "EVM" | "SOL";
    let inputTokenAddress: string;
    let outputTokenAddress: string;

    // Check if symbols are direct addresses (start with 0x for EVM, or are base58 for Solana)
    const isEvmAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
    const isSolanaAddress = (addr: string) =>
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);

    if (isEvmAddress(inputSymbol) || isEvmAddress(outputSymbol)) {
      // EVM addresses detected
      chainType = "EVM";
      inputTokenAddress = inputSymbol;
      outputTokenAddress = outputSymbol;
    } else if (isSolanaAddress(inputSymbol) || isSolanaAddress(outputSymbol)) {
      // Solana addresses detected
      chainType = "SOL";
      inputTokenAddress = inputSymbol;
      outputTokenAddress = outputSymbol;
    } else {
      // Symbol-based detection
      const solanaSymbols = ["SOL", "USDC-SOL", "PUMP", "RAY"];
      const evmSymbols = ["ETH", "BNB", "MATIC", "USDC", "USDT", "WETH"];

      if (
        solanaSymbols.some(
          (symbol) =>
            inputSymbol.includes(symbol) || outputSymbol.includes(symbol),
        )
      ) {
        chainType = "SOL";
        inputTokenAddress = this.resolveTokenAddress(inputSymbol, "SOL");
        outputTokenAddress = this.resolveTokenAddress(outputSymbol, "SOL");
      } else if (
        evmSymbols.some(
          (symbol) =>
            inputSymbol.includes(symbol) || outputSymbol.includes(symbol),
        )
      ) {
        chainType = "EVM";
        inputTokenAddress = this.resolveTokenAddress(inputSymbol, "EVM");
        outputTokenAddress = this.resolveTokenAddress(outputSymbol, "EVM");
      } else {
        // Default to SOL for unknown tokens (many meme coins are on Solana)
        chainType = "SOL";
        inputTokenAddress = this.resolveTokenAddress(inputSymbol, "SOL");
        outputTokenAddress = this.resolveTokenAddress(outputSymbol, "SOL");
      }
    }

    // Convert amount to input amount
    const inputAmount = parseFloat(order.amount.toString());

    // Use default slippage of 1% = 100 bps for onchain swaps
    const slippageBps = 100;

    return {
      inputTokenAddress,
      outputTokenAddress,
      inputAmount,
      slippageBps,
      chainType,
    };
  }

  private resolveTokenAddress(
    symbol: string,
    chainType: "EVM" | "SOL",
  ): string {
    // Token address mapping for common tokens
    const tokenMappings = {
      SOL: {
        SOL: "11111111111111111111111111111111", // Native SOL
        USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        RAY: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
        SRM: "SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt",
      },
      EVM: {
        ETH: "0x0000000000000000000000000000000000000000", // Native ETH
        WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        BNB: "0x0000000000000000000000000000000000000000", // Native on BSC
        MATIC: "0x0000000000000000000000000000000000000000", // Native on Polygon
      },
    };

    const chainMapping = tokenMappings[chainType];
    if (chainMapping) {
      const mapping =
        chainMapping[symbol.toUpperCase() as keyof typeof chainMapping];
      if (mapping) {
        return mapping;
      }
    }

    // If not found in mapping, assume it's already an address or will be resolved later
    // For now, return the symbol as-is and let the routing logic handle it
    return symbol;
  }

  private async routeSwap(
    accountId: string,
    swapParams: {
      inputTokenAddress: string;
      outputTokenAddress: string;
      inputAmount: number;
      slippageBps: number;
      chainType: "EVM" | "SOL";
    },
  ): Promise<{
    strategy: "evm-lifi" | "sol-pump" | "sol-lifi" | "sol-raydium";
    chainId?: number;
    instructions?: TransactionInstruction[];
    transactionRequest?: any;
    lookupTable?: AddressLookupTableAccount[];
    feeAmountLamports?: number;
  }> {
    const {
      inputTokenAddress,
      outputTokenAddress,
      inputAmount,
      slippageBps,
      chainType,
    } = swapParams;

    if (chainType === "EVM") {
      // EVM routing: Use LiFi for cross-chain or single-chain swaps
      return this.routeEvmSwap(
        accountId,
        inputTokenAddress,
        outputTokenAddress,
        inputAmount,
        slippageBps,
      );
    } else if (chainType === "SOL") {
      // Solana routing: Decision tree for best DEX
      return this.routeSolanaSwap(
        accountId,
        inputTokenAddress,
        outputTokenAddress,
        inputAmount,
        slippageBps,
      );
    } else {
      throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  private async routeEvmSwap(
    accountId: string,
    inputTokenAddress: string,
    outputTokenAddress: string,
    inputAmount: number,
    slippageBps: number,
  ): Promise<{
    strategy: "evm-lifi";
    chainId: number;
    transactionRequest: any;
    estimatedGas: bigint;
    route: any;
  }> {
    // For EVM, we primarily use LiFi which supports multiple chains
    // Default to Ethereum mainnet, but this could be made configurable
    const fromChainId = 1; // Ethereum
    const toChainId = 1; // Same chain for now, could be cross-chain

    try {
      const swapData = await this.buildLiFiEvmSwap(
        accountId,
        fromChainId,
        toChainId,
        inputTokenAddress as Address,
        outputTokenAddress as Address,
        inputAmount.toString(),
        slippageBps,
      );

      return {
        strategy: "evm-lifi",
        chainId: fromChainId,
        transactionRequest: swapData.transactionRequest,
        estimatedGas: swapData.estimatedGas,
        route: swapData.route,
      };
    } catch (error) {
      throw new Error(`EVM routing failed: ${error}`);
    }
  }

  private async routeSolanaSwap(
    accountId: string,
    inputTokenAddress: string,
    outputTokenAddress: string,
    inputAmount: number,
    slippageBps: number,
  ): Promise<{
    strategy: "sol-pump" | "sol-lifi" | "sol-raydium";
    instructions: TransactionInstruction[];
    lookupTable?: AddressLookupTableAccount[];
    feeAmountLamports: number;
  }> {
    const inputMint = new PublicKey(inputTokenAddress);
    const outputMint = new PublicKey(outputTokenAddress);

    // Decision tree for Solana DEX routing:
    // 1. Check if either token is a Pump.fun token
    // 2. If not, try Raydium (if SDK available)
    // 3. Fall back to LiFi

    // Strategy 1: Try Pump.fun first (best for meme coins)
    if (this.pumpSdk && this.pumpAmmSdk) {
      try {
        // Check if either token exists on Pump.fun
        const isPumpToken = await this.checkIfPumpToken(inputMint, outputMint);

        if (isPumpToken) {
          const pumpSwap = await this.buildPumpSwapInstructions(
            accountId,
            inputMint,
            outputMint,
            inputAmount,
            slippageBps,
          );

          this.log(`Routing via Pump.fun ecosystem`);
          return {
            strategy: "sol-pump",
            instructions: pumpSwap.instructions,
            lookupTable: pumpSwap.lookupTable,
            feeAmountLamports: pumpSwap.feeAmountLamports,
          };
        }
      } catch (error) {
        this.log(`Pump.fun routing failed, trying next option: ${error}`);
      }
    }

    // Strategy 2: Try Raydium (if SDK available and tokens supported)
    if (this.raydiumSdk) {
      try {
        const raydiumSwap = await this.buildRaydiumSwapInstructions(
          inputMint,
          outputMint,
          inputAmount,
          slippageBps,
        );

        this.log(`Routing via Raydium`);
        return {
          strategy: "sol-raydium",
          instructions: raydiumSwap.instructions,
          lookupTable: raydiumSwap.lookupTable,
          feeAmountLamports: raydiumSwap.feeAmountLamports,
        };
      } catch (error) {
        this.log(`Raydium routing failed, trying LiFi fallback: ${error}`);
      }
    }

    // Strategy 3: Fall back to LiFi (should work for most major tokens)
    try {
      const lifiSwap = await this.buildLiFiSwapInstructions(
        accountId,
        inputMint,
        outputMint,
        inputAmount,
        slippageBps,
      );

      this.log(`Routing via LiFi fallback`);
      return {
        strategy: "sol-lifi",
        instructions: lifiSwap.instructions,
        lookupTable: lifiSwap.lookupTable,
        feeAmountLamports: lifiSwap.feeAmountLamports,
      };
    } catch (error) {
      throw new Error(
        `All Solana routing strategies failed. Last error: ${error}`,
      );
    }
  }

  private async checkIfPumpToken(
    inputMint: PublicKey,
    outputMint: PublicKey,
  ): Promise<boolean> {
    if (!this.pumpSdk) return false;

    try {
      // Check if either token is on Pump.fun by trying to fetch bonding curve
      const isInputSol = inputMint.equals(NATIVE_MINT);
      const isOutputSol = outputMint.equals(NATIVE_MINT);

      // Pump.fun only supports SOL <-> TOKEN swaps
      if (!isInputSol && !isOutputSol) return false;

      const tokenToCheck = isInputSol ? outputMint : inputMint;

      // Try to fetch bonding curve - if it exists, it's a Pump token
      await this.pumpSdk.fetchBondingCurve(tokenToCheck);
      return true;
    } catch {
      // If fetching bonding curve fails, it's not a Pump token
      return false;
    }
  }

  // Placeholder for Raydium swap instructions (similar pattern to Pump)
  private async buildRaydiumSwapInstructions(
    _inputMint: PublicKey,
    _outputMint: PublicKey,
    _amountIn: number,
    _slippageBps: number,
  ): Promise<{
    instructions: TransactionInstruction[];
    lookupTable?: AddressLookupTableAccount[];
    feeAmountLamports: number;
  }> {
    // This would implement Raydium-specific swap logic
    // For now, throw an error to fall back to LiFi
    throw new Error("Raydium swap builder not yet implemented");
  }

  stop() {
    // Stop transaction monitoring
    this.stopTransactionMonitoring();

    // Stop price monitoring for stop losses
    this.stopPriceMonitoring();

    // Disconnect public WebSocket
    if (this.publicWs) {
      this.publicWs.disconnect();
      this.publicWs = null;
    }

    // Disconnect all private WebSockets
    for (const accountId in this.privateWs) {
      if (this.privateWs[accountId]) {
        this.privateWs[accountId].disconnect();
        delete this.privateWs[accountId];
      }
    }

    // Clean up Codex SDK
    this.codexSdk = null;

    // Clean up EVM clients
    this.evmClients = {};

    // Clean up Solana connection
    this.solanaConnection = null;

    // Clean up DEX SDK instances
    this.pumpSdk = null;
    this.pumpAmmSdk = null;
    this.raydiumSdk = null;

    // Clear pending transactions
    this.pendingTransactions.clear();

    // Clear stop loss monitors
    this.stopLossMonitors.clear();

    // Clear performance caches
    this.routeCache.clear();
    this.gasEstimateCache.clear();

    // Clear accounts
    this.accounts = [];
  }

  async fetchPublic() {
    const { markets, tickers, chains } = await fetchOnchainMarketsTickers(
      this.codexSdk as Codex,
    );
    this.emitChanges([
      { type: "update", path: "loaded.markets", value: true },
      { type: "update", path: "loaded.tickers", value: true },
      { type: "update", path: "public.markets", value: markets },
      {
        type: "update",
        path: "public.tickers",
        value: tickers,
      },
    ]);

    this.lifiChains = chains;

    this.log(`Loaded ${Object.keys(markets).length} Onchain markets`);

    this.publicWs = new OnchainWsPublic({ parent: this });
  }

  async addAccounts({
    accounts,
    requestId,
  }: {
    accounts: Account[];
    requestId?: string;
  }) {
    super.addAccounts({ accounts, requestId });

    for (const account of accounts) {
      this.privateWs[account.id] = new OnchainWsPrivate({
        parent: this,
        account,
      });
    }

    // Don't need to fetch and poll balances as it's handled by the private WebSocket

    // Load account data for each new account
    await Promise.all(
      accounts.map(async (account) => {
        await this.loadAccountData(account.id);
        this.log(`Loaded Onchain balance for account [${account.id}]`);
      }),
    );

    if (requestId) {
      this.emitResponse({ requestId });
    }
  }

  async removeAccount({
    accountId,
    requestId,
  }: {
    accountId: string;
    requestId: string;
  }) {
    // Stop and remove private WebSocket
    if (accountId in this.privateWs) {
      this.privateWs[accountId].disconnect();
      delete this.privateWs[accountId];
    }

    await super.removeAccount({ accountId, requestId });
  }

  async loadAccountData(accountId: string) {
    const account = this.accounts.find((a) => a.id === accountId);

    if (!account || !this.codexSdk || !account.walletAddress) {
      this.error(`No account or Codex SDK found for ${accountId}`);
      return;
    }

    const walletAddress = account.walletAddress;

    if (!walletAddress) {
      this.error("An EVM or SOL address is required for onchain exchange");
      return;
    }

    this.privateWs[accountId].connect();

    // First fetch positions and fills to get UPNL by network
    const positionData = await fetchOnchainPositions(
      {
        id: account.id,
        walletAddress,
      },
      this.codexSdk,
      this.lifiChains,
    );

    // Then fetch balances with UPNL data and position data
    const balance = await fetchOnchainBalances(
      {
        id: account.id,
        walletAddress,
      },
      this.codexSdk,
      positionData.upnlByNetwork,
    );

    this.emitChanges([
      {
        type: "update",
        path: `private.${accountId}.balance`,
        value: balance,
      },
      {
        type: "update",
        path: `private.${accountId}.positions`,
        value: positionData.positions,
      },
      {
        type: "update",
        path: `private.${accountId}.fills`,
        value: positionData.fills,
      },
    ]);

    this.log(
      `Loaded ${positionData.positions.length} Onchain positions and ${positionData.fills.length} fills for account [${account.id}]`,
    );

    // Launch async token tracking for positions (don't await)
    this.trackPositionTokens(positionData.positions).catch((error) =>
      this.error(`Failed to track position tokens: ${error}`),
    );
  }

  listenOrderBook(_symbol: string) {
    // Order books don't exist for onchain/wallet holdings
    this.log("Order book streaming not applicable for onchain exchange");
  }

  unlistenOrderBook(_symbol: string) {
    // Order books don't exist for onchain/wallet holdings
    this.log("Order book streaming not applicable for onchain exchange");
  }

  async fetchOHLCV({
    requestId,
    params,
  }: {
    requestId: string;
    params: FetchOHLCVOnchainParams;
  }) {
    if (!this.codexSdk) {
      this.error("No Codex SDK available for OHLCV data");
      return;
    }

    const candles = await fetchOnchainOHLCV({
      params,
      codexSdk: this.codexSdk,
    });

    this.emitResponse({ requestId, data: candles });
  }

  listenOHLCV({ symbol, timeframe }: { symbol: string; timeframe: Timeframe }) {
    this.publicWs?.listenOHLCV({ symbol, timeframe });
  }

  unlistenOHLCV({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: Timeframe;
  }) {
    this.publicWs?.unlistenOHLCV({ symbol, timeframe });
  }

  // =====================================================================================
  // STOP LOSS FUNCTIONALITY (Task 22)
  // =====================================================================================

  private stopLossOrders: Map<
    string,
    {
      id: string;
      position: Position;
      stopPrice: number;
      triggerPrice: number;
      slippagePercent: number;
      accountId: string;
      isActive: boolean;
      createdAt: number;
      lastChecked: number;
    }
  > = new Map();

  private startPriceMonitoring() {
    if (this.priceMonitoringInterval) return;

    this.priceMonitoringInterval = setInterval(() => {
      this.checkStopLossConditions().catch((error) =>
        this.error(`Price monitoring error: ${error}`),
      );
    }, 10000); // Check every 10 seconds

    this.log("Started price monitoring for stop loss orders");
  }

  private stopPriceMonitoring() {
    if (this.priceMonitoringInterval) {
      clearInterval(this.priceMonitoringInterval);
      this.priceMonitoringInterval = null;
      this.log("Stopped price monitoring");
    }
  }

  private async checkStopLossConditions() {
    if (this.stopLossOrders.size === 0) return;

    for (const [stopId, stopOrder] of this.stopLossOrders.entries()) {
      if (!stopOrder.isActive) continue;

      try {
        // Get current token price
        let chainTypeParam: "EVM" | "SOL";
        if (
          stopOrder.position.chainType &&
          stopOrder.position.chainType.toLowerCase().includes("sol")
        ) {
          chainTypeParam = "SOL";
        } else {
          chainTypeParam = "EVM";
        }
        const currentPrice = await this.getCurrentTokenPrice(
          stopOrder.position.tokenAddress!,
          chainTypeParam,
        );

        if (!currentPrice) {
          this.log(
            `Unable to get price for ${stopOrder.position.symbol}, skipping`,
          );
          continue;
        }

        // Update last checked timestamp
        stopOrder.lastChecked = Date.now();
        this.stopLossOrders.set(stopId, stopOrder);

        // Check if stop condition is met
        const shouldTrigger = this.shouldTriggerStopLoss(
          currentPrice,
          stopOrder.triggerPrice,
          stopOrder.position.side,
        );

        if (shouldTrigger) {
          this.log(
            `Stop loss triggered for ${stopOrder.position.symbol}: current=${currentPrice}, trigger=${stopOrder.triggerPrice}`,
          );

          // Execute stop loss order
          await this.executeStopLossOrder(stopOrder);

          // Deactivate the stop loss order
          stopOrder.isActive = false;
          this.stopLossOrders.set(stopId, stopOrder);
        }
      } catch (error) {
        this.error(`Error checking stop loss for ${stopId}: ${error}`);
      }
    }
  }

  private shouldTriggerStopLoss(
    currentPrice: number,
    triggerPrice: number,
    positionSide: "long" | "short",
  ): boolean {
    if (positionSide === "long") {
      // For long positions, trigger when price falls below trigger price
      return currentPrice <= triggerPrice;
    } else {
      // For short positions, trigger when price rises above trigger price
      return currentPrice >= triggerPrice;
    }
  }

  private async getCurrentTokenPrice(
    tokenAddress: string,
    chainType: "EVM" | "SOL",
  ): Promise<number | null> {
    try {
      if (!this.codexSdk) {
        this.error("No Codex SDK available for price fetching");
        return null;
      }

      // Check if we have this token in our tickers
      const ticker = Object.values(this.memory.public.tickers).find((t) =>
        t.symbol.includes(tokenAddress.substring(0, 8)),
      );

      if (ticker && ticker.last) {
        return parseFloat(ticker.last.toString());
      }

      // If not in tickers, fetch directly from Codex
      // This would need to be implemented based on Codex SDK capabilities
      this.log(`Fetching price for ${tokenAddress} on ${chainType}`);

      // Placeholder - implement actual price fetching
      return null;
    } catch (error) {
      this.error(`Error fetching price for ${tokenAddress}: ${error}`);
      return null;
    }
  }

  private async executeStopLossOrder(stopOrder: {
    id: string;
    position: Position;
    stopPrice: number;
    triggerPrice: number;
    slippagePercent: number;
    accountId: string;
    isActive: boolean;
    createdAt: number;
    lastChecked: number;
  }) {
    try {
      this.log(
        `Executing stop loss order ${stopOrder.id} for position ${stopOrder.position.symbol}`,
      );

      // Create sell order to close the position
      const sellOrder: PlaceOrderOpts = {
        symbol: this.createClosePositionSymbol(stopOrder.position),
        side:
          stopOrder.position.side === "long" ? OrderSide.Sell : OrderSide.Buy,
        type: OrderType.Market,
        amount: Math.abs(stopOrder.position.contracts),
        reduceOnly: true,
      };

      // Execute the sell order
      const orderIds = await this.placeOrders({
        orders: [sellOrder],
        accountId: stopOrder.accountId,
        requestId: `stop-loss-${stopOrder.id}`,
        priority: true, // Use priority for stop losses
      });

      if (orderIds.length > 0) {
        this.log(`Stop loss order executed successfully: ${orderIds[0]}`);

        // Log stop loss execution
        this.log(
          `Stop loss executed for ${stopOrder.position.symbol}: ${stopOrder.id}`,
        );
      } else {
        throw new Error("Failed to place stop loss execution order");
      }
    } catch (error) {
      this.error(`Failed to execute stop loss order ${stopOrder.id}: ${error}`);

      // Log stop loss failure
      this.log(
        `Stop loss failed for ${stopOrder.position.symbol}: ${stopOrder.id}`,
      );
    }
  }

  private createClosePositionSymbol(position: Position): string {
    // Create the reverse symbol to close the position
    // For a BTC/USDC long position, we need to sell BTC for USDC
    if (!position.tokenAddress) {
      throw new Error("Position must have token address for onchain trading");
    }

    if (position.side === "long") {
      // Long position: we own the token, need to sell it
      // Format: TOKEN/USDC (sell token for USDC)
      return `${position.tokenAddress}/11111111111111111111111111111111`; // SOL as quote
    } else {
      // Short position: we need to buy back the token
      // Format: USDC/TOKEN (buy token with USDC)
      return `11111111111111111111111111111111/${position.tokenAddress}`; // SOL as base
    }
  }

  async placePositionStop({
    position,
    stop,
    requestId,
    priority: _priority = false,
  }: {
    position: Position;
    stop: PlacePositionStopOpts;
    requestId: string;
    priority?: boolean;
  }) {
    try {
      // Validate position and stop parameters
      if (!position.tokenAddress) {
        this.error("Position must have token address for onchain stop loss");
        this.emitResponse({ requestId, data: false });
        return;
      }

      if (!stop.price || stop.price <= 0) {
        this.error("Invalid stop price provided");
        this.emitResponse({ requestId, data: false });
        return;
      }

      // Find the account for this position
      const account = this.accounts.find(
        (acc) =>
          acc.id === position.accountId ||
          acc.walletAddress === position.accountId,
      );

      if (!account) {
        this.error(`Account not found for position ${position.symbol}`);
        this.emitResponse({ requestId, data: false });
        return;
      }

      // Generate unique stop loss ID
      const stopId = `stop-${position.symbol}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Calculate trigger price (stop price with small buffer for execution)
      const bufferPercent = 0.001; // 0.1% buffer
      let triggerPrice: number;

      if (position.side === "long") {
        // For long positions, trigger slightly above stop price
        triggerPrice = stop.price * (1 + bufferPercent);
      } else {
        // For short positions, trigger slightly below stop price
        triggerPrice = stop.price * (1 - bufferPercent);
      }

      // Create stop loss order
      const stopLossOrder = {
        id: stopId,
        position,
        stopPrice: stop.price,
        triggerPrice,
        slippagePercent: 1, // Default 1% slippage
        accountId: account.id,
        isActive: true,
        createdAt: Date.now(),
        lastChecked: Date.now(),
      };

      // Store the stop loss order
      this.stopLossOrders.set(stopId, stopLossOrder);

      // Start price monitoring if not already running
      this.startPriceMonitoring();

      this.log(
        `Created stop loss order ${stopId} for ${position.symbol} at trigger price ${triggerPrice}`,
      );

      // Log stop loss order created
      this.log(`Stop loss order created for ${position.symbol}: ${stopId}`);

      this.emitResponse({ requestId, data: true });
    } catch (error) {
      this.error(`Failed to create stop loss order: ${error}`);
      this.emitResponse({ requestId, data: false });
    }
  }

  // Public method to cancel a stop loss order
  async cancelStopLoss(stopId: string): Promise<boolean> {
    const stopOrder = this.stopLossOrders.get(stopId);
    if (!stopOrder) {
      this.error(`Stop loss order ${stopId} not found`);
      return false;
    }

    stopOrder.isActive = false;
    this.stopLossOrders.set(stopId, stopOrder);

    this.log(`Cancelled stop loss order ${stopId}`);

    // Emit cancellation event
    // Log stop loss cancellation
    this.log(`Stop loss cancelled: ${stopId}`);

    return true;
  }

  // Public method to get all active stop loss orders
  getActiveStopLossOrders(): Array<{
    id: string;
    position: Position;
    stopPrice: number;
    triggerPrice: number;
    slippagePercent: number;
    accountId: string;
    isActive: boolean;
    createdAt: number;
    lastChecked: number;
  }> {
    return Array.from(this.stopLossOrders.values()).filter(
      (order) => order.isActive,
    );
  }

  async placeOrders({
    orders,
    accountId,
    requestId,
    priority = false,
  }: {
    orders: PlaceOrderOpts[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }): Promise<Array<string>> {
    const orderIds: string[] = [];

    try {
      this.log(`Processing ${orders.length} orders for account ${accountId}`);

      for (const order of orders) {
        try {
          // Generate unique order ID
          const orderId = `${accountId}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

          // Parse order to swap parameters
          const swapParams = this.parseSwapFromOrder(order);
          this.log(
            `Parsed order ${orderId}: ${swapParams.chainType} ${swapParams.inputTokenAddress} -> ${swapParams.outputTokenAddress}`,
          );

          // Route the swap to determine execution strategy
          const routeResult = await this.routeSwap(accountId, swapParams);
          this.log(
            `Routed order ${orderId} via strategy: ${routeResult.strategy}`,
          );

          // Track pending transaction
          this.pendingTransactions.set(orderId, {
            id: orderId,
            chainType: swapParams.chainType,
            status: "pending",
            timestamp: Date.now(),
            retryCount: 0,
          });

          // Execute with safe error handling and retry logic
          const transactionHash = await this.safeExecuteSwap(
            accountId,
            orderId,
            swapParams,
            routeResult,
            priority,
          );

          // Update transaction tracking
          const pendingTx = this.pendingTransactions.get(orderId);
          if (pendingTx) {
            pendingTx.hash = transactionHash;
            pendingTx.status = "confirmed";
            this.pendingTransactions.set(orderId, pendingTx);
          }

          this.log(
            `Order ${orderId} executed successfully: ${transactionHash}`,
          );
          orderIds.push(orderId);
        } catch (orderError) {
          this.error(`Failed to execute order ${order.symbol}: ${orderError}`);
        }
      }

      this.log(
        `Successfully processed ${orderIds.length}/${orders.length} orders`,
      );
      this.emitResponse({ requestId, data: orderIds });
      return orderIds;
    } catch (error) {
      this.error(`Failed to place orders: ${error}`);
      this.emitResponse({ requestId, data: [] });
      return [];
    }
  }

  async updateOrders({
    updates,
    accountId,
    requestId,
    priority = false,
  }: {
    updates: UpdateOrderOpts[];
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    try {
      this.log(`Updating ${updates.length} orders for account ${accountId}`);
      const updateResults: string[] = [];

      for (const updateOpts of updates) {
        try {
          const { order, update } = updateOpts;

          // Since onchain swaps are typically instant, we can't really "update" them
          // Instead, we'll cancel the existing order (if still pending) and place a new one

          // First, try to cancel the existing order
          if (order.id) {
            const orderId = order.id.toString();
            const pendingTx = this.pendingTransactions.get(orderId);
            if (pendingTx && pendingTx.status === "pending") {
              // Mark as cancelled
              pendingTx.status = "failed";
              this.pendingTransactions.set(orderId, pendingTx);
              this.log(`Cancelled pending order ${orderId}`);
            }
          }

          // Create new order with updated parameters
          let newAmount = order.amount;
          let newPrice = order.price;

          if ("amount" in update) {
            newAmount = update.amount;
          }
          if ("price" in update) {
            newPrice = update.price;
          }

          const newOrder: PlaceOrderOpts = {
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            amount: newAmount,
            price: newPrice,
            reduceOnly: order.reduceOnly,
          };

          const newOrderIds = await this.placeOrders({
            orders: [newOrder],
            accountId,
            requestId: `${requestId}-update-${Date.now()}`,
            priority,
          });

          if (newOrderIds.length > 0) {
            updateResults.push(newOrderIds[0]);
            this.log(`Updated order ${order.id} -> ${newOrderIds[0]}`);
          }
        } catch (updateError) {
          this.error(
            `Failed to update order ${updateOpts.order.id}: ${updateError}`,
          );
        }
      }

      this.log(
        `Successfully updated ${updateResults.length}/${updates.length} orders`,
      );
      this.emitResponse({ requestId, data: updateResults });
    } catch (error) {
      this.error(`Failed to update orders: ${error}`);
      this.emitResponse({ requestId, data: [] });
    }
  }

  async cancelOrders({
    orderIds,
    accountId,
    requestId,
    priority: _priority = false,
  }: {
    orderIds: Array<string>;
    accountId: string;
    requestId: string;
    priority?: boolean;
  }) {
    try {
      this.log(`Cancelling ${orderIds.length} orders for account ${accountId}`);
      const cancelResults: string[] = [];

      for (const orderId of orderIds) {
        try {
          // Get the pending transaction
          const pendingTx = this.pendingTransactions.get(orderId);

          if (!pendingTx) {
            this.log(`Order ${orderId} not found in pending transactions`);
            continue;
          }

          if (pendingTx.status === "confirmed") {
            this.log(`Order ${orderId} already confirmed, cannot cancel`);
            continue;
          }

          if (pendingTx.status === "failed") {
            this.log(`Order ${orderId} already failed`);
            cancelResults.push(orderId);
            continue;
          }

          // For onchain swaps, we can't really cancel them once submitted
          // We can only mark them as cancelled in our tracking
          // In a real implementation, you might try to:
          // 1. Cancel pending transactions if they haven't been confirmed
          // 2. Submit cancel transactions for DEX limit orders
          // 3. Handle different cancellation strategies per DEX

          // Mark as cancelled
          pendingTx.status = "failed";
          this.pendingTransactions.set(orderId, pendingTx);

          // Cancel any associated stop loss orders
          this.cancelStopLossByOrderId(orderId);

          this.log(`Cancelled order ${orderId}`);
          cancelResults.push(orderId);
        } catch (cancelError) {
          this.error(`Failed to cancel order ${orderId}: ${cancelError}`);
        }
      }

      this.log(
        `Successfully cancelled ${cancelResults.length}/${orderIds.length} orders`,
      );
      this.emitResponse({ requestId, data: cancelResults });
    } catch (error) {
      this.error(`Failed to cancel orders: ${error}`);
      this.emitResponse({ requestId, data: [] });
    }
  }

  private cancelStopLossByOrderId(orderId: string) {
    // Find and cancel any stop loss orders associated with this order
    for (const [stopId, stopOrder] of this.stopLossMonitors.entries()) {
      if (stopOrder.positionId === orderId) {
        stopOrder.isActive = false;
        this.stopLossMonitors.set(stopId, stopOrder);
        this.log(`Cancelled associated stop loss ${stopId}`);
      }
    }
  }

  async fetchPositionMetadata({
    requestId,
    accountId: _accountId,
    symbol: _symbol,
  }: {
    requestId: string;
    accountId: string;
    symbol: string;
  }) {
    // For onchain/wallet holdings, return simple defaults
    this.emitResponse({
      requestId,
      data: {
        leverage: 1,
        isHedged: false,
      },
    });
  }

  async setLeverage({
    requestId,
    accountId: _accountId,
    symbol: _symbol,
    leverage: _leverage,
  }: {
    requestId: string;
    accountId: string;
    symbol: string;
    leverage: number;
  }) {
    // Leverage doesn't apply to wallet holdings
    this.emitResponse({
      requestId,
      data: false,
    });
  }

  private async trackPositionTokens(positions: Position[]) {
    const uniqueTokens = new Map<string, Position>();

    // Collect unique tokens that aren't already tracked
    for (const position of positions) {
      if (
        position.tokenAddress &&
        !this.memory.public.markets[position.tokenAddress]
      ) {
        uniqueTokens.set(position.tokenAddress, position);
      }
    }

    if (uniqueTokens.size === 0) {
      return; // No new tokens to track
    }

    this.log(`Auto-tracking ${uniqueTokens.size} position tokens`);

    // Add each token to tracking in parallel
    const trackingPromises = Array.from(uniqueTokens.values()).map((position) =>
      this.addTokenToTracking({
        requestId: `auto-track-${position.tokenAddress}`,
        tokenAddress: position.tokenAddress!,
        chain: position.chainType!,
        networkName: position.networkName!,
        codexNetworkId: position.networkId!,
      }).catch((error) =>
        this.error(`Failed to track token ${position.tokenAddress}: ${error}`),
      ),
    );

    await Promise.all(trackingPromises);
    this.log(`Completed auto-tracking for ${uniqueTokens.size} tokens`);
  }

  async addTokenToTracking({
    requestId,
    tokenAddress,
    chain,
    networkName,
    codexNetworkId,
  }: {
    requestId: string;
    tokenAddress: string;
    chain: ChainType;
    networkName: string;
    codexNetworkId: number;
  }) {
    try {
      if (!this.codexSdk) {
        this.error("No Codex SDK available");
        this.emitResponse({ requestId, data: false });
        return;
      }

      // Check if token is already being tracked
      if (this.memory.public.markets[tokenAddress]) {
        this.emitResponse({ requestId, data: true });
        return;
      }

      // Fetch token data
      const tokenData = await fetchTokenData({
        phrase: tokenAddress,
        chainType: chain,
        chains: this.lifiChains,
        codexSDK: this.codexSdk,
        codexNetworkId,
        native: false,
        networkName,
      });

      if (!tokenData) {
        this.error(`Could not fetch data for token ${tokenAddress}`);
        this.emitResponse({ requestId, data: false });
        return;
      }

      // Merge with existing markets and tickers
      const updatedMarkets = {
        ...this.memory.public.markets,
      };
      updatedMarkets[tokenData.market.id] = tokenData.market;

      const updatedTickers = {
        ...this.memory.public.tickers,
      };
      updatedTickers[tokenData.ticker.id] = tokenData.ticker;

      // Update the store
      this.emitChanges([
        { type: "update", path: "public.markets", value: updatedMarkets },
        { type: "update", path: "public.tickers", value: updatedTickers },
      ]);

      this.log(`Successfully added token ${tokenAddress} to tracking`);
      this.emitResponse({ requestId, data: true });
    } catch (error) {
      this.error(`Error adding token to tracking: ${error}`);
      this.emitResponse({ requestId, data: false });
    }
  }
}

new OnchainWorker({
  name: ExchangeName.ONCHAIN,
  config: DEFAULT_CONFIG[ExchangeName.ONCHAIN],
  parent: self,
});
