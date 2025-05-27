import { encode } from "@msgpack/msgpack";
import { keccak } from "hash-wasm";

import { signTypedData } from "~/utils/eip712.utils";
import { hexToUint8Array } from "~/utils/uint8.utils";

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

export const generateHLActionHash = async ({
  action,
  nonce,
  vaultAddress,
  expiresAfter,
}: {
  action: Record<string, any>;
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

export const signHLAction = async ({
  privateKey,
  action,
  nonce,
  vaultAddress,
  isTestnet,
}: {
  privateKey: string;
  action: Record<string, any>;
  nonce: number;
  vaultAddress?: string;
  isTestnet?: boolean;
}) => {
  const hash = await generateHLActionHash({ action, vaultAddress, nonce });
  const agent = { source: isTestnet ? "b" : "a", connectionId: hash };

  return signTypedData({
    privateKey,
    domain: HL_DOMAIN,
    types: HL_TYPES,
    message: agent,
  });
};
