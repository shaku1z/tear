import { afterEach, describe, expect, it, vi } from "vitest";
import { musicWarmAllowed } from "../../src/audio/install-stem-cue";
import { LegacyAudioSettingsStore } from "../../src/audio/legacy-live-audio";
import { StingerPlayer, setStingersEnabled } from "../../src/audio/music/stingers";
import { readStoredAudioSettings } from "../../src/persistence/audio-settings";
import {
  WARM_HOLD_MS,
  WebAudioStemBackend,
  dropWarmedStems,
  warmStem,
  warmedStemCount,
} from "../../src/audio/stems/web-audio-backend";

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
    // Read through the audio system's own reader, so a renamed setting fails here and in typecheck.
    const saved = (value: unknown) => readStoredAudioSettings({ getItem: () => JSON.stringify(value) });
    expect(musicWarmAllowed(saved({}), undefined)).toBe(true);
    expect(musicWarmAllowed(saved({ music: true, musicMuted: false }), { saveData: false })).toBe(true);
    expect(musicWarmAllowed(saved({ music: false }), undefined)).toBe(false);
    expect(musicWarmAllowed(saved({ musicMuted: true }), undefined)).toBe(false);
    expect(musicWarmAllowed(saved({ masterMuted: true }), undefined)).toBe(false);
    expect(musicWarmAllowed(saved({ audio: { musicMuted: true } }), undefined)).toBe(false);
    expect(musicWarmAllowed(saved({}), { saveData: true })).toBe(false);
    expect(musicWarmAllowed(readStoredAudioSettings({ getItem: () => "{not json" }), undefined)).toBe(true);
    // The audio system's store reads the same thing.
    const storage = { getItem: () => JSON.stringify({ music: false }) } as unknown as Storage;
    expect(new LegacyAudioSettingsStore(storage).load().musicMuted).toBe(true);
  });

  it("lets go of warmed bytes nobody takes", () => {
    vi.useFakeTimers();
    const fetch = vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("document", { baseURI: "http://127.0.0.1/" });
    dropWarmedStems();
    warmStem("audio/cues/never-played", asset, () => true);
    expect(warmedStemCount()).toBe(1);
    vi.advanceTimersByTime(WARM_HOLD_MS);
    expect(warmedStemCount()).toBe(0);
    warmStem("audio/cues/other-cue-first", asset, () => true);
    dropWarmedStems();
    expect(warmedStemCount()).toBe(0);
    vi.useRealTimers();
  });

  it("drops a stinger asked for before stingers have loaded: silent, not queued", () => {
    setStingersEnabled(true);
    const context = new FakeContext();
    const stingers = new StingerPlayer(context as unknown as AudioContext, new FakeNode() as unknown as AudioNode);
    expect(stingers.play("boss-arrival")).toBe(false);
    setStingersEnabled(false);
  });
});
