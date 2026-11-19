/** Timestamped VP8 elementary frames in a bounded WebM (no audio, lacing, or wall clock).
 * WebM IDs/units: https://www.webmproject.org/docs/container/
 * VideoFrame timestamps/duration are microseconds: https://www.w3.org/TR/webcodecs/
 */
const FPS = 30,
  MAX_FRAMES = 1800,
  MAX_BYTES = 64 * 1024 * 1024,
  WORK_MS = 90000;
const text = new TextEncoder();
function join(parts: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
function uint(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("WebM integer is invalid");
  const bytes: number[] = [];
  do {
    bytes.unshift(value % 256);
    value = Math.floor(value / 256);
  } while (value > 0);
  return Uint8Array.from(bytes);
}
function size(value: number): Uint8Array {
  for (let length = 1; length <= 8; length++)
    if (value < 2 ** (7 * length) - 1) {
      const bytes = new Uint8Array(length);
      let remainder = value;
      for (let index = length - 1; index >= 0; index--) {
        bytes[index] = remainder % 256;
        remainder = Math.floor(remainder / 256);
      }
      bytes[0] = (bytes[0] ?? 0) | (2 ** (8 - length));
      return bytes;
    }
  throw new RangeError("WebM element is too large");
}
function element(id: number, payload: Uint8Array): Uint8Array {
  return join([uint(id), size(payload.length), payload]);
}
function integer(id: number, value: number): Uint8Array {
  return element(id, uint(value));
}
function position(id: number, value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value));
  return element(id, bytes);
}
function master(id: number, parts: readonly Uint8Array[]): Uint8Array {
  return element(id, join(parts));
}
function float64(id: number, value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value);
  return element(id, bytes);
}
interface Cluster {
  readonly key: boolean;
  readonly time: number;
  readonly blocks: Uint8Array[];
  bytes: number;
}
class Vp8Webm {
  readonly #clusters: Cluster[] = [];
  #bytes = 0;
  #frames = 0;
  constructor(
    readonly width: number,
    readonly height: number,
    readonly frames: number,
  ) {}
  add(chunk: EncodedVideoChunk): void {
    const expected = Math.round((this.#frames * 1000000) / FPS);
    if (
      chunk.timestamp !== expected ||
      this.#frames >= this.frames ||
      chunk.byteLength <= 0 ||
      (this.#frames === 0 && chunk.type !== "key")
    )
      throw new Error("Native VP8 output frame count/timestamps/keyframe do not match the plan");
    // Reserve container overhead before allocating/copying native encoded output.
    if (this.#bytes + chunk.byteLength + 64 > MAX_BYTES - 4096) throw new RangeError("Clip exceeds 64 MiB");
    const time = Math.round(chunk.timestamp / 1000); // TimestampScale = 1ms.
    let cluster = this.#clusters.at(-1);
    if (cluster === undefined || chunk.type === "key" || time - cluster.time > 30000) {
      cluster = { time, key: chunk.type === "key", blocks: [], bytes: 0 };
      this.#clusters.push(cluster);
      this.#bytes += 128;
    }
    const relative = time - cluster.time;
    if (relative < 0 || relative > 32767) throw new RangeError("WebM relative timestamp is outside signed16 range");
    const header = join([uint(0xa3), size(4 + chunk.byteLength)]),
      block = new Uint8Array(header.length + 4 + chunk.byteLength);
    block.set(header);
    const offset = header.length;
    block[offset] = 0x81; // Track 1, VINT; no lacing. Native VP8 payload follows unchanged.
    new DataView(block.buffer).setInt16(offset + 1, relative);
    block[offset + 3] = chunk.type === "key" ? 0x80 : 0;
    chunk.copyTo(block.subarray(offset + 4));
    cluster.blocks.push(block);
    cluster.bytes += block.length;
    this.#bytes += block.length;
    this.#frames++;
  }
  finish(): Uint8Array {
    if (this.#frames !== this.frames) throw new Error("Native VP8 encoder dropped planned frames");
    const ebml = master(0x1a45dfa3, [
      integer(0x4286, 1),
      integer(0x42f7, 1),
      integer(0x42f2, 4),
      integer(0x42f3, 8),
      element(0x4282, text.encode("webm")),
      integer(0x4287, 2),
      integer(0x4285, 2),
    ]);
    const info = master(0x1549a966, [
      integer(0x2ad7b1, 1000000),
      float64(0x4489, (this.frames * 1000) / FPS),
      element(0x4d80, text.encode("Tear")),
      element(0x5741, text.encode("Tear")),
    ]);
    const tracks = master(0x1654ae6b, [
      master(0xae, [
        integer(0xd7, 1),
        integer(0x73c5, 1),
        integer(0x83, 1),
        integer(0x9c, 0),
        element(0x86, text.encode("V_VP8")),
        integer(0x23e383, Math.round(1000000000 / FPS)),
        master(0xe0, [integer(0xb0, this.width), integer(0xba, this.height)]),
      ]),
    ]);
    // Fixed-width segment-relative positions make SeekHead/Cues sizes stable in both passes.
    const seekHead = (positions: readonly number[]) =>
      master(
        0x114d9b74,
        [0x1549a966, 0x1654ae6b, 0x1c53bb6b, 0x1f43b675].map((id, index) =>
          master(0x4dbb, [element(0x53ab, uint(id)), position(0x53ac, positions[index] ?? 0)]),
        ),
      );
    const cues = (positions: readonly number[]) =>
      master(
        0x1c53bb6b,
        this.#clusters.flatMap((cluster, index) =>
          cluster.key
            ? [
                master(0xbb, [
                  integer(0xb3, cluster.time),
                  master(0xb7, [integer(0xf7, 1), position(0xf1, positions[index] ?? 0)]),
                ]),
              ]
            : [],
        ),
      );
    const seekLength = seekHead([]).length,
      cuesLength = cues([]).length;
    let offset = seekLength + info.length + tracks.length + cuesLength;
    const positions: number[] = [],
      clusterParts: Uint8Array[] = [];
    for (const cluster of this.#clusters) {
      positions.push(offset);
      const time = integer(0xe7, cluster.time),
        header = join([uint(0x1f43b675), size(time.length + cluster.bytes)]);
      clusterParts.push(header, time, ...cluster.blocks);
      offset += header.length + time.length + cluster.bytes;
    }
    const parts = [
      seekHead([seekLength, seekLength + info.length, seekLength + info.length + tracks.length, positions[0] ?? 0]),
      info,
      tracks,
      cues(positions),
      ...clusterParts,
    ];
    const segmentBytes = parts.reduce((sum, part) => sum + part.length, 0);
    const bytes = join([ebml, uint(0x18538067), size(segmentBytes), ...parts]);
    this.#clusters.length = 0;
    if (bytes.length > MAX_BYTES) throw new RangeError("Clip exceeds 64 MiB");
    return bytes;
  }
}
export function clipWebCodecsAvailable(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}
/** The only retained pixel surfaces are the caller canvas and a bounded native encoder queue. */
export async function encodeClipVp8Webm(
  canvas: HTMLCanvasElement,
  frames: number,
  draw: (index: number) => void,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!clipWebCodecsAvailable()) throw new Error("Timestamped WebCodecs VP8 export is unavailable in this browser");
  if (
    !Number.isSafeInteger(frames) ||
    frames < 1 ||
    frames > MAX_FRAMES ||
    !Number.isInteger(canvas.width) ||
    !Number.isInteger(canvas.height) ||
    canvas.width < 2 ||
    canvas.height < 2 ||
    canvas.width > 640 ||
    canvas.height > 640
  )
    throw new RangeError("Clip encode dimensions/frame budget is invalid");
  const started = performance.now();
  let encoder: VideoEncoder | undefined, failure: Error | undefined;
  const check = (): void => {
    signal.throwIfAborted();
    if (failure !== undefined) throw failure;
    if (performance.now() - started >= WORK_MS) throw new Error("Clip encoding exceeded its 90 second work budget");
  };
  const wait = <T>(work: Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const finish = (): void => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
      };
      const abort = (): void => {
        finish();
        reject(new Error("Clip encoding cancelled", { cause: signal.reason }));
      };
      const timer = setTimeout(
        () => {
          finish();
          reject(new Error("Clip encoding exceeded its 90 second work budget"));
        },
        Math.max(1, WORK_MS - (performance.now() - started)),
      );
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      work.then(
        (value) => {
          finish();
          resolve(value);
        },
        (error: unknown) => {
          finish();
          reject(error instanceof Error ? error : new Error("Native VP8 encoding failed", { cause: error }));
        },
      );
    });
  };
  const close = (): void => {
    if (encoder !== undefined && encoder.state !== "closed") encoder.close();
  };
  signal.addEventListener("abort", close, { once: true });
  try {
    const config: VideoEncoderConfig = {
      codec: "vp8",
      width: canvas.width,
      height: canvas.height,
      bitrate: 2000000,
      framerate: FPS,
      latencyMode: "quality",
    };
    const support = await wait(VideoEncoder.isConfigSupported(config));
    check();
    if (
      support.supported !== true ||
      support.config?.codec !== "vp8" ||
      support.config.width !== canvas.width ||
      support.config.height !== canvas.height
    )
      throw new Error("This browser does not support the requested native VP8 configuration");
    const mux = new Vp8Webm(canvas.width, canvas.height, frames);
    encoder = new VideoEncoder({
      output(chunk) {
        if (signal.aborted || failure !== undefined) return;
        try {
          mux.add(chunk);
        } catch (error) {
          failure = error instanceof Error ? error : new Error("Native VP8 output is invalid", { cause: error });
          close();
        }
      },
      error(error) {
        failure = error;
      },
    });
    encoder.configure(config);
    for (let index = 0; index < frames; index++) {
      check();
      draw(index);
      check();
      const timestamp = Math.round((index * 1000000) / FPS),
        duration = Math.round(((index + 1) * 1000000) / FPS) - timestamp;
      const frame = new VideoFrame(canvas, { timestamp, duration, alpha: "discard" });
      try {
        encoder.encode(frame, { keyFrame: index % FPS === 0 });
      } finally {
        frame.close();
      }
      if (encoder.encodeQueueSize >= 4 || (index + 1) % 4 === 0) {
        await wait(encoder.flush());
        check();
        await wait(
          new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
          }),
        );
      }
    }
    await wait(encoder.flush());
    check();
    return mux.finish();
  } finally {
    signal.removeEventListener("abort", close);
    close();
  }
}
