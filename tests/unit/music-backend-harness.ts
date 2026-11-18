// The stem backend on a fake audio graph, with the music this branch ships: shared by the
// playback tests (first-run songs, the player's pick and the Radio).
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, vi } from "vitest";
import { BrowserAudioGraphContext, BrowserAudioNodePort } from "../../src/audio/browser-audio";
import type { MusicContextSnapshot, MusicScene } from "../../src/audio/music-contracts";
import type { ProgressSource } from "../../src/domain/progress-facts";
import { parseMusicCatalog } from "../../src/audio/music/catalog";
import { publishMusicLibrary } from "../../src/audio/music/library";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import { BiomeStemBackend, type LoadedCueRef } from "../../src/audio/stems/biome-stem-backend";
import type { StemCueManifest } from "../../src/audio/stems/types";

// The music this branch ships, as tear-music published it.
export const index = JSON.parse(readFileSync("public/audio/music.json", "utf8")) as {
  readonly catalog: Record<string, unknown>;
  readonly routing: unknown;
  readonly cues: Readonly<Record<string, StemCueManifest>>;
};
export const INTRO_SECONDS = 23.287;

/** Radio channels in the shape tear-music publishes, over the tags the shipped catalog carries. */
export const TEST_CHANNELS = {
  radio: { songSeconds: 120 },
  channels: [
    { id: "calm", name: "Calm", description: "Easy listening", rule: { tagsAny: ["calm"] } },
    { id: "bosses", name: "Bosses", description: "Every boss theme", rule: { tagsAny: ["boss"] } },
    { id: "my-mix", name: "My mix", description: "Starred songs", rule: { playlist: "my-mix" } },
    { id: "odd", name: "Odd", description: "A rule from a later build", rule: { starred: true } },
  ],
} as const;

class FakeParam {
  value = 0;
  cancelScheduledValues(): void {
    return undefined;
  }
  setValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }
  setValueCurveAtTime(values: Float32Array): void {
    this.value = values[values.length - 1] ?? this.value;
  }
}
export class FakeNode {
  connect(node: FakeNode): FakeNode {
    return node;
  }
  disconnect(): void {
    return undefined;
  }
}
class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}
class FakePanner extends FakeNode {
  readonly pan = new FakeParam();
}
class FakeSource extends FakeNode {
  buffer: (AudioBuffer & { readonly url: string }) | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  readonly starts: number[] = [];
  readonly playbackRate = new FakeParam();
  start(at: number): void {
    this.starts.push(at);
  }
  stop(): void {
    this.onended?.();
  }
}
export class FakeAudioContext {
  currentTime = 10;
  readonly destination = new FakeNode();
  readonly sources: FakeSource[] = [];
  createGain(): FakeGain {
    return new FakeGain();
  }
  createStereoPanner(): FakePanner {
    return new FakePanner();
  }
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  decodeAudioData(bytes: ArrayBuffer & { url?: string }): Promise<AudioBuffer> {
    const url = bytes.url ?? "";
    const duration = url.endsWith("intro.ogg") ? INTRO_SECONDS : 30;
    return Promise.resolve({
      duration,
      numberOfChannels: 2,
      sampleRate: 48000,
      length: duration * 48000,
      url,
    } as never);
  }
}

/** Every URL fetched since the test began. */
export const requested: string[] = [];

/** Stubs the browser globals the backend fetches and schedules with, around each test. */
export function useMusicBrowserStubs(): void {
  beforeEach(() => {
    requested.length = 0;
    vi.stubGlobal("document", {
      baseURI: "http://127.0.0.1/",
      createElement: () => ({ canPlayType: () => "probably" }),
    });
    vi.stubGlobal("window", { setTimeout: (fn: () => void) => setTimeout(fn, 0) });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        requested.push(url);
        const bytes = Object.assign(new ArrayBuffer(8), { url });
        return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(bytes) });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
}

export function snapshot(biomeId: string, scene: MusicScene, bossId: string | null = null): MusicContextSnapshot {
  return {
    schemaVersion: 1,
    sequence: 0,
    timeMs: 0,
    scene,
    modeId: "campaign",
    difficultyId: "normal",
    biomeId,
    stageId: biomeId,
    wave: 1,
    totalWaves: 10,
    bossActive: scene === "boss",
    bossId,
    bossPhase: null,
    playerHealthRatio: 1,
    comboRankId: "D",
    playerMoving: false,
  };
}

export const cueRequested = (cue: string): boolean => requested.some((url) => url.includes(`/audio/cues/${cue}/`));
export const settle = (): Promise<unknown> => vi.waitFor(() => new Promise((resolve) => setTimeout(resolve, 5)));

export function shippedCues(): LoadedCueRef[] {
  return Object.entries(index.cues).map(([id, manifest]) => ({ id, manifest, baseUrl: `audio/cues/${id}` }));
}

export interface MusicBackendOptions {
  readonly progress?: ProgressSource;
  /** Extra catalog fields (Radio channels) on top of the shipped catalog; omitted: no library. */
  readonly catalog?: Readonly<Record<string, unknown>>;
}

/** A started backend with a run begun: the menu cue playing, ready for snapshots. */
export async function musicBackend(options: MusicBackendOptions = {}) {
  const routing = validateMusicRoutingManifest(index.routing);
  const catalog = parseMusicCatalog({ ...index.catalog, ...(options.catalog ?? {}) });
  const cues = shippedCues();
  const seconds = Object.fromEntries(
    cues.map(({ id, manifest }) => [
      id,
      (manifest.loop.endFrame - manifest.loop.startFrame) / manifest.sourceSampleRate,
    ]),
  );
  const library = options.catalog === undefined ? null : publishMusicLibrary(catalog, routing, seconds);
  const backend = new BiomeStemBackend(cues, routing, catalog, library);
  const context = new FakeAudioContext();
  await backend.initialize({
    context: new BrowserAudioGraphContext(context as unknown as AudioContext),
    output: new BrowserAudioNodePort(new FakeNode() as unknown as AudioNode),
  });
  await backend.beginRun({
    runId: "run-1",
    runSeed: "1",
    rulesetVersion: "r",
    gameVersion: "0.1.0",
    scoreVersion: "s",
    ...(options.progress ? { progress: options.progress } : {}),
  });
  return { backend, context };
}
