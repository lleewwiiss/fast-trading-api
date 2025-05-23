import { describe, expect, test } from "bun:test";
import { privateKeyToAccount } from "viem/accounts";

import { signTypedData } from "./eip712.utils";

describe("eip712.utils", () => {
  const testPrivateKey =
    "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const testAccount = privateKeyToAccount(testPrivateKey);

  const testDomain = {
    name: "Test DApp",
    version: "1",
    chainId: 1,
    verifyingContract: "0x1234567890123456789012345678901234567890",
  } as const;

  // Helper function to check if signatures match (allowing for recovery ID differences)
  const expectSignaturesMatch = (ourSig: any, viemSig: string) => {
    const viemR = viemSig.slice(0, 66);
    const viemS = "0x" + viemSig.slice(66, 130);
    const viemV = parseInt(viemSig.slice(130), 16);

    // R and S values should be identical
    expect(ourSig.r).toBe(viemR);
    expect(ourSig.s).toBe(viemS);
    expect(ourSig.v).toBe(viemV);
  };

  describe("signTypedData", () => {
    test("should sign basic typed data and match viem signature", async () => {
      const types = {
        Message: [
          { name: "content", type: "string" },
          { name: "timestamp", type: "bytes32" },
        ],
      };

      const message = {
        content: "Hello World",
        timestamp:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
      };

      // Our implementation
      const ourSignature = await signTypedData({
        privateKey: testPrivateKey,
        domain: testDomain,
        types,
        message,
      });

      // Viem implementation
      const viemSignature = await testAccount.signTypedData({
        domain: testDomain,
        types,
        primaryType: "Message",
        message,
      });

      expectSignaturesMatch(ourSignature, viemSignature);
    });

    test("should handle string-only message types", async () => {
      const types = {
        SimpleMessage: [{ name: "text", type: "string" }],
      };

      const message = {
        text: "Simple test message",
      };

      const ourSignature = await signTypedData({
        privateKey: testPrivateKey,
        domain: testDomain,
        types,
        message,
      });

      const viemSignature = await testAccount.signTypedData({
        domain: testDomain,
        types,
        primaryType: "SimpleMessage",
        message,
      });

      expectSignaturesMatch(ourSignature, viemSignature);
    });

    test("should handle bytes32-only message types", async () => {
      const types = {
        HashMessage: [{ name: "hash", type: "bytes32" }],
      };

      const message = {
        hash: "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      };

      const ourSignature = await signTypedData({
        privateKey: testPrivateKey,
        domain: testDomain,
        types,
        message,
      });

      const viemSignature = await testAccount.signTypedData({
        domain: testDomain,
        types,
        primaryType: "HashMessage",
        message,
      });

      expectSignaturesMatch(ourSignature, viemSignature);
    });

    test("should handle different domain configurations", async () => {
      const alternativeDomain = {
        name: "Alternative DApp",
        version: "2.0",
        chainId: 137, // Polygon
        verifyingContract: "0xabcdef1234567890abcdef1234567890abcdef12",
      } as const;

      const types = {
        Transfer: [
          { name: "to", type: "string" },
          { name: "amount", type: "string" },
        ],
      };

      const message = {
        to: "0x1234567890123456789012345678901234567890",
        amount: "1000000000000000000",
      };

      const ourSignature = await signTypedData({
        privateKey: testPrivateKey,
        domain: alternativeDomain,
        types,
        message,
      });

      const viemSignature = await testAccount.signTypedData({
        domain: alternativeDomain,
        types,
        primaryType: "Transfer",
        message,
      });

      expectSignaturesMatch(ourSignature, viemSignature);
    });

    test("should handle complex message with multiple fields", async () => {
      const types = {
        ComplexMessage: [
          { name: "user", type: "string" },
          { name: "action", type: "string" },
          { name: "nonce", type: "bytes32" },
          { name: "deadline", type: "bytes32" },
        ],
      };

      const message = {
        user: "alice@example.com",
        action: "transfer_tokens",
        nonce:
          "0x0000000000000000000000000000000000000000000000000000000000000042",
        deadline:
          "0x0000000000000000000000000000000000000000000000000000000000ffffff",
      };

      const ourSignature = await signTypedData({
        privateKey: testPrivateKey,
        domain: testDomain,
        types,
        message,
      });

      const viemSignature = await testAccount.signTypedData({
        domain: testDomain,
        types,
        primaryType: "ComplexMessage",
        message,
      });

      expectSignaturesMatch(ourSignature, viemSignature);
    });

    test("should handle empty string values", async () => {
      const types = {
        EmptyMessage: [
          { name: "empty", type: "string" },
          { name: "content", type: "string" },
        ],
      };

      const message = {
        empty: "",
        content: "not empty",
      };

      const ourSignature = await signTypedData({
        privateKey: testPrivateKey,
        domain: testDomain,
        types,
        message,
      });

      const viemSignature = await testAccount.signTypedData({
        domain: testDomain,
        types,
        primaryType: "EmptyMessage",
        message,
      });

      expectSignaturesMatch(ourSignature, viemSignature);
    });

    test("should handle different private keys", async () => {
      const alternativePrivateKey =
        "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
      const alternativeAccount = privateKeyToAccount(alternativePrivateKey);

      const types = {
        TestMessage: [{ name: "data", type: "string" }],
      };

      const message = {
        data: "test with different key",
      };

      const ourSignature = await signTypedData({
        privateKey: alternativePrivateKey,
        domain: testDomain,
        types,
        message,
      });

      const viemSignature = await alternativeAccount.signTypedData({
        domain: testDomain,
        types,
        primaryType: "TestMessage",
        message,
      });

      expectSignaturesMatch(ourSignature, viemSignature);
    });

    test("should throw error when types object is empty", async () => {
      const types = {};
      const message = {};

      await expect(
        signTypedData({
          privateKey: testPrivateKey,
          domain: testDomain,
          types,
          message,
        }),
      ).rejects.toThrow("No types defined in types object");
    });

    test("should handle zero bytes32 values", async () => {
      const types = {
        ZeroMessage: [
          { name: "zero", type: "bytes32" },
          { name: "text", type: "string" },
        ],
      };

      const message = {
        zero: "0x0000000000000000000000000000000000000000000000000000000000000000",
        text: "zero test",
      };

      const ourSignature = await signTypedData({
        privateKey: testPrivateKey,
        domain: testDomain,
        types,
        message,
      });

      const viemSignature = await testAccount.signTypedData({
        domain: testDomain,
        types,
        primaryType: "ZeroMessage",
        message,
      });

      expectSignaturesMatch(ourSignature, viemSignature);
    });
  });

  describe("signature format validation", () => {
    test("should return valid signature format", async () => {
      const types = {
        TestMessage: [{ name: "content", type: "string" }],
      };

      const message = {
        content: "test",
      };

      const signature = await signTypedData({
        privateKey: testPrivateKey,
        domain: testDomain,
        types,
        message,
      });

      // Check signature format
      expect(signature.r).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(signature.s).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(signature.v).toBeOneOf([27, 28]);
    });

    test("should produce deterministic signatures", async () => {
      const types = {
        TestMessage: [{ name: "content", type: "string" }],
      };

      const message = {
        content: "deterministic test",
      };

      const signature1 = await signTypedData({
        privateKey: testPrivateKey,
        domain: testDomain,
        types,
        message,
      });

      const signature2 = await signTypedData({
        privateKey: testPrivateKey,
        domain: testDomain,
        types,
        message,
      });

      expect(signature1.r).toBe(signature2.r);
      expect(signature1.s).toBe(signature2.s);
      expect(signature1.v).toBe(signature2.v);
    });
  });
});
