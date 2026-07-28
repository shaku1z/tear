import { stableVerificationHash } from "../replay/hash";
import { encodeGhostChunkPayload } from "./capsule-codec";

interface EncodeRequest {
  readonly id: number;
  readonly payload: unknown;
  readonly prepareThumbnail: boolean;
}

function encode(request: EncodeRequest): Readonly<Record<string, unknown>> {
  const encoded = encodeGhostChunkPayload(request.payload);
  return Object.freeze({
    id: request.id,
    encoded: encoded.encoded,
    compressedBytes: encoded.compressedBytes,
    uncompressedBytes: encoded.uncompressedBytes,
    checksum: stableVerificationHash(encoded.encoded),
    ...(request.prepareThumbnail ? { thumbnail: `data:application/x-tearghost-thumb,${stableVerificationHash(request.payload)}` } : {}),
  });
}

self.addEventListener("message", (event: MessageEvent<EncodeRequest>) => {
  try {
    self.postMessage(encode(event.data));
  } catch (error) {
    self.postMessage(Object.freeze({
      id: event.data.id,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
});
