import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserAudioGraphContext, BrowserAudioNodePort } from "../../src/audio/browser-audio";
import type { MusicContextSnapshot, MusicRunProgress, MusicScene } from "../../src/audio/music-contracts";
import { parseMusicCatalog } from "../../src/audio/music/catalog";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import { BiomeStemBackend, type LoadedCueRef } from "../../src/audio/stems/biome-stem-backend";
import type { StemCueManifest } from "../../src/audio/stems/types";
import { dropWarmedStems } from "../../src/audio/stems/web-audio-backend";

// The music this branch ships, as tear-music published it.
const index = JSON.parse(readFileSync("public/audio/music.json", "utf8")) as {
  readonly catalog: unknown;
  readonly routing: unknown;
  readonly cues: Readonly<Record<string, StemCueManifest>>;
};
const INTRO_SECONDS = 23.287;
const VERDANT = "The Verdant Sanctum";

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
class FakeNode {
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
class FakeAudioContext {
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

const requested: string[] = [];
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

function snapshot(biomeId: string, scene: MusicScene, bossId: string | null = null): MusicContextSnapshot {
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

async function backendFor(progress: MusicRunProgress | undefined) {
  const cues: LoadedCueRef[] = Object.entries(index.cues).map(([id, manifest]) => ({
    id,
    manifest,
    baseUrl: `audio/cues/${id}`,
  }));
  const backend = new BiomeStemBackend(
    cues,
    validateMusicRoutingManifest(index.routing),
    parseMusicCatalog(index.catalog),
  );
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
    ...(progress ? { progress } : {}),
  });
  return { backend, context };
}

const cueRequested = (cue: string) => requested.some((url) => url.includes(`/audio/cues/${cue}/`));
const settle = () => vi.waitFor(() => new Promise((resolve) => setTimeout(resolve, 5)));

async function enterVerdant(progress: MusicRunProgress | undefined) {
  const run = await backendFor(progress);
  run.backend.updateContext(snapshot(VERDANT, "combat"));
  await vi.waitFor(() => {
    expect(cueRequested("spring") || cueRequested("once-at-a-time")).toBe(true);
  });
  await settle();
  return run;
}

describe("the Verdant Sanctum's music follows saved progress", () => {
  it("plays Spring on the first Verdant run: the opening intro once, then the loop", async () => {
    const { backend, context } = await enterVerdant({ biomesReached: ["The Grounds"], bossesDefeated: [] });
    expect(cueRequested("spring")).toBe(true);
    const intros = () => context.sources.filter((s) => s.buffer?.url.endsWith("spring/opus/intro.ogg"));
    await vi.waitFor(() => {
      expect(intros()).toHaveLength(1);
    });
    const introAt = intros()[0]?.starts[0] ?? Number.NaN;
    const loopStarts = context.sources
      .filter((s) => s.buffer?.url.includes("/spring/opus/") && !s.buffer.url.endsWith("intro.ogg"))
      .flatMap((s) => s.starts);
    expect(loopStarts.length).toBeGreaterThan(0);
    for (const at of loopStarts) expect(at).toBeGreaterThanOrEqual(introAt + INTRO_SECONDS - 0.001);

    // After the boss, Spring comes back without its intro.
    backend.updateContext(snapshot(VERDANT, "boss", "rootbound"));
    await vi.waitFor(() => {
      expect(cueRequested("nocturnal-urgency")).toBe(true);
    });
    await settle();
    backend.updateContext(snapshot(VERDANT, "combat"));
    await settle();
    await settle();
    expect(intros()).toHaveLength(1);
  });

  it("plays Once At A Time when the save has already reached the Verdant Sanctum", async () => {
    await enterVerdant({ biomesReached: ["The Grounds", VERDANT], bossesDefeated: ["rootbound"] });
    expect(cueRequested("once-at-a-time")).toBe(true);
    expect(cueRequested("spring")).toBe(false);
  });

  it("plays Once At A Time without saved progress: seed races, practice and replays", async () => {
    await enterVerdant(undefined);
    expect(cueRequested("once-at-a-time")).toBe(true);
    expect(cueRequested("spring")).toBe(false);
  });
});

describe("warming the menu cue", () => {
  it("fetches its first layer before music starts, and nothing once music has started", async () => {
    const cues: LoadedCueRef[] = Object.entries(index.cues).map(([id, manifest]) => ({
      id,
      manifest,
      baseUrl: `audio/cues/${id}`,
    }));
    const early = new BiomeStemBackend(
      cues,
      validateMusicRoutingManifest(index.routing),
      parseMusicCatalog(index.catalog),
    );
    early.warmFirstLayer(early.menuCueId);
    expect(cueRequested(early.menuCueId)).toBe(true);
    dropWarmedStems();

    // The first input came before the warm-up: the cue is already fetching its own stems.
    const { backend } = await backendFor(undefined);
    await settle();
    requested.length = 0;
    backend.warmFirstLayer(backend.menuCueId);
    expect(requested).toEqual([]);
  });
});
