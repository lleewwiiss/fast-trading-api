import { createHMAC, createSHA256 } from "hash-wasm";

import { BROKER_ID, RECV_WINDOW } from "./bybit.config";

import { stringify } from "~/utils/query-string.utils";
import { type Request, request } from "~/utils/request.utils";

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

export const bybit = async <T>(
  req: Request & { key: string; secret: string },
) => {
  const hmac = await createHMAC(createSHA256(), req.secret);

  const timestamp = new Date().getTime();
  const signature = hmac
    .init()
    .update(
      [
        timestamp,
        req.key,
        RECV_WINDOW,
        req.params ? stringify(req.params) : "",
        req.body ? JSON.stringify(req.body) : "",
      ].join(""),
    )
    .digest("hex");

  const headers = {
    "X-BAPI-SIGN": signature,
    "X-BAPI-API-KEY": req.key,
    "X-BAPI-TIMESTAMP": `${timestamp}`,
    "X-BAPI-RECV-WINDOW": `${RECV_WINDOW}`,
    "X-Referer": BROKER_ID,
  };

  return request<T>({ ...req, headers });
};
