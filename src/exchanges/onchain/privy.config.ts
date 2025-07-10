export const PRIVY_CONFIG = {
  appId: process.env.PRIVY_APP_ID,
  appSecret: process.env.PRIVY_APP_SECRET,
  verificationKey: process.env.PRIVY_VERIFICATION_KEY,
  // Session signer configurations
  sessionTimeout: 3600000, // 1 hour
  maxRetries: 3,
  retryDelay: 1000,
};
