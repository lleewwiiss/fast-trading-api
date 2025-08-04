import { PrivyClient } from "@privy-io/server-auth";

import { PRIVY_CONFIG } from "./privy.config";
import type { PrivyVerificationResult } from "./onchain.types";

export class PrivySessionSigner {
  private privyClient: PrivyClient;
  private sessionCache: Map<string, PrivyVerificationResult>;
  private config: any;

  constructor(config?: any) {
    // Use passed config if available, otherwise fall back to PRIVY_CONFIG
    this.config = config || PRIVY_CONFIG;
    const appId = this.config.privyAppId || PRIVY_CONFIG.appId;
    const appSecret = this.config.privyAppSecret || PRIVY_CONFIG.appSecret;

    if (!appId || !appSecret) {
      throw new Error("Privy configuration is missing required fields");
    }

    this.privyClient = new PrivyClient(appId, appSecret);
    this.sessionCache = new Map();
  }

  // Verify identity token and extract wallet info
  async verifyIdentityToken(token: string): Promise<PrivyVerificationResult> {
    try {
      // Check cache first
      const cached = this.sessionCache.get(token);
      if (cached && cached.expiresAt > Date.now()) {
        return cached;
      }

      // Verify the token with Privy
      const verificationResult = await this.privyClient.verifyAuthToken(token);

      if (!verificationResult.userId) {
        return {
          isValid: false,
          walletAddress: "",
          userId: "",
          sessionId: "",
          chainType: "EVM",
          expiresAt: 0,
          error: "Invalid token - no userId found",
        };
      }

      // Get user's wallets from Privy
      const user = await this.privyClient.getUser(verificationResult.userId);

      if (!user || !user.linkedAccounts || user.linkedAccounts.length === 0) {
        return {
          isValid: false,
          walletAddress: "",
          userId: verificationResult.userId,
          sessionId: "",
          chainType: "EVM",
          expiresAt: 0,
          error: "No linked accounts found for user",
        };
      }

      // Find the wallet account
      const walletAccount = user.linkedAccounts.find(
        (account) => account.type === "wallet",
      );

      if (!walletAccount || !walletAccount.address) {
        return {
          isValid: false,
          walletAddress: "",
          userId: verificationResult.userId,
          sessionId: "",
          chainType: "EVM",
          expiresAt: 0,
          error: "No wallet found for user",
        };
      }

      // Determine chain type based on wallet address format
      const chainType = walletAccount.address.startsWith("0x")
        ? "EVM"
        : "SOLANA";

      const result: PrivyVerificationResult = {
        isValid: true,
        walletAddress: walletAccount.address,
        userId: verificationResult.userId,
        sessionId: token.substring(0, 8), // Use first 8 chars of token as sessionId
        chainType,
        expiresAt: Date.now() + PRIVY_CONFIG.sessionTimeout,
      };

      // Cache the result
      this.sessionCache.set(token, result);

      return result;
    } catch (error) {
      return {
        isValid: false,
        walletAddress: "",
        userId: "",
        sessionId: "",
        chainType: "EVM",
        expiresAt: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Sign EVM transaction using Privy session signer
  async signEvmTransaction(
    identityToken: string,
    _walletAddress: string,
    _transaction: any,
  ): Promise<string> {
    try {
      // Verify the token is still valid
      const verification = await this.verifyIdentityToken(identityToken);
      if (!verification.isValid) {
        throw new Error(`Invalid session: ${verification.error}`);
      }

      // TODO: Implement actual Privy session signing
      // This would involve calling Privy's transaction signing API
      // For now, throw an error indicating implementation is needed
      throw new Error(
        "EVM transaction signing with Privy session signer not yet implemented",
      );
    } catch (error) {
      throw new Error(
        `Failed to sign EVM transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Sign Solana transaction using Privy session signer
  async signSolanaTransaction(
    identityToken: string,
    _walletAddress: string,
    _transaction: any,
  ): Promise<string> {
    try {
      // Verify the token is still valid
      const verification = await this.verifyIdentityToken(identityToken);
      if (!verification.isValid) {
        throw new Error(`Invalid session: ${verification.error}`);
      }

      // TODO: Implement actual Privy session signing
      // This would involve calling Privy's transaction signing API
      // For now, throw an error indicating implementation is needed
      throw new Error(
        "Solana transaction signing with Privy session signer not yet implemented",
      );
    } catch (error) {
      throw new Error(
        `Failed to sign Solana transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Validate session is still active
  async validateSession(identityToken: string): Promise<boolean> {
    try {
      const verification = await this.verifyIdentityToken(identityToken);
      return verification.isValid && verification.expiresAt > Date.now();
    } catch {
      return false;
    }
  }

  // Clear session cache for a specific token
  clearSession(identityToken: string): void {
    this.sessionCache.delete(identityToken);
  }

  // Clear all cached sessions
  clearAllSessions(): void {
    this.sessionCache.clear();
  }
}
