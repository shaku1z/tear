import type { SeedRaceRun } from "../gameplay/run/seed-locked-draft";
import { stableVerificationHash } from "../domain/hash";
import type { GhostRunAssistance } from "../gameplay/run/ghost-assistance";
import type { GhostReplayBuildFingerprint } from "./replay-admission";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";

export interface GhostReferenceBoundary {
  readonly tick: number;
  readonly time: number;
  readonly stage: number;
  readonly wave: number;
  readonly event: "start" | "clear";
}
/** Capture the actual owner frontier at emission, before another transition can load a stage. */
export function ghostReferenceBoundary(
  event: TearGameplayEvent,
  frontier: Readonly<{ time: number; stage: number }>,
): GhostReferenceBoundary | undefined {
  if (event.kind !== "wave" || !["start", "boss", "clear", "cleared"].includes(event.event)) return undefined;
  return Object.freeze({
    tick: event.tick,
    time: frontier.time,
    stage: frontier.stage,
    wave: event.wave,
    event: event.event === "start" || event.event === "boss" ? "start" : "clear",
  });
}

export interface GhostReferenceFrame {
  readonly tick: number;
  readonly time: number;
  readonly stage: number;
  readonly wave: number;
  readonly score: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly waveTime: number;
  readonly arena: string;
  readonly blocked: boolean;
  readonly player: Readonly<{ x: number; y: number; hw: number; hh: number; facing: number }>;
  readonly blade: Readonly<{ x: number; y: number; tipX: number; tipY: number; state: string }>;
}
export interface GhostLiveReference {
  readonly seedRace?: SeedRaceRun;
  readonly version: 1;
  readonly assistance: GhostRunAssistance;
  readonly build: GhostReplayBuildFingerprint;
  readonly mode: string;
  readonly difficulty: string;
  readonly weapon: string;
  readonly seed: string;
  readonly frames: readonly GhostReferenceFrame[];
  readonly splits: readonly GhostReferenceBoundary[];
}
export interface GhostChaseView {
  readonly raceRole?: "reference" | "challenger";
  readonly active: boolean;
  readonly visible: boolean;
  readonly message: string;
  readonly source?: string;
  readonly actor?: string;
  readonly pose?: GhostReferenceFrame;
  readonly score?: number;
  readonly hp?: number;
  readonly ownHp?: string;
  readonly referenceHp?: string;
  readonly wave?: number;
  readonly time?: number;
  readonly split?: string;
}
export function ghostReferenceArena(platforms: readonly unknown[]): string {
  return stableVerificationHash(
    platforms.map((value) => {
      if (typeof value !== "object" || value === null) throw new TypeError("Reference platform unavailable");
      const p = value as Record<string, unknown>;
      if ([p.x, p.y, p.w, p.h].some((n) => typeof n !== "number" || !Number.isFinite(n)))
        throw new TypeError("Reference platform geometry invalid");
      return { x: p.x, y: p.y, w: p.w, h: p.h };
    }),
  );
}
