import { keccak_256 } from "@noble/hashes/sha3.js";
import { secp256k1 } from "@noble/curves/secp256k1";

import {
  compareUint8Arrays,
  hexToUint8Array,
  stringToUint8Array,
} from "./uint8.utils";

const FINAL_MESSAGE_PREFIX = stringToUint8Array("\x19\x01");

type Domain = {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
};

const hashDomain = (domain: Domain) => {
  // For EIP-712, we need to construct the domain type string
  const domainType =
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
  const domainTypeHash = keccak_256(stringToUint8Array(domainType));
  const domainTypeHashBytes = hexToUint8Array(
    Buffer.from(domainTypeHash).toString("hex"),
  );

  // Hash domain name
  const nameHash = keccak_256(stringToUint8Array(domain.name));
  const nameHashBytes = hexToUint8Array(Buffer.from(nameHash).toString("hex"));

  // Hash domain version
  const versionHash = keccak_256(stringToUint8Array(domain.version));
  const versionHashBytes = hexToUint8Array(
    Buffer.from(versionHash).toString("hex"),
  );

  // Encode chainId as uint256 (32 bytes)
  const chainIdBytes = new Uint8Array(32);
  const chainIdView = new DataView(chainIdBytes.buffer);
  chainIdView.setBigUint64(24, BigInt(domain.chainId)); // Put chainId in the last 8 bytes

  // Convert verifyingContract address to bytes
  const contractBytes = hexToUint8Array(domain.verifyingContract.slice(2)); // Remove 0x
  const contractPadded = new Uint8Array(32);
  contractPadded.set(contractBytes, 12); // Pad to 32 bytes (addresses are 20 bytes)

  const encoded = new Uint8Array([
    ...domainTypeHashBytes,
    ...nameHashBytes,
    ...versionHashBytes,
    ...chainIdBytes,
    ...contractPadded,
  ]);

  return Buffer.from(keccak_256(encoded)).toString("hex");
};

// Helper function to encode a single type
const encodeType = (
  primaryType: string,
  types: Record<string, Array<{ name: string; type: string }>>,
) => {
  const typeFields = types[primaryType];

  if (!typeFields) {
    throw new Error(`Type ${primaryType} not found in types`);
  }

  let result = primaryType + "(";
  result += typeFields.map((field) => `${field.type} ${field.name}`).join(",");
  result += ")";
  return result;
};

// Helper function to hash a type
const hashType = (
  primaryType: string,
  types: Record<string, Array<{ name: string; type: string }>>,
) => {
  const encoded = encodeType(primaryType, types);
  return Buffer.from(keccak_256(stringToUint8Array(encoded))).toString("hex");
};

const encodeData = (
  primaryType: string,
  data: any,
  types: Record<string, Array<{ name: string; type: string }>>,
) => {
  const typeHash = hashType(primaryType, types);
  const typeHashBytes = hexToUint8Array(typeHash);

  let encoded = new Uint8Array(typeHashBytes);

  const typeFields = types[primaryType];
  if (!typeFields) {
    throw new Error(`Type ${primaryType} not found in types`);
  }

  for (const field of typeFields) {
    const value = data[field.name];

    if (field.type === "string") {
      const stringBytes = stringToUint8Array(value);
      const stringHash = keccak_256(stringBytes);
      const stringHashBytes = hexToUint8Array(
        Buffer.from(stringHash).toString("hex"),
      );
      encoded = new Uint8Array([...encoded, ...stringHashBytes]);
    } else if (field.type === "bytes32") {
      const bytes32 = hexToUint8Array(value.slice(2)); // Remove 0x prefix
      encoded = new Uint8Array([...encoded, ...bytes32]);
    }
  }

  return encoded;
};

export const signTypedData = async ({
  privateKey,
  domain,
  types,
  message,
}: {
  privateKey: string;
  domain: Domain;
  types: Record<string, any>;
  message: Record<string, any>;
}) => {
  // Auto-detect the primary type from the types object
  const [primaryType] = Object.keys(types);
  if (!primaryType) throw new Error("No types defined in types object");

  // 1. Hash the domain separator
  const domainSeparator = hashDomain(domain);
  const domainSeparatorBytes = hexToUint8Array(domainSeparator);

  // 2. Hash the struct data
  const encodedData = encodeData(primaryType, message, types);
  const structHash = keccak_256(encodedData);
  const structHashBytes = hexToUint8Array(
    Buffer.from(structHash).toString("hex"),
  );

  // 3. Create the final message hash according to EIP-712
  const finalMessage = new Uint8Array([
    ...FINAL_MESSAGE_PREFIX,
    ...domainSeparatorBytes,
    ...structHashBytes,
  ]);
  const messageHash = keccak_256(finalMessage);

  // 4. Sign the hash with @noble/curves
  const privateKeyBytes = hexToUint8Array(privateKey.slice(2));
  const messageHashBytes = hexToUint8Array(
    Buffer.from(messageHash).toString("hex"),
  );

  // Get the public key from private key for recovery ID calculation
  const publicKey = secp256k1.getPublicKey(privateKeyBytes);
  if (!publicKey) {
    throw new Error("Invalid private key");
  }

  const signature = secp256k1.sign(messageHashBytes, privateKeyBytes);

  // 5. Calculate the correct recovery ID
  let recovery = -1;

  // Try recovery IDs 0 and 1 to find which one recovers to the correct public key
  for (let i = 0; i < 2; i++) {
    try {
      // Create signature with recovery bit for testing
      const sigWithRecovery = signature.addRecoveryBit(i);
      const recoveredPubKey =
        sigWithRecovery.recoverPublicKey(messageHashBytes);

      if (
        recoveredPubKey &&
        compareUint8Arrays(publicKey, recoveredPubKey.toRawBytes(true))
      ) {
        recovery = i;
        break;
      }
    } catch {
      // Continue to next recovery ID if this one fails
      continue;
    }
  }

  if (recovery === -1) {
    throw new Error("Unable to determine recovery ID");
  }

  // 6. Convert to Ethereum signature format (r,s,v)
  // Get r and s from the signature object
  const r = `0x${signature.r.toString(16).padStart(64, "0")}`;
  const s = `0x${signature.s.toString(16).padStart(64, "0")}`;

  // Ethereum uses v = 27 + recovery
  const v = recovery + 27;

  return { r, s, v };
};
