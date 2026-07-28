export type GhostChunkEncoding = "utf8-base64";

function requireBase64Encoder(): (value: string) => string {
  if (typeof btoa !== "function") throw new Error("base64 encoding is unavailable in this runtime");
  return btoa;
}

function requireBase64Decoder(): (value: string) => string {
  if (typeof atob !== "function") throw new Error("base64 decoding is unavailable in this runtime");
  return atob;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return requireBase64Encoder()(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = requireBase64Decoder()(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** The first portable binary capsule codec; compression codecs follow this stable boundary. */
export function encodeGhostChunkPayload(payload: unknown): Readonly<{
  encoding: GhostChunkEncoding; encoded: string; compressedBytes: number; uncompressedBytes: number;
}> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const encoded = bytesToBase64(bytes);
  return Object.freeze({
    encoding: "utf8-base64",
    encoded,
    compressedBytes: new TextEncoder().encode(encoded).byteLength,
    uncompressedBytes: bytes.byteLength,
  });
}

export function decodeGhostChunkPayload(encoding: string, encoded: string): unknown {
  if (encoding !== "utf8-base64") throw new TypeError(`unsupported Ghost chunk encoding: ${encoding}`);
  return JSON.parse(new TextDecoder().decode(base64ToBytes(encoded))) as unknown;
}
