export type GhostChunkEncoding = "utf8-base64" | "utf8-base64-v1" | "gzip-base64-v1";

export interface GhostChunkCodecResult {
  readonly encoding: GhostChunkEncoding;
  readonly encoded: string;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
}

interface GhostChunkCodec {
  readonly encoding: GhostChunkEncoding;
  readonly version: number;
  encode(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>>;
  decode(bytes: Uint8Array, maxOutputBytes: number): Promise<Uint8Array<ArrayBuffer>>;
}

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

async function transform(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter();
  const owned = new Uint8Array(bytes);
  // Consume concurrently so the transform's writable side cannot block on
  // readable-side backpressure for a large keyframe chunk.
  const output = new Response(stream.readable).arrayBuffer();
  await writer.write(owned);
  await writer.close();
  return new Uint8Array(await output);
}

const identity = (bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> =>
  Promise.resolve(new Uint8Array(bytes));

function boundedIdentity(bytes: Uint8Array, maxOutputBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (bytes.byteLength > maxOutputBytes) throw new RangeError("Ghost chunk exceeds decoded byte limit");
  return identity(bytes);
}

async function decompressGzip(
  bytes: Uint8Array,
  maxOutputBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const writing = (async () => {
    await writer.write(new Uint8Array(bytes));
    await writer.close();
  })();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    let result = await reader.read();
    while (!result.done) {
      total += result.value.byteLength;
      if (total > maxOutputBytes) {
        await reader.cancel("Ghost chunk exceeds decoded byte limit");
        void writer.abort("Ghost chunk exceeds decoded byte limit").catch(() => undefined);
        throw new RangeError("Ghost chunk exceeds decoded byte limit");
      }
      chunks.push(result.value);
      result = await reader.read();
    }
    await writing;
  } catch (error) {
    void writing.catch(() => undefined);
    throw error;
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function codecs(): readonly GhostChunkCodec[] {
  return Object.freeze([
    Object.freeze({ encoding: "utf8-base64" as const, version: 0, encode: identity, decode: boundedIdentity }),
    Object.freeze({ encoding: "utf8-base64-v1" as const, version: 1, encode: identity, decode: boundedIdentity }),
    Object.freeze({
      encoding: "gzip-base64-v1" as const,
      version: 1,
      encode: (bytes: Uint8Array) => transform(bytes, new CompressionStream("gzip")),
      decode: decompressGzip,
    }),
  ]);
}

/** Versioned, allowlisted capsule decoder registry. */
export class GhostChunkCodecRegistry {
  readonly #codecs = new Map<GhostChunkEncoding, GhostChunkCodec>();

  constructor(entries: readonly GhostChunkCodec[] = codecs()) {
    for (const codec of entries) {
      if (this.#codecs.has(codec.encoding)) throw new TypeError(`duplicate Ghost codec: ${codec.encoding}`);
      this.#codecs.set(codec.encoding, codec);
    }
  }

  list(): readonly Readonly<{ encoding: GhostChunkEncoding; version: number }>[] {
    return Object.freeze([...this.#codecs.values()].map(({ encoding, version }) =>
      Object.freeze({ encoding, version })));
  }

  async encode(payload: unknown, preferCompression = true): Promise<GhostChunkCodecResult> {
    const source = new TextEncoder().encode(JSON.stringify(payload));
    const identityCodec = this.#require("utf8-base64-v1");
    let codec = identityCodec;
    let bytes = source;
    if (preferCompression && typeof CompressionStream !== "undefined") {
      const compressed = await this.#require("gzip-base64-v1").encode(source);
      if (compressed.byteLength < source.byteLength) {
        codec = this.#require("gzip-base64-v1");
        bytes = compressed;
      }
    }
    return Object.freeze({
      encoding: codec.encoding,
      encoded: bytesToBase64(bytes),
      compressedBytes: bytes.byteLength,
      uncompressedBytes: source.byteLength,
    });
  }

  async decode(encoding: string, encoded: string, maxOutputBytes = 64 * 1024 * 1024): Promise<unknown> {
    if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) {
      throw new RangeError("Ghost decoded byte limit must be a positive safe integer");
    }
    const codec = this.#requireEncoding(encoding);
    const decoded = await codec.decode(base64ToBytes(encoded), maxOutputBytes);
    return JSON.parse(new TextDecoder().decode(decoded)) as unknown;
  }

  #require(encoding: GhostChunkEncoding): GhostChunkCodec {
    const codec = this.#codecs.get(encoding);
    if (codec === undefined) throw new TypeError(`unsupported Ghost chunk encoding: ${encoding}`);
    return codec;
  }

  #requireEncoding(encoding: string): GhostChunkCodec {
    if (encoding !== "utf8-base64" && encoding !== "utf8-base64-v1" && encoding !== "gzip-base64-v1") {
      throw new TypeError(`unsupported Ghost chunk encoding: ${encoding}`);
    }
    return this.#require(encoding);
  }
}

export const GHOST_CHUNK_CODECS = new GhostChunkCodecRegistry();

/** Deterministic uncompressed fallback used by non-browser focused tests. */
export function encodeGhostChunkPayload(payload: unknown): GhostChunkCodecResult {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return Object.freeze({
    encoding: "utf8-base64-v1",
    encoded: bytesToBase64(bytes),
    compressedBytes: bytes.byteLength,
    uncompressedBytes: bytes.byteLength,
  });
}

/** Worker-facing adaptive encoder; compression is retained only when smaller. */
export function encodeGhostChunkPayloadCompressed(payload: unknown): Promise<GhostChunkCodecResult> {
  return GHOST_CHUNK_CODECS.encode(payload, true);
}

export function decodeGhostChunkPayload(
  encoding: string,
  encoded: string,
  maxOutputBytes?: number,
): Promise<unknown> {
  return GHOST_CHUNK_CODECS.decode(encoding, encoded, maxOutputBytes);
}
