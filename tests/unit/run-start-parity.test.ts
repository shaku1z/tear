/**
 * The live run start and the detached run start build the same world. The live host
 * (createLiveRunStartHost: its own start choices from saved progress and settings, its hooks and its
 * outward steps) starts a run on a detached world that has already played, through the detached world's
 * stage, content and reward ports; a fresh detached world starts from the start choices a replay
 * records. Both worlds must hash the same at the start and on every tick after it.
 *
 * The browser's own ports (its stage, wave and reward services) are covered by the browser evidence
 * that verifies a live run from its seed (PR 5b-3 in plans/active/REPLAY_OVERHAUL_PLAN.md).
 */
import { describe, expect, it } from "vitest";

import { createLiveRunStartHost } from "../../src/app/run/run-start-host";
import { detachedRunStartWorld } from "../../src/app/world/detached/detached-run-start";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
} from "../../src/app/world/detached/replay-composition";
import { emptyCosmeticState } from "../../src/domain/cosmetics";
import { stableVerificationHash } from "../../src/domain/hash";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";
import type { CinematicPreference } from "../../src/gameplay/campaign/cinematic-preference";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { scenarioRunSeed, type SavedRunStart } from "../../src/gameplay/run/run-start-choices";
import type { RunDifficulty, RunMode } from "../../src/gameplay/run/session";
import { resolveDiscoveredVariantIds } from "../../src/gameplay/variants";
import { createCosmeticWardrobe } from "../../src/presentation/cosmetic-styles";

interface StartCase {
  readonly id: string;
  readonly mode: RunMode;
  readonly weapon: string;
  readonly difficulty: RunDifficulty;
  readonly boss: string;
  /** The player's META shop ranks, zeros included: a run starts with only the ranks above zero. */
  readonly ranks: Readonly<Record<string, number>>;
  readonly biomes: readonly string[];
  readonly achievements: readonly string[];
  readonly restoredTrail: boolean;
  readonly cinematics: CinematicPreference;
  readonly playedChapters: readonly number[];
}

const CASES: readonly StartCase[] = [
  {
    id: "Endless with META ranks, a head start and Verdant variants",
    mode: "endless",
    weapon: "hammer",
    difficulty: "normal",
    boss: "shuffle",
    ranks: { headstart: 2, tough: 1, reach: 3, greed: 0 },
    biomes: ["The Verdant Sanctum"],
    achievements: ["firstBlood"],
    restoredTrail: true,
    cinematics: "full",
    playedChapters: [],
  },
  {
    id: "Boss Rush against a chosen boss",
    mode: "bossonly",
    weapon: "sword",
    difficulty: "hard",
    boss: "warden",
    ranks: { swift: 2 },
    biomes: [],
    achievements: [],
    restoredTrail: false,
    cinematics: "full",
    playedChapters: [],
  },
  {
    id: "Campaign with cinematics off after a played chapter",
    mode: "campaign",
    weapon: "chainblade",
    difficulty: "easy",
    boss: "shuffle",
    ranks: {},
    biomes: [],
    achievements: [],
    restoredTrail: false,
    cinematics: "off",
    playedChapters: [0],
  },
  {
    id: "Gauntlet trials with Verdant variants",
    mode: "gauntlet",
    weapon: "riftlock",
    difficulty: "normal",
    boss: "shuffle",
    ranks: { thickskin: 1 },
    biomes: ["verdant-sanctum"],
    achievements: [],
    restoredTrail: false,
    cinematics: "full",
    playedChapters: [],
  },
];

const TICKS = 180;
const nothing = (): undefined => undefined;

/** A detached world that has played a few seconds of another run, as the live world has before a new one. */
function usedWorld(start: StartCase) {
  // The chapters this session has played belong to the session, not to the run that ends.
  const used = createProductionGhostReplayComposition({
    runSeed: scenarioRunSeed("run-start-parity:previous-run"),
    mode: "endless",
    weaponId: "greatsword",
    saved: { playedChapters: start.playedChapters },
  }).create(undefined);
  for (let tick = 0; tick < 90; tick += 1) used.simulation.advanceOne([]);
  return used;
}

