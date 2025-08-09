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

  if (!corsProxy || !corsProxy.enabled) {
    return url;
  }

  // If useLocalProxy is true, use the local Next.js proxy
  if (corsProxy.useLocalProxy) {
    // Store the original URL to be sent in the request body
    // This will be handled by the request utility
    return "/api/proxy";
  }

  // If no baseUrl specified, return original URL
  if (!corsProxy.baseUrl) {
    return url;
  }

  // Different CORS proxies expect different formats
  // allorigins.win expects URL-encoded URLs
  // cors.lol expects unencoded URLs with url= parameter
  // corsproxy.io expects unencoded URLs
  if (corsProxy.baseUrl.includes("allorigins")) {
    return `${corsProxy.baseUrl}${encodeURIComponent(url)}`;
  }

  // Default: return unencoded URL (works for cors.lol and corsproxy.io)
  return `${corsProxy.baseUrl}${url}`;
}

/**
 * Automatically determines if CORS proxy should be used based on environment
 * @param url - The original URL
 * @param config - Exchange configuration
 * @returns The appropriate URL (proxied if proxy enabled, original otherwise)
 */
export function getApiUrl(url: string, config: ExchangeConfig): string {
  return getProxiedUrl(url, config);
}

/**
 * Checks if using local proxy
 * @param config - Exchange configuration
 * @returns True if using local proxy
 */
export function isUsingLocalProxy(config: ExchangeConfig): boolean {
  const corsProxy = config.options?.corsProxy;
  return !!(corsProxy?.enabled && corsProxy?.useLocalProxy);
}
