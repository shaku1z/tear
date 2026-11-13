import type { RunMode } from "./session";
import { bossIdsAvailableOn } from "../stages";
import type { SurfaceAvailability, SurfaceChannel } from "../../domain/surface-availability";

/**
 * The authored lifecycle family for a published run mode. This is deliberately
 * smaller than the runtime planner surface: it describes the mode for data
 * consumers without exporting planner functions or debug-only flags.
 */
export type ModeClassification = "campaign" | "endless" | "gauntlet" | "training" | "boss-only" | "sandbox";

export interface ModeDefinition {
  readonly id: RunMode;
  /** Zero-based authored order; this is not a runtime priority. */
  readonly order: number;
  readonly label: string;
  readonly blurb: string;
  readonly enabled: boolean;
  readonly classification: ModeClassification;
  readonly training: boolean;
  readonly bossOnly: boolean;
  readonly sandbox: boolean;
  /**
   * Release modes are offered to players; engineering modes (Boss Test, Enemy
   * Test) remain in the catalog for test builds, replays and scripts only.
   */
  readonly surface: SurfaceChannel;
}

/** Exact published mode set; debug harnesses are not additional modes. */
export const MODE_IDS = Object.freeze([
  "campaign",
  "endless",
  "gauntlet",
  "playground",
  "tutorial",
  "bossonly",
  "sandbox",
] as const);

const authoredModes = [
  {
    id: "campaign",
    order: 0,
    label: "Adventure",
    blurb: "Journey through biomes — 9 waves then a boss, stage after stage, ever deeper.",
    enabled: true,
    classification: "campaign",
    training: false,
    bossOnly: false,
    sandbox: false,
    surface: "release",
  },
  {
    id: "endless",
    order: 1,
    label: "Endless",
    blurb: "Survive forever — biomes cycle, hordes swell, mini-bosses crash in. Chase your best.",
    enabled: true,
    classification: "endless",
    training: false,
    bossOnly: false,
    sandbox: false,
    surface: "release",
  },
  {
    id: "gauntlet",
    order: 2,
    label: "Gauntlet",
    blurb: `Endless, but a full boss storms in every 8 waves — cycling all ${String(bossIdsAvailableOn("gauntlet").length)}, ever tougher.`,
    enabled: true,
    classification: "gauntlet",
    training: false,
    bossOnly: false,
    sandbox: false,
    surface: "release",
  },
  {
    id: "playground",
    order: 3,
    label: "Playground",
    blurb: "An open arena — spawn any enemy, grab any ability at any tier, test everything.",
    enabled: true,
    classification: "training",
    training: true,
    bossOnly: false,
    sandbox: false,
    surface: "release",
  },
  {
    id: "tutorial",
    order: 4,
    label: "Tutorial",
    blurb: "Learn the blade: swings, slams, power slams, launches, juggles, updrafts, throws, parries.",
    enabled: true,
    classification: "training",
    training: true,
    bossOnly: false,
    sandbox: false,
    surface: "release",
  },
  {
    id: "bossonly",
    order: 5,
    label: "Boss Test",
    blurb: "Boss gauntlet — fight every boss in a row, evolving an ability after each.",
    enabled: true,
    classification: "boss-only",
    training: false,
    bossOnly: true,
    sandbox: false,
    surface: "engineering",
  },
  {
    id: "sandbox",
    order: 6,
    label: "Enemy Test",
    blurb: "Sandbox: every enemy variant spawns from wave 1 — try the full roster.",
    enabled: true,
    classification: "sandbox",
    training: false,
    bossOnly: false,
    sandbox: true,
    surface: "engineering",
  },
] satisfies readonly ModeDefinition[];

const authoredIds: readonly string[] = authoredModes.map((mode) => mode.id);
if (authoredIds.length !== MODE_IDS.length || authoredIds.some((id, index) => id !== MODE_IDS[index])) {
  throw new Error("published mode catalog changed without a reference-contract update");
}

/** The sole authored metadata source for the seven published RunMode values. */
export const MODE_CATALOG: readonly ModeDefinition[] = Object.freeze(authoredModes.map((mode) => Object.freeze(mode)));

/** Modes persisted by the standard-play progression path; test modes remain intentionally excluded. */
export const PROFILE_TRACKED_MODE_IDS: readonly RunMode[] = Object.freeze(
  MODE_CATALOG.filter((mode) => !mode.bossOnly && !mode.sandbox).map((mode) => mode.id),
);

/** Modes whose natural run lifecycle owns campaign-style wave actors. */
export const WAVE_OWNING_MODE_IDS: readonly RunMode[] = Object.freeze(
  MODE_CATALOG.filter(
    (mode) =>
      mode.classification === "campaign" || mode.classification === "endless" || mode.classification === "gauntlet",
  ).map((mode) => mode.id),
);

export function modeOwnsWaveActors(mode: RunMode): boolean {
  return WAVE_OWNING_MODE_IDS.includes(mode);
}

export function tracksModeProgress(mode: RunMode): boolean {
  return PROFILE_TRACKED_MODE_IDS.includes(mode);
}

/** The surface channel that owns a run mode. */
export function modeSurface(mode: RunMode): SurfaceChannel {
  return MODE_CATALOG.find((definition) => definition.id === mode)?.surface ?? "engineering";
}

/** The release mode a refused engineering mode falls back to (the default setup selection). */
export const RELEASE_FALLBACK_MODE: RunMode = "endless";

/**
 * Admits a requested run mode under the build's surface policy. An engineering
 * mode requested in a release build (for example a stale Boss Test selection)
 * starts the release fallback instead of the engineering harness.
 */
export function admittedRunMode(mode: RunMode, surfaces: Pick<SurfaceAvailability, "admits">): RunMode {
  return surfaces.admits(modeSurface(mode)) ? mode : RELEASE_FALLBACK_MODE;
}
