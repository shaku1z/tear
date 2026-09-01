import { describe, expect, it } from "vitest";

import { canonicalStringify, stableVerificationHash } from "../../src/replay/hash";

function hashCanonicalText(canonical: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < canonical.length; index += 1) {
    const codeUnit = canonical.charCodeAt(index);
    hash ^= BigInt(codeUnit & 0xff);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
    hash ^= BigInt(codeUnit >>> 8);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

describe("stable verification hash", () => {
  it("matches the materialized canonical encoding without allocating that full encoding", () => {
    const sparse = new Array<unknown>(4);
    sparse[1] = "present";
    sparse[3] = null;
    const values: readonly unknown[] = [
      null, true, false, 0, -0, 1.25, 1e30,
      "plain", "quote\"slash\\", "\b\t\n\f\r\u0000\u001f", "\u2028\u2029", "emoji 💧", "lone \ud800 \udfff",
      sparse,
      { z: [3, 2, 1], a: { nested: "value", controls: "\u0001" }, unicode: "🌸" },
      { payload: "encoded-like-value/with+base64=".repeat(4_096) },
    ];

    for (const value of values) {
      expect(stableVerificationHash(value)).toBe(hashCanonicalText(canonicalStringify(value)));
    }
  });

  it("preserves canonical validation failures", () => {
    expect(() => stableVerificationHash({ bad: Number.NaN })).toThrow("$.bad contains a non-finite number");
    expect(() => stableVerificationHash({ bad: undefined })).toThrow("$.bad is undefined");
    expect(() => stableVerificationHash({ bad: () => undefined })).toThrow("$.bad is not canonical JSON data");
    expect(() => stableVerificationHash({ nested: [{ bad: Number.POSITIVE_INFINITY }] }))
      .toThrow("$.nested[0].bad contains a non-finite number");
  });
});
