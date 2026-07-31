import { stableVerificationHash } from "../replay/hash";
import { encodeGhostChunkPayloadCompressed } from "./capsule-codec";

interface EncodeRequest {
  readonly id: number;
  readonly payload: unknown;
  readonly prepareThumbnail: boolean;
}

async function encode(request: EncodeRequest): Promise<Readonly<Record<string, unknown>>> {
  const encoded = await encodeGhostChunkPayloadCompressed(request.payload);
  return Object.freeze({
    id: request.id,
    encoding: encoded.encoding,
    encoded: encoded.encoded,
    compressedBytes: encoded.compressedBytes,
    uncompressedBytes: encoded.uncompressedBytes,
    checksum: stableVerificationHash(encoded.encoded),
    ...(request.prepareThumbnail ? { thumbnail: `data:application/x-tearghost-thumb,${stableVerificationHash(request.payload)}` } : {}),
  });
}

self.addEventListener("message", (event: MessageEvent<EncodeRequest>) => {
  void (async () => {
    try {
      self.postMessage(await encode(event.data));
    } catch (error) {
      self.postMessage(Object.freeze({
        id: event.data.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  })();
});
