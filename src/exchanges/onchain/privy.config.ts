import { ONCHAIN_CONFIG } from "./onchain.config";

export const PRIVY_CONFIG = {
  appId: (ONCHAIN_CONFIG.options?.privyAppId as string) || "",
  appSecret: (ONCHAIN_CONFIG.options?.privyAppSecret as string) || "",
  verificationKey:
    (ONCHAIN_CONFIG.options?.privyVerificationKey as string) || "",
  // Session signer configurations
  sessionTimeout: 3600000, // 1 hour
  maxRetries: 3,
  retryDelay: 1000,
};
