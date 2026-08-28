import type { TearSdlDocumentV1 } from "./tearsdl";

function verdantWaveScenario(wave: 31 | 35 | 39, profile: "early" | "middle" | "late", controlBudget: number, maxRootbinders: number): TearSdlDocumentV1 {
  return Object.freeze({
    format: "tearsdl",
    schemaVersion: 1,
    id: `verdant-stage-wave-${String(wave)}-engineering`,
    stateClass: "reconstructed-reachable",
    seed: `verdant-stage-wave-${String(wave)}`,
    start: Object.freeze({
      mode: "campaign", difficulty: "normal", weapon: "sword",
      stage: "verdant-sanctum", wave,
    }),
    constraints: Object.freeze({
      legalProgression: true,
      verdantComposition: Object.freeze({ profile, localWave: wave - 30, controlBudget, maxRootbinders }),
    }),
    tags: Object.freeze([
    "verdant-sanctum",
    "stage",
    "wave-composition",
    "state-forge",
    "engineering-only",
    "non-publishable",
    "c15",
    ]),
    maxTicks: 1_440,
  });
}

/** Engineering-only early/middle/late State Forge entry points for the C15 wave slice. */
export const VERDANT_WAVE_ENGINEERING_TEARSDL = Object.freeze([
  verdantWaveScenario(31, "early", 0, 0),
  verdantWaveScenario(35, "middle", 5, 1),
  verdantWaveScenario(39, "late", 9, 2),
] as const);

/** Stable C8 compatibility name for the natural Verdant entry scenario. */
export const VERDANT_STAGE_ENGINEERING_TEARSDL = VERDANT_WAVE_ENGINEERING_TEARSDL[0];
