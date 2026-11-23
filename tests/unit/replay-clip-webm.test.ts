/** The replay editor's local WebM encoder (src/app/replay/browser-replay-clip-webm.ts). */
import { describe, expect, it, vi } from "vitest";

import { encodeClipVp8Webm } from "../../src/app/replay/browser-replay-clip-webm";

describe("the replay editor's WebM encoder", () => {
  it("encodes every planned timestamp independently of reconstruction time into bounded WebM blocks", async () => {
    const frames: { timestamp: number; duration: number; closed: boolean }[] = [],
      closed = vi.fn();
    class Frame {
      readonly timestamp: number;
      readonly duration: number;
      closed = false;
      constructor(_canvas: HTMLCanvasElement, init: VideoFrameInit) {
        this.timestamp = init.timestamp ?? -1;
        this.duration = init.duration ?? -1;
        frames.push(this);
      }
      close() {
        this.closed = true;
      }
    }
    class Encoder {
      static isConfigSupported(config: VideoEncoderConfig) {
        return Promise.resolve({ supported: true, config });
      }
      state = "configured";
      encodeQueueSize = 0;
      readonly pending: EncodedVideoChunk[] = [];
      constructor(readonly callbacks: VideoEncoderInit) {}
      configure() {
        return;
      }
      encode(frame: Frame, options: VideoEncoderEncodeOptions) {
        const number = frames.length - 1,
          payload = Uint8Array.from([number, 0xa5, 0x5a]);
        this.pending.push({
          timestamp: frame.timestamp,
          duration: frame.duration,
          type: options.keyFrame ? "key" : "delta",
          byteLength: payload.length,
          copyTo(destination) {
            if (!(destination instanceof Uint8Array)) throw new Error("unexpected destination");
            destination.set(payload);
          },
        });
        this.encodeQueueSize++;
      }
      flush() {
        for (const chunk of this.pending.splice(0)) this.callbacks.output(chunk, {});
        this.encodeQueueSize = 0;
        return Promise.resolve();
      }
      close() {
        this.state = "closed";
        closed();
      }
    }
    vi.stubGlobal("VideoFrame", Frame);
    vi.stubGlobal("VideoEncoder", Encoder);
    try {
      const order: number[] = [],
        bytes = await encodeClipVp8Webm(
          { width: 640, height: 360 } as HTMLCanvasElement,
          31,
          (index) => {
            order.push(index);
          },
          new AbortController().signal,
        );
      expect(order).toEqual(Array.from({ length: 31 }, (_, index) => index));
      expect(frames.map((frame) => frame.timestamp)).toEqual(order.map((index) => Math.round((index * 1000000) / 30)));
      expect(frames.every((frame) => frame.closed)).toBe(true);
      expect(frames.reduce((sum, frame) => sum + frame.duration, 0)).toBe(1033333);
      expect(closed).toHaveBeenCalledOnce();
      const roots = ebmlElements(bytes),
        segment = roots.find((entry) => entry.id === 0x18538067);
      if (segment === undefined) throw new Error("missing Segment");
      const content = ebmlElements(segment.data),
        info = content.find((entry) => entry.id === 0x1549a966);
      if (info === undefined) throw new Error("missing Info");
      const duration = ebmlElements(info.data).find((entry) => entry.id === 0x4489);
      if (duration === undefined) throw new Error("missing Duration");
      expect(new DataView(duration.data.buffer, duration.data.byteOffset, 8).getFloat64(0)).toBe((31 * 1000) / 30);
      expect(new TextDecoder().decode(bytes)).toContain("V_VP8");
      const clusters = content.filter((entry) => entry.id === 0x1f43b675);
      expect(clusters).toHaveLength(2);
      const seekHead = content.find((entry) => entry.id === 0x114d9b74),
        cues = content.find((entry) => entry.id === 0x1c53bb6b);
      if (seekHead === undefined || cues === undefined) throw new Error("missing seeking metadata");
      const integer = (data: Uint8Array) => data.reduce((value, byte) => value * 256 + byte, 0);
      for (const seek of ebmlElements(seekHead.data)) {
        const fields = ebmlElements(seek.data),
          id = fields.find((field) => field.id === 0x53ab),
          position = fields.find((field) => field.id === 0x53ac);
        if (id === undefined || position === undefined) throw new Error("invalid SeekHead");
        expect(content.find((entry) => entry.id === integer(id.data))?.position).toBe(integer(position.data));
      }
      const cuePoints = ebmlElements(cues.data);
      expect(cuePoints).toHaveLength(2);
      for (const [index, point] of cuePoints.entries()) {
        const fields = ebmlElements(point.data),
          track = fields.find((field) => field.id === 0xb7);
        if (track === undefined) throw new Error("missing CueTrackPositions");
        const position = ebmlElements(track.data).find((field) => field.id === 0xf1);
        if (position === undefined) throw new Error("missing CueClusterPosition");
        expect(integer(position.data)).toBe(clusters[index]?.position);
      }
      const blocks = clusters.flatMap((entry) => ebmlElements(entry.data).filter((child) => child.id === 0xa3));
      expect(blocks).toHaveLength(31);
      expect(blocks[0]?.data[3]).toBe(0x80);
      expect(blocks[1]?.data[3]).toBe(0);
      expect(blocks[30]?.data[3]).toBe(0x80);
      expect(blocks.map((entry) => [...entry.data.subarray(4)])).toEqual(order.map((index) => [index, 0xa5, 0x5a]));
      const last = blocks[29];
      if (last === undefined) throw new Error("missing block");
      expect(new DataView(last.data.buffer, last.data.byteOffset + 1, 2).getInt16(0)).toBe(967);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("closes bounded queued frames and encoder on cancellation and refuses unsupported native VP8", async () => {
    const closed = vi.fn(),
      frameClosed = vi.fn(),
      flush = vi.fn(() => new Promise<void>(() => undefined));
    let supported = false;
    class Frame {
      close = frameClosed;
    }
    class Encoder {
      static isConfigSupported(config: VideoEncoderConfig) {
        return Promise.resolve({ supported, config });
      }
      state = "configured";
      encodeQueueSize = 0;
      configure() {
        return;
      }
      encode() {
        this.encodeQueueSize++;
      }
      flush = flush;
      close() {
        this.state = "closed";
        closed();
      }
    }
    vi.stubGlobal("VideoFrame", Frame);
    vi.stubGlobal("VideoEncoder", Encoder);
    try {
      await expect(
        encodeClipVp8Webm({ width: 640, height: 360 } as HTMLCanvasElement, 30, vi.fn(), new AbortController().signal),
      ).rejects.toThrow(/support/);
      expect(frameClosed).not.toHaveBeenCalled();
      supported = true;
      const abort = new AbortController(),
        rendering = encodeClipVp8Webm({ width: 640, height: 360 } as HTMLCanvasElement, 30, vi.fn(), abort.signal);
      await vi.waitFor(() => {
        expect(flush).toHaveBeenCalledOnce();
      });
      abort.abort(new Error("cancel"));
      await expect(rendering).rejects.toThrow(/cancel/);
      expect(frameClosed).toHaveBeenCalledTimes(4);
      expect(closed).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/** Read only standard EBML IDs/sizes for the unit container structure control; payload here is a codec-port fixture, not decodable VP8 evidence. */
function ebmlElements(bytes: Uint8Array): { id: number; data: Uint8Array; position: number }[] {
  const result: { id: number; data: Uint8Array; position: number }[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const position = offset;
    const read = (keepMarker: boolean) => {
      const first = bytes[offset++];
      if (first === undefined || first === 0) throw new Error("invalid EBML integer");
      let marker = 0x80,
        length = 1;
      while ((first & marker) === 0) {
        marker >>= 1;
        length++;
      }
      let value = keepMarker ? first : first & (marker - 1);
      for (let count = 1; count < length; count++) {
        const next = bytes[offset++];
        if (next === undefined) throw new Error("truncated EBML");
        value = value * 256 + next;
      }
      return value;
    };
    const id = read(true),
      length = read(false);
    if (offset + length > bytes.length) throw new Error("truncated EBML payload");
    result.push({ id, data: bytes.subarray(offset, offset + length), position });
    offset += length;
  }
  return result;
}
