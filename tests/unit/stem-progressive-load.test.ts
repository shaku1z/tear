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
  configureLoop(): void {}
  start(atTime: number, offsetSeconds: number): void {
    this.started = { at: atTime, offset: offsetSeconds };
  }
  rampGain(target: number): void {
    this.gain = target;
  }
  setGain(value: number): void {
    this.gain = value;
  }
  stop(): void {}
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
    return new Promise((resolve) => this.#release.set(asset.id, () => resolve(voice)));
  }
  release(id: string): void {
    this.#release.get(id)?.();
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("progressive stem loading", () => {
  it("requests every stem at once and resolves when the first ones arrive", async () => {
    const backend = new ControlledBackend();
    const player = new StemCuePlayer();
    const first = cue.stems[0]!.id;
    let loaded = false;
    const loading = player.load(cue, backend, { first: [first] }).then(() => (loaded = true));
    await flush();
    expect(backend.voices.size).toBe(cue.stems.length);
    expect(loaded).toBe(false);
    backend.release(first);
    await loading;
    expect(loaded).toBe(true);
  });

  it("starts a late stem at the loop position the others have reached", async () => {
    const backend = new ControlledBackend();
    const player = new StemCuePlayer();
    const [first, late] = [cue.stems[0]!.id, cue.stems[1]!.id];
    const loading = player.load(cue, backend, { first: [first] });
    backend.release(first);
    await loading;
    player.setTier(4);
    player.start({ leadSeconds: 0.1 });
    const startAt = backend.voices.get(first)!.started!.at;

    const { startSeconds, lengthSeconds } = loopSeconds(cue);
    backend.time = startAt + lengthSeconds + 3; // more than one loop later
    backend.release(late);
    await flush();
    const joined = backend.voices.get(late)!.started!;
    const expected = startSeconds + ((joined.at - startAt) % lengthSeconds);
    expect(joined.offset).toBeCloseTo(expected, 9);
    expect(backend.voices.get(late)!.gain).toBeGreaterThan(0);
  });

  it("drops stems that arrive after the cue was unloaded", async () => {
    const backend = new ControlledBackend();
    const player = new StemCuePlayer();
    const [first, late] = [cue.stems[0]!.id, cue.stems[1]!.id];
    const loading = player.load(cue, backend, { first: [first] });
    backend.release(first);
    await loading;
    player.unload();
    backend.release(late);
    await flush();
    expect(backend.voices.get(late)!.disposed).toBe(true);
    expect(backend.voices.get(late)!.started).toBeNull();
  });
});
