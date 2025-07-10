import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { RECV_WINDOW } from "./binance.config";

import { stringify } from "~/utils/query-string.utils";
import { type Request, request } from "~/utils/request.utils";
import { uint8ArrayToHex } from "~/utils/uint8.utils";
import { binanceRateLimiter } from "~/utils/rate-limiter.utils";
import { retry } from "~/utils/retry.utils";

export const binanceWebsocketAuth = async ({
  key,
  secret,
}: {
  key: string;
  secret: string;
}) => {
  const timestamp = new Date().getTime();
  const signature = hmac(sha256, secret, `${timestamp}`);
  return [key, timestamp.toString(), uint8ArrayToHex(signature)];
};

// Cache for signatures to avoid recalculation
const signatureCache = new Map<
  string,
  { signature: string; timestamp: number }
>();
const SIGNATURE_CACHE_TTL = 5000; // 5 seconds

export const binance = async <T>(
  req: Omit<Request, "method"> & {
    key: string;
    secret: string;
    method?: "GET" | "POST" | "DELETE";
    skipRateLimit?: boolean;
  },
) => {
  // Apply rate limiting unless explicitly skipped
  if (!req.skipRateLimit) {
    await binanceRateLimiter.acquire();
  }

  // Wrap the request in retry logic
  return retry(async () => {
    const timestamp = new Date().getTime();

    // Prepare query parameters including auth params
    const params = {
      ...req.params,
      timestamp,
      recvWindow: RECV_WINDOW,
    };

    // Create signature string from query parameters
    const queryString = stringify(params);

    // Check cache for recent signature with same params
    const cacheKey = `${req.key}:${queryString}`;
    const cached = signatureCache.get(cacheKey);

    let signature: string;
    if (cached && timestamp - cached.timestamp < SIGNATURE_CACHE_TTL) {
      signature = cached.signature;
    } else {
      const signatureBytes = hmac(sha256, req.secret, queryString);
      signature = uint8ArrayToHex(signatureBytes);
      signatureCache.set(cacheKey, { signature, timestamp });

      // Clean up old cache entries
      if (signatureCache.size > 100) {
        const cutoff = timestamp - SIGNATURE_CACHE_TTL;
        for (const [key, value] of signatureCache) {
          if (value.timestamp < cutoff) {
            signatureCache.delete(key);
          }
        }
      }
    }

    // Add signature to params
    const finalParams = {
      ...params,
      signature,
    };

    const headers = {
      "X-MBX-APIKEY": req.key,
      "Content-Type": "application/json; charset=utf-8",
    };

    return request<T>({
      ...req,
      method: req.method === "DELETE" ? "POST" : req.method,
      params: finalParams,
      headers,
    });
  }, 3); // Retry up to 3 times
};
