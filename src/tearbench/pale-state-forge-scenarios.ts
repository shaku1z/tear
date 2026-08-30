import { createAuroraTrackFieldState } from "../gameplay/environment/aurora-track";
import { forgeEnvironmentFieldState, forgeWaveState } from "./state-forge-factories";
import type { TearSdlDocumentV1 } from "./tearsdl";

const PALE_SURGICAL_BASE: TearSdlDocumentV1 = Object.freeze({
  format: "tearsdl", schemaVersion: 1, id: "pale-surgical-base", stateClass: "surgical-valid",
  seed: "pale-surgical-base",
  start: Object.freeze({ mode: "playground", difficulty: "normal", weapon: "sword", stage: "pale-traverse", wave: 41 }),
  tags: Object.freeze(["pale-traverse", "state-forge", "engineering-only", "non-publishable", "pt3-c10"]),
});

/** Surgical stage-owned Aurora lane at the frozen Pale engineering wave coordinate. */
export const PALE_AURORA_TRACK_FORGE_TEARSDL = forgeEnvironmentFieldState(
  PALE_SURGICAL_BASE,
  createAuroraTrackFieldState({
    id: "pale-traverse:aurora-track:surgical-east", ownerId: "pale-traverse", variant: "stage",
    direction: 1, geometry: { x: 120, y: 650, w: 1_360, h: 80 }, startTick: 4_800,
    patternId: "surgical-east",
  }),
);

/** Surgical three-member Rimehound pack, bounded by the production Pale composition cap. */
export const PALE_RIMEHOUND_PACK_FORGE_TEARSDL = forgeWaveState(
  PALE_SURGICAL_BASE, 41, [{ kind: "rimehound", count: 3 }],
);

export interface PaleVariantStateForgeScenario {
  readonly id: string;
  readonly family: "charger" | "ranged" | "flyer" | "bomber" | "armored";
  readonly variantId: "rime-runner" | "prism-seer" | "snowfall-kite" | "hailcaster" | "glacier-guard";
  readonly seed: string;
}

/** Production checkpoint/restore cases consumed by the existing variant State Forge matrix. */
export const PALE_VARIANT_STATE_FORGE_SCENARIOS: readonly PaleVariantStateForgeScenario[] = Object.freeze([
  { id: "pale-rime-runner-state-forge", family: "charger", variantId: "rime-runner", seed: "pale-rime-runner-restore" },
  { id: "pale-prism-seer-state-forge", family: "ranged", variantId: "prism-seer", seed: "pale-prism-seer-restore" },
  { id: "pale-snowfall-kite-state-forge", family: "flyer", variantId: "snowfall-kite", seed: "pale-snowfall-kite-restore" },
  { id: "pale-hailcaster-state-forge", family: "bomber", variantId: "hailcaster", seed: "pale-hailcaster-restore" },
  { id: "pale-glacier-guard-state-forge", family: "armored", variantId: "glacier-guard", seed: "pale-glacier-guard-restore" },
]);

function whiteHartPhase(
  phase: 1 | 2 | 3,
  attack: "antler-run" | "ghost-tracks" | "last-crossing",
): TearSdlDocumentV1 {
  return Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: `white-hart-phase-${String(phase)}-${attack}`,
    stateClass: "surgical-valid", seed: `white-hart-phase-${String(phase)}-${attack}`,
    start: Object.freeze({ mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "white-hart", bossPhase: String(phase) }),
    state: Object.freeze({ boss: Object.freeze({ phaseMarker: phase, state: "windup", atk: attack, attackStep: 0, routeProgress: 0 }) }),
    tags: Object.freeze(["white-hart", "pale-traverse", "boss", "state-forge", "engineering-only", "non-publishable", "pt3-c10"]),
  });
}

/** One renderer-neutral surgical boundary per White Hart phase; the natural encounter remains canonical. */
export const WHITE_HART_PHASE_STATE_FORGE_SCENARIOS = Object.freeze([
  whiteHartPhase(1, "antler-run"),
  whiteHartPhase(2, "ghost-tracks"),
  whiteHartPhase(3, "last-crossing"),
] as const);
