import { createHMAC, createSHA256 } from "hash-wasm";
import { stringify } from "qs";

import { BROKER_ID, RECV_WINDOW } from "./bybit.config";

import { retry } from "~/utils/retry.utils";

type Request = {
  key: string;
  secret: string;
  url: string;
  method?: "GET" | "POST";
  params?: Record<string, string | number | string[] | number[]>;
  body?: Record<string, string | number | string[] | number[]>;
  retries?: number;
};

export const bybitWebsocketAuth = async ({
  key,
  secret,
}: {
  key: string;
  secret: string;
}) => {
  const expires = new Date().getTime() + 10_000;
  const hmac = await createHMAC(createSHA256(), secret);
  const signature = hmac.init().update(`GET/realtime${expires}`).digest("hex");
  return [key, expires.toFixed(0), signature];
};

export const bybit = async <T>(request: Request) => {
  return retry(async () => {
    const timestamp = new Date().getTime();

    const url = request.params
      ? `${request.url}?${stringify(request.params)}`
      : request.url;

    const hmac = await createHMAC(createSHA256(), request.secret);
    const signature = hmac
      .init()
      .update(
        [
          timestamp,
          request.key,
          RECV_WINDOW,
          request.params ? stringify(request.params) : "",
          request.body ? JSON.stringify(request.body) : "",
        ].join(""),
      )
      .digest("hex");

    const response = await fetch(url, {
      method: request.method || "GET",
      body: request.body ? JSON.stringify(request.body) : undefined,
      headers: {
        "X-BAPI-SIGN": signature,
        "X-BAPI-API-KEY": request.key,
        "X-BAPI-TIMESTAMP": `${timestamp}`,
        "X-BAPI-RECV-WINDOW": `${RECV_WINDOW}`,
        "X-Referer": BROKER_ID,
      },
    });

    const json: T = await response.json();

    return json;
  }, request.retries ?? 0);
};
