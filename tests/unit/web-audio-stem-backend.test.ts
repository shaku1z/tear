import { afterEach, describe, expect, it, vi } from "vitest";
import { WebAudioStemBackend } from "../../src/audio/stems/web-audio-backend";

class FakeParam {
  value = 0;
  readonly curves: {
    readonly values: Float32Array;
    readonly at: number;
    readonly duration: number;
  }[] = [];
  cancelScheduledValues(time: number): void {
    void time;
  }
  setValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }
  setValueCurveAtTime(values: Float32Array, at: number, duration: number): void {
    this.curves.push({ values, at, duration });
    this.value = values[values.length - 1] ?? this.value;
  }
}

class FakeNode {
  readonly connections: FakeNode[] = [];
  disconnected = false;
  connect(node: FakeNode): FakeNode {
    this.connections.push(node);
    return node;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakePanner extends FakeNode {
  readonly pan = new FakeParam();
}

class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  stopped = false;
  onended: (() => void) | null = null;
  readonly starts: {
    readonly at: number;
    readonly offset: number;
    readonly duration?: number;
  }[] = [];
  start(at: number, offset: number, duration?: number): void {
    this.starts.push({ at, offset, ...(duration === undefined ? {} : { duration }) });
  }
  stop(): void {
    this.stopped = true;
    this.onended?.();
  }
}

class FakeAudioContext {
  currentTime = 10;
  readonly gains: FakeGain[] = [];
  readonly panners: FakePanner[] = [];
  readonly sources: FakeSource[] = [];
  createGain(): GainNode {
    const node = new FakeGain();
    this.gains.push(node);
    return node as unknown as GainNode;
  }
  createStereoPanner(): StereoPannerNode {
    const node = new FakePanner();
    this.panners.push(node);
    return node as unknown as StereoPannerNode;
  }
  createBufferSource(): AudioBufferSourceNode {
    const node = new FakeSource();
    this.sources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }
  decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve({ duration: 12 } as AudioBuffer);
  }
}

const asset = {
  id: "vocal",
  role: "motif",
  channels: 2 as const,
  gainDb: 0,
  pan: 0.35,
  sources: [{ url: "vocal.ogg", mime: "audio/ogg" }],
};

afterEach(() => vi.unstubAllGlobals());

function stubAudioRequest(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      }),
    ),
  );
  vi.stubGlobal("document", { baseURI: "http://127.0.0.1/" });
}

describe("WebAudioStemBackend", () => {
  it("uses a native hard loop for rhythmic material", async () => {
    stubAudioRequest();
    const context = new FakeAudioContext();
    const backend = new WebAudioStemBackend(
      context as unknown as AudioContext,
      new FakeNode() as unknown as AudioNode,
      "/audio/cues/example",
      () => true,
    );
    const voice = await backend.createVoice({ ...asset, pan: 0 });
    voice.configureLoop(1, 9, { mode: "hard" });
    voice.start(10.15, 1);

    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]).toMatchObject({
      loop: true,
      loopStart: 1,
      loopEnd: 9,
    });
    voice.dispose();
  });

  it("schedules an equal-power seam bank for vocal and tail material", async () => {
    stubAudioRequest();
    const context = new FakeAudioContext();
    const backend = new WebAudioStemBackend(
      context as unknown as AudioContext,
      new FakeNode() as unknown as AudioNode,
      "/audio/cues/example",
      () => true,
    );
    const voice = await backend.createVoice(asset);
    voice.configureLoop(1, 9, {
      mode: "crossfade",
      crossfadeSeconds: 0.25,
    });
    voice.start(10.15, 1);

    expect(context.sources.length).toBeGreaterThan(1);
    expect(context.sources.every((source) => !source.loop)).toBe(true);
    expect(context.gains.some((gain) => gain.gain.curves.length > 0)).toBe(true);
    expect(context.panners[0]?.pan.value).toBeCloseTo(0.35, 5);
    voice.stop();
    expect(context.sources.every((source) => source.stopped)).toBe(true);
    voice.dispose();
  });
});
