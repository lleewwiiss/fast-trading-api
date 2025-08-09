import { retry } from "./retry.utils";
import { stringify } from "./query-string.utils";

export type Request = {
  url: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "DELETE";
  params?: Record<string, string | number | string[] | number[]>;
  body?: Record<
    string,
    | boolean
    | string
    | number
    | string[]
    | number[]
    | Array<Record<string, any>>
    | Record<string, any>
  >;
  retries?: number;
};

export const request = async <T>(req: Request & { originalUrl?: string }) => {
  return retry(async () => {
    const isLocalProxy = req.url === "/api/proxy" && req.originalUrl;
    const targetUrl = req.originalUrl || req.url;
    const url = isLocalProxy
      ? req.url
      : req.params
        ? `${req.url}?${stringify(req.params)}`
        : req.url;

    const fetchBody = isLocalProxy
      ? JSON.stringify({
          url: req.params ? `${targetUrl}?${stringify(req.params)}` : targetUrl,
          method: req.method ?? "GET",
          headers: req.headers || {},
          body: req.body,
        })
      : req.body
        ? JSON.stringify(req.body)
        : undefined;

    const method = isLocalProxy ? "POST" : (req.method ?? "GET");
    const headers: Record<string, string> = {};

    // Only add content-type for requests with a body
    if (fetchBody) {
      headers["content-type"] = "application/json";
    }

    // Add custom headers (for non-local proxy requests)
    if (!isLocalProxy && req.headers) {
      Object.assign(headers, req.headers);
    }

    const response = await fetch(url, {
      method,
      body: fetchBody,
      headers,
    });

    // Check if response is ok
    if (!response.ok) {
      const errorText = await response.text();

      // Handle CORS proxy specific errors
      if (response.status === 403 && errorText.includes("Invalid URL format")) {
        throw new Error(
          `CORS Proxy Error (403): Invalid URL format. Check that the URL is properly formatted for the CORS proxy service. Response: ${errorText}`,
        );
      }

      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${errorText}`,
      );
    }

    // Check if response is JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(`Expected JSON response but got ${contentType}: ${text}`);
    }

    return (await response.json()) as Promise<T>;
  }, req.retries ?? 0);
};
