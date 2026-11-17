import { afterEach, describe, expect, it, vi } from "vitest";
import { musicWarmAllowed } from "../../src/audio/install-stem-cue";
import { WebAudioStemBackend, warmStem } from "../../src/audio/stems/web-audio-backend";

class FakeNode {
  connect(node: FakeNode): FakeNode {
    return node;
  }
  disconnect(): void {
    return undefined;
  }
}
class FakeContext {
  currentTime = 0;
  decoded = 0;
  createGain(): unknown {
    return Object.assign(new FakeNode(), { gain: { value: 1, setValueAtTime: () => undefined } });
  }
  createStereoPanner(): unknown {
    return Object.assign(new FakeNode(), { pan: { value: 0 } });
  }
  decodeAudioData(): Promise<AudioBuffer> {
    this.decoded += 1;
    return Promise.resolve({ duration: 8 } as AudioBuffer);
  }
}

const asset = {
  id: "foundation",
  role: "foundation",
  channels: 2 as const,
  gainDb: 0,
  sources: [{ url: "opus/foundation.ogg", mime: "audio/ogg" }],
};

afterEach(() => vi.unstubAllGlobals());

describe("warming a cue's first layer", () => {
  it("fetches the bytes once: the voice that plays them takes the warmed copy", async () => {
    const fetch = vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("document", { baseURI: "http://127.0.0.1/" });
    warmStem("audio/cues/warm-once", asset, () => true);
    warmStem("audio/cues/warm-once", asset, () => true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([
      "http://127.0.0.1/audio/cues/warm-once/opus/foundation.ogg",
      expect.objectContaining({ priority: "low" }),
    ]);
    const context = new FakeContext();
    const backend = new WebAudioStemBackend(
      context as unknown as AudioContext,
      new FakeNode() as unknown as AudioNode,
      "audio/cues/warm-once",
      () => true,
    );
    await backend.createVoice(asset);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(context.decoded).toBe(1);
    // The warmed copy is used up: a later voice fetches again.
    await backend.createVoice(asset);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to a normal fetch when the warm-up failed", async () => {
    let calls = 0;
    const fetch = vi.fn(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("document", { baseURI: "http://127.0.0.1/" });
    warmStem("audio/cues/warm-fails", asset, () => true);
    const backend = new WebAudioStemBackend(
      new FakeContext() as unknown as AudioContext,
      new FakeNode() as unknown as AudioNode,
      "audio/cues/warm-fails",
      () => true,
    );
    await expect(backend.createVoice(asset)).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("skips warming when music is off, everything is muted, or the browser asks to save data", () => {
    expect(musicWarmAllowed(null, undefined)).toBe(true);
    expect(musicWarmAllowed(JSON.stringify({ music: true, musicMuted: false }), { saveData: false })).toBe(true);
    expect(musicWarmAllowed(JSON.stringify({ music: false }), undefined)).toBe(false);
    expect(musicWarmAllowed(JSON.stringify({ musicMuted: true }), undefined)).toBe(false);
    expect(musicWarmAllowed(JSON.stringify({ masterMuted: true }), undefined)).toBe(false);
    expect(musicWarmAllowed(null, { saveData: true })).toBe(false);
    expect(musicWarmAllowed("{not json", undefined)).toBe(true);
  });
});
