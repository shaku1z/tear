import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { StemCuePlayer, type StemAudioBackend, type StemVoice } from "../../src/audio/stems/StemCuePlayer";
import { loopSeconds } from "../../src/audio/stems/tier";
import type { StemAsset, StemCueManifest } from "../../src/audio/stems/types";

const cue = JSON.parse(readFileSync("public/audio/cues/fillet/cue.json", "utf8")) as StemCueManifest;

interface Started {
  at: number;
  offset: number;
}

class FakeVoice implements StemVoice {
  started: Started | null = null;
  gain = -1;
  disposed = false;
  constructor(readonly id: string) {}
  configureLoop(): void {
    /* nothing to configure in the fake */
  }
  start(atTime: number, offsetSeconds: number): void {
    this.started = { at: atTime, offset: offsetSeconds };
  }
  rampGain(target: number): void {
    this.gain = target;
  }
  setGain(value: number): void {
    this.gain = value;
  }
  stop(): void {
    /* nothing to stop in the fake */
  }
  dispose(): void {
    this.disposed = true;
  }
}

/** A backend whose stems arrive only when the test releases them. */
class ControlledBackend implements StemAudioBackend {
  time = 10;
  readonly voices = new Map<string, FakeVoice>();
  readonly #release = new Map<string, () => void>();
  now(): number {
    return this.time;
  }
  createVoice(asset: StemAsset): Promise<StemVoice> {
    const voice = new FakeVoice(asset.id);
    this.voices.set(asset.id, voice);
    return new Promise((resolve) => {
      this.#release.set(asset.id, () => {
        resolve(voice);
      });
    });
  }
  release(id: string): void {
    this.#release.get(id)?.();
  }
  voice(id: string): FakeVoice {
    const voice = this.voices.get(id);
    if (!voice) throw new Error(`no voice ${id}`);
    return voice;
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function stemId(index: number): string {
  const stem = cue.stems[index];
  if (!stem) throw new Error(`fillet has no stem ${String(index)}`);
  return stem.id;
}

describe("progressive stem loading", () => {
  it("requests the first stems alone, then the rest as soon as those arrive", async () => {
    const backend = new ControlledBackend();
    const player = new StemCuePlayer();
    const first = stemId(0);
    let loaded = false;
    const loading = player.load(cue, backend, { first: [first] }).then(() => (loaded = true));
    await flush();
    // Only the audible layer is on the wire, so it has a slow connection to itself.
    expect([...backend.voices.keys()]).toEqual([first]);
    expect(loaded).toBe(false);
    backend.release(first);
    await loading;
    expect(loaded).toBe(true);
    expect(backend.voices.size).toBe(cue.stems.length);
  });

  it("requests every stem at once when no first set is given", async () => {
    const backend = new ControlledBackend();
    const player = new StemCuePlayer();
    void player.load(cue, backend);
    await flush();
    expect(backend.voices.size).toBe(cue.stems.length);
  });

  it("starts a late stem at the loop position the others have reached", async () => {
    const backend = new ControlledBackend();
    const player = new StemCuePlayer();
    const [first, late] = [stemId(0), stemId(1)];
    const loading = player.load(cue, backend, { first: [first] });
    backend.release(first);
    await loading;
    player.setTier(4);
    player.start({ leadSeconds: 0.1 });
    const startAt = backend.voice(first).started?.at ?? Number.NaN;

    const { startSeconds, lengthSeconds } = loopSeconds(cue);
    backend.time = startAt + lengthSeconds + 3; // more than one loop later
    backend.release(late);
    await flush();
    const joined = backend.voice(late).started;
    if (!joined) throw new Error("the late stem never started");
    const expected = startSeconds + ((joined.at - startAt) % lengthSeconds);
    expect(joined.offset).toBeCloseTo(expected, 9);
    expect(backend.voice(late).gain).toBeGreaterThan(0);
  });

  it("drops stems that arrive after the cue was unloaded", async () => {
    const backend = new ControlledBackend();
    const player = new StemCuePlayer();
    const [first, late] = [stemId(0), stemId(1)];
    const loading = player.load(cue, backend, { first: [first] });
    backend.release(first);
    await loading;
    player.unload();
    backend.release(late);
    await flush();
    expect(backend.voice(late).disposed).toBe(true);
    expect(backend.voice(late).started).toBeNull();
  });
});
