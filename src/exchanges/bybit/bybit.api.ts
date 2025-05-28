import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { BROKER_ID, RECV_WINDOW } from "./bybit.config";

import { stringify } from "~/utils/query-string.utils";
import { type Request, request } from "~/utils/request.utils";
import { uint8ArrayToHex } from "~/utils/uint8.utils";

export const bybitWebsocketAuth = async ({
  key,
  secret,
}: {
  key: string;
  secret: string;
}) => {
  const expires = new Date().getTime() + 10_000;
  const signature = hmac(sha256, secret, `GET/realtime${expires}`);
  return [key, expires.toFixed(0), uint8ArrayToHex(signature)];
};

export const bybit = async <T>(
  req: Request & { key: string; secret: string },
) => {
  const timestamp = new Date().getTime();
  const message = [
    timestamp,
    req.key,
    RECV_WINDOW,
    req.params ? stringify(req.params) : "",
    req.body ? JSON.stringify(req.body) : "",
  ].join("");

  const signature = hmac(sha256, req.secret, message);

  const headers = {
    "X-BAPI-SIGN": uint8ArrayToHex(signature),
    "X-BAPI-API-KEY": req.key,
    "X-BAPI-TIMESTAMP": `${timestamp}`,
    "X-BAPI-RECV-WINDOW": `${RECV_WINDOW}`,
    "X-Referer": BROKER_ID,
  };

  return request<T>({ ...req, headers });
};
