import { encode } from "@msgpack/msgpack";
import { keccak } from "hash-wasm";

import { signTypedData } from "~/utils/eip712.utils";
import { hexToUint8Array } from "~/utils/uint8.utils";

type Action =
  | {
      type: "order";
      orders: Array<{
        a: number;
        b: boolean;
        p: string;
        s: string;
        r: boolean;
        t:
          | { limit: { tif: "Alo" | "Ioc" | "Gtc" } }
          | {
              trigger: {
                isMarket: boolean;
                triggerPx: string;
                tpsl: "tp" | "sl";
              };
            };
      }>;
      grouping: "na" | "normalTpsl" | "positionTpsl";
      builder?: { b: string; f: number };
    }
  | {
      type: "cancel";
      cancels: Array<{
        a: number;
        o: number;
      }>;
    };

export const HL_DOMAIN = {
  name: "Exchange",
  version: "1",
  chainId: 1337,
  verifyingContract: "0x0000000000000000000000000000000000000000",
} as const;

export const HL_TYPES = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
};

const actionHash = async ({
  action,
  nonce,
  vaultAddress,
  expiresAfter,
}: {
  action: Action;
  nonce: number;
  vaultAddress?: string;
  expiresAfter?: number;
}) => {
  const actionBytes = encode(action);

  const nonceBytes = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(nonce));

  const vaultMarker = Uint8Array.of(vaultAddress ? 0x01 : 0x00);
  const vaultBytes = vaultAddress
    ? hexToUint8Array(vaultAddress.slice(2))
    : new Uint8Array();

  const expiresMarker = new Uint8Array(expiresAfter !== undefined ? 1 : 0);
  const expiresBytes = new Uint8Array(expiresAfter !== undefined ? 8 : 0);
  if (expiresAfter !== undefined) {
    new DataView(expiresBytes.buffer).setBigUint64(0, BigInt(expiresAfter));
  }

  const hash = await keccak(
    Uint8Array.from([
      ...actionBytes,
      ...nonceBytes,
      ...vaultMarker,
      ...vaultBytes,
      ...expiresMarker,
      ...expiresBytes,
    ]),
    256,
  );

  return `0x${hash}`;
};

export const signL1Action = async ({
  privateKey,
  action,
  nonce,
  vaultAddress,
  isTestnet,
}: {
  privateKey: string;
  action: Action;
  nonce: number;
  vaultAddress?: string;
  isTestnet?: boolean;
}) => {
  const hash = await actionHash({ action, vaultAddress, nonce });
  const agent = { source: isTestnet ? "b" : "a", connectionId: hash };

  return signTypedData({
    privateKey,
    domain: HL_DOMAIN,
    types: HL_TYPES,
    message: agent,
  });
};
