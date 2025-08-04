import type { ExchangeConfig } from "~/types/lib.types";

/**
 * Constructs a proxied URL if CORS proxy is enabled in the config
 * @param url - The original URL to proxy
 * @param config - Exchange configuration containing proxy settings
 * @returns The proxied URL if enabled, otherwise the original URL
 */
export function getProxiedUrl(url: string, config: ExchangeConfig): string {
  // Check if config has CORS proxy settings
  const corsProxy = config.options?.corsProxy;

  if (!corsProxy || !corsProxy.enabled || !corsProxy.baseUrl) {
    return url;
  }

  // URL encode the target URL for the proxy
  const encodedUrl = encodeURIComponent(url);

  // Construct the proxied URL
  return `${corsProxy.baseUrl}${encodedUrl}`;
}

/**
 * Checks if we're running in a browser environment
 * @returns true if running in browser, false if in Node.js
 */
export function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Automatically determines if CORS proxy should be used based on environment
 * @param url - The original URL
 * @param config - Exchange configuration
 * @returns The appropriate URL (proxied if browser + proxy enabled, original otherwise)
 */
export function getApiUrl(url: string, config: ExchangeConfig): string {
  // Only use proxy in browser environment
  if (!isBrowserEnvironment()) {
    return url;
  }

  return getProxiedUrl(url, config);
}