/** Starts `start` on a used detached world through the live run start host. */
function liveStart(start: StartCase, runSeed: number) {
  const used = usedWorld(start);
  const { replay, waveReward } = used;
  const base = detachedRunStartWorld({ replay, waveReward, combat: used.combat, resetChapter: nothing });
  const context = {
    ...base,
    dependencies: {
      ...base.dependencies,
      surfaces: createSurfaceAvailability("release"),
      PROFILE: {
        data: {
          stats: { _biomes: Object.fromEntries(start.biomes.map((biome) => [biome, 1])) },
          ach: Object.fromEntries(start.achievements.map((id) => [id, true])),
          rewards: { restoredBladeTrail: start.restoredTrail },
        },
        cosmetics: emptyCosmeticState,
        markMode: nothing,
        maxStat: nothing,
      },
      META: { level: (id: string) => start.ranks[id] ?? 0 },
      COSMETICS: createCosmeticWardrobe(COSMETIC_CATALOG, () => false),
      GHOST: { recording: () => false, startRec: nothing, stopRec: nothing },
      Input: { startSemanticRecording: nothing, syncSemanticMovement: nothing, stopSemanticRecording: nothing },
      SFX: { setVoidDescent: nothing, setMusicDuck: nothing, musicScoreVersion: () => "parity" },
    },
    world: {
      ...replay.world,
      state: { ...replay.world.state, selectedWeapon: () => start.weapon, setSelectedWeapon: nothing },
    },
    createRunSeed: () => runSeed,
    selectedBoss: () => start.boss,
    cinematics: { preference: () => start.cinematics, playedChapters: () => start.playedChapters },
    applySettings: nothing,
    install: nothing,
    setScreen: () => {
      waveReward.restoreScreen("playing");
    },
    achievementTracking: () => false,
    achievementCheck: nothing,
    music: { begin: nothing },
    requestPointerLock: nothing,
    testMode: false,
    window: {},
  } as unknown as Parameters<typeof createLiveRunStartHost>[0];
  createLiveRunStartHost(context).start(start.mode, start.difficulty);
  return used;
}

/** Starts `start` in a fresh detached world from the choices a replay records. */
function detachedStart(start: StartCase, runSeed: number) {
  const saved: SavedRunStart = {
    metaRanks: Object.fromEntries(Object.entries(start.ranks).filter(([, rank]) => rank > 0)),
    variantDiscovery: resolveDiscoveredVariantIds(start.mode, start.biomes),
    achievementSnapshot: start.achievements,
    restoredTrail: start.restoredTrail,
    cinematics: start.cinematics,
    playedChapters: start.playedChapters,
  };
  return createProductionGhostReplayComposition({
    runSeed,
    mode: start.mode,
    weaponId: start.weapon,
    difficulty: start.difficulty,
    firstBoss: start.boss,
    saved,
  }).create(undefined);
}

describe("one run start for live play and detached worlds", () => {
  it.each(CASES)("$id: the live host and a detached world start the same world", (start) => {
    const runSeed = scenarioRunSeed(`run-start-parity:${start.id}`);
    const live = liveStart(start, runSeed);
    const detached = detachedStart(start, runSeed);
    const capture = (world: typeof live) =>
      captureProductionReplayCheckpoint(world.replay, world.combat, world.waveReward, "run-start-parity");
    expect(live.replay.world.state.run()).toEqual(detached.replay.world.state.run());
    expect(capture(live).semanticHash).toBe(capture(detached).semanticHash);
    for (let tick = 1; tick <= TICKS; tick += 1) {
      const liveState = stableVerificationHash(live.simulation.advanceOne([]).state);
      const detachedState = stableVerificationHash(detached.simulation.advanceOne([]).state);
      expect(liveState, `tick ${String(tick)}`).toBe(detachedState);
    }
    expect(capture(live).semanticHash).toBe(capture(detached).semanticHash);
  });
});
