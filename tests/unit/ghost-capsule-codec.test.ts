import { describe, expect, it } from "vitest";

describe("strict measured Ghost archive decoding", () => {
  it("reports actual identity byte counts while keeping forensic replacement decoding unchanged", async () => {
    const bytes = new Uint8Array([34, 255, 34]), encoded = btoa(String.fromCharCode(...bytes));
    await expect(GHOST_CHUNK_CODECS.decode("utf8-base64-v1", encoded)).resolves.toBe("\ufffd");
    await expect(GHOST_CHUNK_CODECS.decodeMeasured("utf8-base64-v1", encoded, 3, 3)).rejects.toThrow();
    await expect(GHOST_CHUNK_CODECS.decodeMeasured("utf8-base64-v1", btoa("[]"), 2, 2)).resolves.toEqual({ value: [], compressedBytes: 2, decodedBytes: 2 });
  });
  it("enforces compressed and expanded byte bounds with the existing gzip codec", async () => {
    const encoded = await GHOST_CHUNK_CODECS.encode([{ text: "repeat".repeat(1000) }]);
    expect(encoded.encoding).toBe("gzip-base64-v1");
    const measured = await GHOST_CHUNK_CODECS.decodeMeasured(encoded.encoding, encoded.encoded, encoded.compressedBytes, encoded.uncompressedBytes);
    expect(measured.compressedBytes).toBe(encoded.compressedBytes); expect(measured.decodedBytes).toBe(encoded.uncompressedBytes);
    await expect(GHOST_CHUNK_CODECS.decodeMeasured(encoded.encoding, encoded.encoded, encoded.compressedBytes - 1, encoded.uncompressedBytes)).rejects.toThrow(/compressed/);
    await expect(GHOST_CHUNK_CODECS.decodeMeasured(encoded.encoding, encoded.encoded, encoded.compressedBytes, 10)).rejects.toThrow(/decoded/);
  });
});
import {
  decodeGhostChunkPayload,
  encodeGhostChunkPayload,
  encodeGhostChunkPayloadCompressed,
  GHOST_CHUNK_CODECS,
} from "../../src/ghost/capsule-codec";

describe("Ghost capsule codec registry", () => {
  it("preserves the legacy decoder and the explicit v1 identity codec", async () => {
    const value = { track: "commands", entries: [{ tick: 1, action: "move" }] };
    const encoded = encodeGhostChunkPayload(value);

    expect(encoded.encoding).toBe("utf8-base64-v1");
    await expect(decodeGhostChunkPayload(encoded.encoding, encoded.encoded)).resolves.toEqual(value);
    await expect(decodeGhostChunkPayload("utf8-base64", encoded.encoded)).resolves.toEqual(value);
    expect(GHOST_CHUNK_CODECS.list()).toEqual(expect.arrayContaining([
      { encoding: "utf8-base64", version: 0 },
      { encoding: "utf8-base64-v1", version: 1 },
      { encoding: "gzip-base64-v1", version: 1 },
    ]));
  });

  it("uses gzip for compressible payloads and round-trips through the registry", async () => {
    const value = Array.from({ length: 256 }, (_, tick) => ({ tick, state: "repeated-state-value" }));
    const encoded = await encodeGhostChunkPayloadCompressed(value);

    expect(encoded.encoding).toBe("gzip-base64-v1");
    expect(encoded.compressedBytes).toBeLessThan(encoded.uncompressedBytes);
    await expect(decodeGhostChunkPayload(encoded.encoding, encoded.encoded)).resolves.toEqual(value);
  });

  it("fails closed for codecs outside the allowlisted registry", async () => {
    await expect(decodeGhostChunkPayload("executable-javascript", "AA=="))
      .rejects.toThrow("unsupported Ghost chunk encoding");
  });

  it("halts decompression when output exceeds the caller's declared ceiling", async () => {
    const value = Array.from({ length: 512 }, () => "highly-compressible-capsule-value");
    const encoded = await encodeGhostChunkPayloadCompressed(value);
    expect(encoded.encoding).toBe("gzip-base64-v1");

    await expect(decodeGhostChunkPayload(encoded.encoding, encoded.encoded, 64))
      .rejects.toThrow("decoded byte limit");
  });
});
