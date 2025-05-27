import { describe, expect, test } from "bun:test";

import { splitSignature } from "./split-signature.utils";

describe("splitSignature", () => {
  test("should split signature", () => {
    const signature =
      "0xd25b3c96397fc6172683fb28e799ae3d1e42e04563de205c446715666e581b655c4a01e755d710b761afb0d2eaaef9d92ca7cecaa87008aac240fc51731db46a1c";

    const { r, s, v } = splitSignature(signature);

    expect(r).toBe(
      "0xd25b3c96397fc6172683fb28e799ae3d1e42e04563de205c446715666e581b65",
    );

    expect(s).toBe(
      "0x5c4a01e755d710b761afb0d2eaaef9d92ca7cecaa87008aac240fc51731db46a",
    );

    expect(v).toBe(28);
  });
});
