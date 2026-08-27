import type { TearSdlDocumentV1 } from "./tearsdl";

/** Engineering-only exact entry point for the C8 Verdant stage slice. */
export const VERDANT_STAGE_ENGINEERING_TEARSDL: TearSdlDocumentV1 = Object.freeze({
  format: "tearsdl",
  schemaVersion: 1,
  id: "verdant-stage-wave-31-engineering",
  stateClass: "reconstructed-reachable",
  seed: "verdant-stage-wave-31",
  start: Object.freeze({
    mode: "campaign",
    difficulty: "normal",
    weapon: "sword",
    stage: "verdant-sanctum",
    wave: 31,
  }),
  constraints: Object.freeze({ legalProgression: true }),
  tags: Object.freeze([
    "verdant-sanctum",
    "stage",
    "state-forge",
    "engineering-only",
    "non-publishable",
    "c8",
  ]),
  maxTicks: 1_440,
});
