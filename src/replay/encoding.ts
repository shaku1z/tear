/**
 * How a kept record is held in the `tear-replays` store: the gzip bytes of its JSON.
 *
 * - **Measured (replay PR 6):** gzip makes a live record about 12 times smaller, about 60 KB a minute
 *   instead of about 700 KB, and costs a few milliseconds to write and about 2 to read.
 * - **Self-describing:** a stored value is either bytes (gzip, which starts with its own magic number) or
 *   text (the JSON as records were kept before PR 6, or where the browser has no `CompressionStream`).
 *   Both read back the same way, so no record needs rewriting.
 * - **Bounded:** reading stops past `REPLAY_DECODED_LIMIT`, so a damaged or hostile value cannot expand
 *   without limit.
 *
 * The DOWNLOAD and IMPORT file stays plain JSON: this is the device encoding only.
 */

/** A kept record as stored: gzip bytes, or the JSON text itself. */
export type EncodedReplayRecord = string | Uint8Array;

/** The most a stored record may decode to: four times the store's byte cap, far above any real run. */
export const REPLAY_DECODED_LIMIT = 100 * 1024 * 1024;

/** How many bytes a stored value takes. */
export const encodedReplayRecordBytes = (value: EncodedReplayRecord): number =>
  typeof value === "string" ? value.length : value.byteLength;

async function drain(readable: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array | null> {
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let result = await reader.read(); !result.done; result = await reader.read()) {
    total += result.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Runs bytes through a transform stream, writing and reading at once so neither side blocks the other. */
async function through(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  limit: number,
): Promise<Uint8Array | null> {
  const writer = stream.writable.getWriter();
  const output = drain(stream.readable, limit);
  const writing = writer
    .write(new Uint8Array(bytes))
    .then(() => writer.close())
    .catch(() => undefined);
  const result = await output;
  await writing;
  return result;
}

/** The record's JSON as it is stored: gzip bytes, or the text where this browser cannot compress. */
export async function encodeReplayRecord(json: string): Promise<EncodedReplayRecord> {
  if (typeof CompressionStream !== "function") return json;
  const bytes = await through(new TextEncoder().encode(json), new CompressionStream("gzip"), Number.MAX_SAFE_INTEGER);
  return bytes ?? json;
}

/** A stored value's JSON; null when it is neither text nor readable gzip bytes. Never throws. */
export async function decodeReplayRecord(value: unknown, limit: number = REPLAY_DECODED_LIMIT): Promise<string | null> {
  if (typeof value === "string") return value.length > limit ? null : value;
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : undefined;
  if (bytes === undefined || typeof DecompressionStream !== "function") return null;
  try {
    const json = await through(bytes, new DecompressionStream("gzip"), limit);
    return json === null ? null : new TextDecoder("utf-8", { fatal: true }).decode(json);
  } catch {
    return null;
  }
}
