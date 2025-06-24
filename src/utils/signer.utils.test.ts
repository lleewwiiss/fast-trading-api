import { describe, expect, test } from "bun:test";

import {
  generateHLActionHash,
  signHLAction,
  HL_DOMAIN,
  HL_TYPES,
} from "./signer.utils";

describe("signer.utils", () => {
  describe("generateHLActionHash", () => {
    test("should generate consistent hash for basic action", () => {
      const action = { type: "order", symbol: "ETH", side: "buy" };
      const nonce = 123456;

      const hash1 = generateHLActionHash({ action, nonce });
      const hash2 = generateHLActionHash({ action, nonce });

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    test("should generate different hashes for different actions", () => {
      const action1 = { type: "order", symbol: "ETH", side: "buy" };
      const action2 = { type: "order", symbol: "BTC", side: "buy" };
      const nonce = 123456;

      const hash1 = generateHLActionHash({ action: action1, nonce });
      const hash2 = generateHLActionHash({ action: action2, nonce });

      expect(hash1).not.toBe(hash2);
    });

    test("should generate different hashes for different nonces", () => {
      const action = { type: "order", symbol: "ETH", side: "buy" };

      const hash1 = generateHLActionHash({ action, nonce: 123456 });
      const hash2 = generateHLActionHash({ action, nonce: 654321 });

      expect(hash1).not.toBe(hash2);
    });

    test("should handle vault address parameter", () => {
      const action = { type: "order", symbol: "ETH", side: "buy" };
      const nonce = 123456;
      const vaultAddress = "0x1234567890123456789012345678901234567890";

      const hashWithoutVault = generateHLActionHash({ action, nonce });
      const hashWithVault = generateHLActionHash({
        action,
        nonce,
        vaultAddress,
      });

      expect(hashWithoutVault).not.toBe(hashWithVault);
      expect(hashWithVault).toMatch(/^0x[a-f0-9]{64}$/);
    });

    test("should handle expiresAfter parameter", () => {
      const action = { type: "order", symbol: "ETH", side: "buy" };
      const nonce = 123456;
      const expiresAfter = Date.now() + 60000; // 1 minute from now

      const hashWithoutExpiry = generateHLActionHash({ action, nonce });
      const hashWithExpiry = generateHLActionHash({
        action,
        nonce,
        expiresAfter,
      });

      expect(hashWithoutExpiry).not.toBe(hashWithExpiry);
      expect(hashWithExpiry).toMatch(/^0x[a-f0-9]{64}$/);
    });

    test("should handle both vault address and expiresAfter", () => {
      const action = { type: "order", symbol: "ETH", side: "buy" };
      const nonce = 123456;
      const vaultAddress = "0x1234567890123456789012345678901234567890";
      const expiresAfter = Date.now() + 60000;

      const hash = generateHLActionHash({
        action,
        nonce,
        vaultAddress,
        expiresAfter,
      });

      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    test("should handle complex action objects", () => {
      const complexAction = {
        type: "order",
        symbol: "ETH-USD",
        side: "buy",
        amount: 1.5,
        price: 2000.5,
        nested: {
          property: "value",
          array: [1, 2, 3],
        },
      };
      const nonce = 123456;

      const hash = generateHLActionHash({ action: complexAction, nonce });
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    test("should handle large nonce values", () => {
      const action = { type: "order" };
      const largeNonce = Number.MAX_SAFE_INTEGER;

      const hash = generateHLActionHash({ action, nonce: largeNonce });
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe("signHLAction", () => {
    const testPrivateKey =
      "0x1234567890123456789012345678901234567890123456789012345678901234";
    const testAction = { type: "order", symbol: "ETH", side: "buy" };
    const testNonce = 123456;

    test("should return a valid signature object", async () => {
      const signature = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
      });

      expect(signature).toHaveProperty("r");
      expect(signature).toHaveProperty("s");
      expect(signature).toHaveProperty("v");
      expect(signature.r).toMatch(/^0x[a-f0-9]{64}$/);
      expect(signature.s).toMatch(/^0x[a-f0-9]{64}$/);
      expect(typeof signature.v).toBe("number");
      expect(signature.v).toBeGreaterThanOrEqual(27);
      expect(signature.v).toBeLessThanOrEqual(28);
    });

    test("should generate consistent signatures for same inputs", async () => {
      const sig1 = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
      });

      const sig2 = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
      });

      expect(sig1.r).toBe(sig2.r);
      expect(sig1.s).toBe(sig2.s);
      expect(sig1.v).toBe(sig2.v);
    });

    test("should generate different signatures for different private keys", async () => {
      const privateKey2 =
        "0x9876543210987654321098765432109876543210987654321098765432109876";

      const sig1 = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
      });

      const sig2 = await signHLAction({
        privateKey: privateKey2,
        action: testAction,
        nonce: testNonce,
      });

      expect(sig1.r).not.toBe(sig2.r);
      expect(sig1.s).not.toBe(sig2.s);
      // v could be the same or different depending on recovery
    });

    test("should generate different signatures for different actions", async () => {
      const action2 = { type: "order", symbol: "BTC", side: "sell" };

      const sig1 = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
      });

      const sig2 = await signHLAction({
        privateKey: testPrivateKey,
        action: action2,
        nonce: testNonce,
      });

      expect(sig1.r).not.toBe(sig2.r);
      expect(sig1.s).not.toBe(sig2.s);
      // v could be the same or different depending on recovery
    });

    test("should handle vault address parameter", async () => {
      const vaultAddress = "0x1234567890123456789012345678901234567890";

      const sigWithoutVault = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
      });

      const sigWithVault = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
        vaultAddress,
      });

      expect(sigWithoutVault.r).not.toBe(sigWithVault.r);
      expect(sigWithoutVault.s).not.toBe(sigWithVault.s);
      expect(sigWithVault.r).toMatch(/^0x[a-f0-9]{64}$/);
      expect(sigWithVault.s).toMatch(/^0x[a-f0-9]{64}$/);
      expect(typeof sigWithVault.v).toBe("number");
    });

    test("should handle testnet parameter", async () => {
      const sigMainnet = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
        isTestnet: false,
      });

      const sigTestnet = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
        isTestnet: true,
      });

      expect(sigMainnet.r).not.toBe(sigTestnet.r);
      expect(sigMainnet.s).not.toBe(sigTestnet.s);
      expect(sigTestnet.r).toMatch(/^0x[a-f0-9]{64}$/);
      expect(sigTestnet.s).toMatch(/^0x[a-f0-9]{64}$/);
      expect(typeof sigTestnet.v).toBe("number");
    });

    test("should use correct source for testnet vs mainnet", async () => {
      // We can't directly test the internal agent object, but we can verify
      // that different isTestnet values produce different signatures
      const sigDefault = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
      });

      const sigMainnet = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
        isTestnet: false,
      });

      const sigTestnet = await signHLAction({
        privateKey: testPrivateKey,
        action: testAction,
        nonce: testNonce,
        isTestnet: true,
      });

      // Default should be same as mainnet (isTestnet defaults to false/undefined)
      expect(sigDefault.r).toBe(sigMainnet.r);
      expect(sigDefault.s).toBe(sigMainnet.s);
      expect(sigDefault.v).toBe(sigMainnet.v);

      expect(sigTestnet.r).not.toBe(sigMainnet.r);
      expect(sigTestnet.s).not.toBe(sigMainnet.s);
    });
  });

  describe("constants", () => {
    test("should have correct HL_DOMAIN structure", () => {
      expect(HL_DOMAIN).toEqual({
        name: "Exchange",
        version: "1",
        chainId: 1337,
        verifyingContract: "0x0000000000000000000000000000000000000000",
      });
    });

    test("should have correct HL_TYPES structure", () => {
      expect(HL_TYPES).toEqual({
        Agent: [
          { name: "source", type: "string" },
          { name: "connectionId", type: "bytes32" },
        ],
      });
    });
  });
});
