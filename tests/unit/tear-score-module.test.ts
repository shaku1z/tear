import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPinnedModuleTearScoreClient,
  TEAR_SCORE_PROVENANCE,
  type TearScoreModuleApi,
} from "../../src/audio/tear-score-module";
import {
  BrowserAudioGraphContext,
  BrowserAudioNodePort,
} from "../../src/audio/browser-audio";
import type { MusicContextSnapshot } from "../../src/audio/music-contracts";

function context(sequence: number): MusicContextSnapshot {
  return {
    schemaVersion: 1,
    sequence,
    timeMs: sequence * 125,
    scene: "combat",
    modeId: "endless",
    difficultyId: "normal",
    biomeId: "The Grounds",
    stageId: "0",
    wave: 2,
    totalWaves: 0,
    waveActive: true,
    liveEnemies: 3,
    queuedEnemies: 2,
    projectileCount: 4,
    bossActive: false,
    bossId: null,
    bossPhase: null,
    playerHealthRatio: 0.75,
    comboGauge: 0.4,
    comboMultiplier: 2,
    comboRankId: "SHARP",
    playerMoving: true,
  };
}

interface ApiObservation {
  readonly seeds: (string | undefined)[];
  starts: number;
  disposals: number;
}

function fakeApi(updates: unknown[], observation: ApiObservation): TearScoreModuleApi {
  return {
    initialize: (options) => {
      observation.seeds.push(options.seed);
      return Promise.resolve();
    },
    start: () => {
      observation.starts += 1;
      return Promise.resolve();
    },
    updateContext: (snapshot) => { updates.push(snapshot); },
    setMuteReason: () => undefined,
    dispose: () => {
      observation.disposals += 1;
      return Promise.resolve();
    },
  };
}

function fakeHost() {
  const rawNode = {} as AudioNode;
  const rawContext = {
    destination: rawNode,
    currentTime: 0,
    state: "running",
  } as unknown as AudioContext;
  return {
    audioContext: new BrowserAudioGraphContext(rawContext),
    outputNode: new BrowserAudioNodePort(rawNode),
    quality: "high" as const,
  };
}

describe("pinned TearScore ESM adapter", () => {
  it("maps snapshots and delivers semantic events immediately across repeated runs", async () => {
    const updates: unknown[] = [];
    const observations: ApiObservation[] = [];
    const createApi = () => {
      const observation = { seeds: [], starts: 0, disposals: 0 };
      observations.push(observation);
      return fakeApi(updates, observation);
    };
    const api = createApi();
    const client = createPinnedModuleTearScoreClient(api, createApi);
    await client.initialize(fakeHost());
    const first = { runId: "run-one", runSeed: "1", rulesetVersion: "rules", gameVersion: "game", scoreVersion: "score" };
    await client.beginRun(first);
    client.updateContext(context(1));
    client.emitEvent({ type: "perfect-parry", eventId: "p1", timeMs: 126, weaponId: "sword" });
    client.emitEvent({ type: "boss-entered", eventId: "b1", timeMs: 127, bossId: "warden" });
    expect(updates).toHaveLength(3);
    expect(updates[0]).toMatchObject({ screen: "playing", liveEnemies: 3, player: { comboRank: "SHARP" } });
    expect(updates[1]).toMatchObject({ player: { comboGauge: 1 } });
    expect(updates[2]).toMatchObject({ boss: { active: true, id: "warden" } });

    await client.endRun();
    const second = { ...first, runId: "run-two", runSeed: "2" };
    await client.beginRun(second);
    client.updateContext(context(2));
    const replay = client.replayMetadata();
    expect(replay).toMatchObject({
      enabled: true,
      engineVersion: TEAR_SCORE_PROVENANCE.version,
      scoreVersion: "score",
      seed: "2",
    });
    expect(replay.enabled && replay.eventJournalHash).toMatch(/^[0-9a-f]{8}$/u);
    expect(observations.map(({ seeds }) => seeds)).toEqual([["tear-menu"], ["1"], ["2"]]);
    expect(observations.map(({ starts }) => starts)).toEqual([0, 1, 1]);
    expect(observations.slice(0, 2).map(({ disposals }) => disposals)).toEqual([1, 1]);
  });

  it("records hashes that exactly match the vendored release", async () => {
    const root = resolve(import.meta.dirname, "../..");
    const [bundle, tone, manifestText] = await Promise.all([
      readFile(resolve(root, "public/vendor/tear-score/tear-score.esm.js")),
      readFile(resolve(root, "public/vendor/tear-score/tone-host-14.9.17.esm.js")),
      readFile(resolve(root, "public/vendor/tear-score/upstream-manifest.json"), "utf8"),
    ]);
    const manifest = JSON.parse(manifestText) as Record<string, string>;
    expect(createHash("sha256").update(bundle).digest("hex")).toBe(TEAR_SCORE_PROVENANCE.bundleSha256);
    expect(createHash("sha256").update(tone).digest("hex")).toBe(TEAR_SCORE_PROVENANCE.toneSha256);
    expect(bundle.toString("utf8")).toContain("export{");
    expect(bundle.toString("utf8")).not.toContain("globalThis.Tone");
    expect(bundle.toString("utf8")).toContain("this.composer?.reset(),this.rack?.dispose()");
    expect(manifest).toMatchObject({
      engineRepository: TEAR_SCORE_PROVENANCE.engineRepository,
      engineCommit: TEAR_SCORE_PROVENANCE.engineCommit,
      version: TEAR_SCORE_PROVENANCE.version,
      artifactFormat: "esm",
      bundleSha256: TEAR_SCORE_PROVENANCE.bundleSha256,
      toneVersion: TEAR_SCORE_PROVENANCE.toneVersion,
      compatibilityPatches: ["composer-reset-before-rack-dispose"],
    });
  });
});
