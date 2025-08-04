import { ONCHAIN_CONFIG } from "./onchain.config";

export const PRIVY_CONFIG = {
  appId: ONCHAIN_CONFIG.options?.privyAppId || "",
  appSecret: ONCHAIN_CONFIG.options?.privyAppSecret || "",
  verificationKey: ONCHAIN_CONFIG.options?.privyVerificationKey || "",
  // Session signer configurations
  sessionTimeout: 3600000, // 1 hour
  maxRetries: 3,
  retryDelay: 1000,
};
