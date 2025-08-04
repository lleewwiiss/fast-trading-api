import { retry } from "./retry.utils";
import { stringify } from "./query-string.utils";

export type Request = {
  url: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
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

export const request = async <T>(req: Request) => {
  return retry(async () => {
    const url = req.params ? `${req.url}?${stringify(req.params)}` : req.url;

    try {
      const response = await fetch(url, {
        method: req.method ?? "GET",
        body: req.body ? JSON.stringify(req.body) : undefined,
        headers: {
          "content-type": "application/json",
          ...(req.headers || {}),
        },
      });

      // Check if response is ok
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP ${response.status} ${response.statusText}: ${errorText}`,
        );
      }

      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          `Expected JSON response but got ${contentType}: ${text}`,
        );
      }

      return response.json() as Promise<T>;
    } catch (error: any) {
      // Enhance error with more context
      if (error.message && error.message.includes("Failed to fetch")) {
        throw new Error(
          `Network error fetching ${url}: ${error.message}. This might be a CORS issue if running in browser.`,
        );
      }
      throw error;
    }
  }, req.retries ?? 0);
};
